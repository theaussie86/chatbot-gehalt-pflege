# Phase 1: Database & Storage Foundation - Research

**Researched:** 2026-01-23
**Domain:** Supabase RLS policies, PostgreSQL schema design, JSONB error storage
**Confidence:** HIGH

## Summary

This research covers the database and RLS fixes needed for Phase 1. The core issue is that the edge function uses the service role key to insert into `document_chunks`, but RLS policies on that table contain `auth.uid()` checks that evaluate to NULL for service role connections. While service role **should** bypass RLS entirely, the current implementation may have auth header contamination or the policies are being evaluated despite bypass.

The solution is straightforward: verify service role bypass is working correctly, and if needed, explicitly allow service role in policies or disable RLS for service role operations. The schema changes (error_details column, cascade verification) are additive and low-risk.

**Primary recommendation:** Verify service role RLS bypass is working; if not, use `auth.jwt()->>'role' = 'service_role'` check in policies or ensure client is created without auth header contamination.

## Standard Stack

The established tools and patterns for this domain:

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Supabase | 2.x | Database client with RLS | Project standard, service role key bypasses RLS |
| PostgreSQL | 15+ | Database with JSONB, pgvector | Supabase-managed, native JSON support |

### SQL Patterns
| Pattern | Purpose | When to Use |
|---------|---------|-------------|
| `ON DELETE CASCADE` | Auto-delete child rows | Foreign keys where children cannot exist without parent |
| `JSONB` column | Structured error storage | When error details need querying/indexing |
| `SECURITY DEFINER` functions | Bypass caller's permissions | When functions need elevated access |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| JSONB error column | TEXT column | Simpler but not queryable; JSONB preferred per CONTEXT.md decision |
| DB CASCADE | Application code delete | More control but more code; FK CASCADE is simpler for Phase 1 |
| RLS policy fixes | Disable RLS on document_chunks | Would work but reduces security; prefer fixing policies |

## Architecture Patterns

### Current Schema Structure
```
documents (parent)
├── id (PK)
├── project_id (FK → projects, ON DELETE CASCADE)
├── status (enum: pending, processing, embedded, error)
└── [error_details - TO BE ADDED: JSONB]

document_chunks (child)
├── id (PK)
├── document_id (FK → documents, ON DELETE CASCADE) ✓ Already exists
├── chunk_index
├── content
├── embedding
└── token_count
```

### Pattern 1: Service Role RLS Bypass
**What:** Service role key should bypass all RLS policies automatically
**When to use:** Edge functions that need unrestricted database access
**Verification:**
```sql
-- Check if client is actually using service role
SELECT auth.jwt()->>'role' AS current_role;
-- Should return 'service_role' if configured correctly

-- Test bypass directly
SET ROLE service_role;
INSERT INTO document_chunks (...) VALUES (...);
-- Should succeed without RLS evaluation
```

**Key insight from Supabase docs:** "A Supabase client with the Authorization header set to the service role API key will ALWAYS bypass RLS." If it's not bypassing, the auth header is being overwritten by a user JWT.

### Pattern 2: JSONB Error Details Column
**What:** Structured error storage for queryable error reporting
**Schema:**
```sql
ALTER TABLE documents
ADD COLUMN error_details JSONB;

-- Example error structure (from CONTEXT.md decision)
{
  "code": "EMBEDDING_FAILED",
  "message": "Failed to generate embeddings for document",
  "timestamp": "2026-01-23T10:30:00Z"
}
```

**Why JSONB over TEXT:**
- Queryable: `WHERE error_details->>'code' = 'EMBEDDING_FAILED'`
- Indexable: Can add GIN index for fast error code lookups
- Structured: Enforces consistent error format

### Pattern 3: Explicit Service Role Policy Check
**What:** If service role bypass isn't working, add explicit check to policies
**When to use:** Fallback if standard bypass fails
```sql
-- Add to INSERT policy WITH CHECK clause
CREATE POLICY "Allow service role inserts"
  ON document_chunks FOR INSERT
  WITH CHECK (
    -- Service role can always insert
    auth.jwt()->>'role' = 'service_role'
    OR
    -- Existing user permission checks
    EXISTS (SELECT 1 FROM documents WHERE ...)
  );
```

### Anti-Patterns to Avoid
- **Disabling RLS entirely:** Removes security for all operations
- **Hardcoding service role check without fallback:** Breaks when users need to insert
- **Using `auth.uid()` directly in service role context:** Always NULL, causes silent failures
- **Relying on NULL checks:** `auth.uid() IS NULL` matches anonymous users too

## Don't Hand-Roll

Problems that look simple but have existing solutions:

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cascade deletes | Application loop deleting chunks | FK `ON DELETE CASCADE` | Already exists in schema, atomic, handles edge cases |
| RLS bypass | Custom role or function | Service role key | Supabase built-in, well-tested |
| Error JSON validation | Custom parsing | JSONB constraints or app validation | PostgreSQL validates JSON syntax automatically |
| Migration versioning | Manual SQL execution | Supabase migrations with timestamps | Tracked, reversible, CI-friendly |

**Key insight:** The `document_chunks` table already has `ON DELETE CASCADE` defined (verified in migration `20260115120000_init_rag_pipeline.sql`, line 59). No schema change needed for DB-01.

## Common Pitfalls

### Pitfall 1: Auth Header Contamination
**What goes wrong:** Service role client has auth header overwritten by user JWT, causing RLS to evaluate as that user
**Why it happens:** SSR clients share cookies; edge functions may pass user JWT in headers
**How to avoid:** Create service role client without any auth header override
```typescript
// CORRECT: Clean service role client
const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  // Do NOT pass options.auth or options.global.headers with Authorization
);
```
**Warning signs:** RLS errors despite using service role key; `auth.uid()` returns a value instead of NULL

### Pitfall 2: Policy Evaluation Order
**What goes wrong:** Multiple overlapping policies evaluated in unexpected order
**Why it happens:** PostgreSQL evaluates all applicable policies, not just the first match
**How to avoid:** Ensure policies are mutually exclusive or use OR logic within single policy
**Warning signs:** Policy works for some users but not others; inconsistent behavior

### Pitfall 3: JSONB NULL vs Empty Object
**What goes wrong:** Checking `error_details IS NULL` misses `{}`
**Why it happens:** Empty JSONB object `{}` is not NULL
**How to avoid:** Check both: `error_details IS NULL OR error_details = '{}'::jsonb`
**Warning signs:** "No errors" query returns false positives

### Pitfall 4: Migration Naming Collision
**What goes wrong:** Two migrations with same timestamp applied in wrong order
**Why it happens:** Timestamp granularity to seconds; fast generation
**How to avoid:** Use unique timestamps; wait 1 second between migrations if scripted
**Warning signs:** Migrations applied out of order; constraint violations

## Code Examples

### Migration: Add error_details Column
```sql
-- Source: PostgreSQL JSONB documentation
-- File: 20260123XXXXXX_add_error_details.sql

-- Add JSONB column for structured error storage
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Optional: Add comment for documentation
COMMENT ON COLUMN documents.error_details IS
  'Structured error information: {code, message, timestamp}';

-- Optional: Add GIN index for error code queries (if frequent)
-- CREATE INDEX idx_documents_error_code
--   ON documents USING GIN ((error_details->'code'));
```

### Verify Cascade Delete
```sql
-- Source: PostgreSQL constraints documentation
-- Test that cascade is working (run in SQL console)

-- 1. Create test document
INSERT INTO documents (id, filename, storage_path, status, project_id)
VALUES ('test-cascade-id', 'test.pdf', 'test/path', 'pending', NULL)
RETURNING id;

-- 2. Create test chunk
INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
VALUES ('test-cascade-id', 0, 'test', '[0.1,0.2,...]'::vector);

-- 3. Delete document - chunk should cascade
DELETE FROM documents WHERE id = 'test-cascade-id';

-- 4. Verify chunk is gone
SELECT * FROM document_chunks WHERE document_id = 'test-cascade-id';
-- Should return 0 rows
```

### RLS Policy Fix (if bypass not working)
```sql
-- Source: Supabase RLS documentation
-- Only needed if service_role bypass is not working

-- Drop existing policy
DROP POLICY IF EXISTS "Admins can insert chunks" ON document_chunks;

-- Create policy with explicit service role check
CREATE POLICY "Service role and admins can insert chunks"
  ON document_chunks FOR INSERT
  TO authenticated, service_role  -- Include service_role role
  WITH CHECK (
    -- Service role always allowed (fallback if bypass fails)
    auth.jwt()->>'role' = 'service_role'
    OR
    -- User permission checks
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND (
        (documents.project_id IS NULL AND is_global_admin())
        OR (documents.project_id IS NOT NULL
            AND has_project_role(documents.project_id, ARRAY['admin', 'editor']))
        OR is_global_admin()
      )
    )
  );
```

### Verify RLS Bypass
```sql
-- Source: Supabase troubleshooting docs
-- Run this to check what role the current session is using

SELECT
  current_user,
  session_user,
  auth.uid() as auth_uid,
  auth.jwt()->>'role' as jwt_role,
  auth.jwt()->>'aud' as jwt_audience;

-- Expected for service role:
-- auth_uid: NULL
-- jwt_role: 'service_role'
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| TEXT error column | JSONB error_details | Best practice 2023+ | Queryable, indexable errors |
| Application cascade | DB `ON DELETE CASCADE` | Always preferred | Atomic, no orphans |
| Disable RLS for service | Service role bypass | Supabase default | Security maintained |

**Deprecated/outdated:**
- Manual foreign key cleanup: Use CASCADE instead
- Separate error_message and error_code columns: Single JSONB is cleaner

## Open Questions

Things that couldn't be fully resolved:

1. **Is service role bypass actually failing?**
   - What we know: Edge function uses service role key; chunks not inserted; no errors logged
   - What's unclear: Whether the issue is RLS, API response parsing, or MIME type (per pitfall research)
   - Recommendation: Add logging before INSERT to confirm data is valid; check `auth.jwt()->>'role'` in edge function

2. **Should we add GIN index on error_details?**
   - What we know: JSONB columns can be indexed for fast queries
   - What's unclear: Query patterns for error dashboard not yet defined
   - Recommendation: Defer index to Phase 3 when query patterns are known

## Sources

### Primary (HIGH confidence)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security) - Service role bypass behavior
- [Supabase Troubleshooting: Service Role RLS](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z) - Auth header contamination patterns
- [Supabase Cascade Deletes](https://supabase.com/docs/guides/database/postgres/cascade-deletes) - FK cascade syntax
- [PostgreSQL JSONB Documentation](https://www.postgresql.org/docs/current/datatype-json.html) - JSONB best practices

### Secondary (MEDIUM confidence)
- [Supabase GitHub Discussion #15631](https://github.com/orgs/supabase/discussions/15631) - Edge function RLS patterns
- [AWS PostgreSQL JSON Best Practices](https://aws.amazon.com/blogs/database/postgresql-as-a-json-database-advanced-patterns-and-best-practices/) - JSONB column patterns

### Tertiary (LOW confidence)
- Existing migration files in project - May not reflect current live schema

## Metadata

**Confidence breakdown:**
- RLS service role bypass: HIGH - Official Supabase documentation confirms behavior
- JSONB error column: HIGH - Well-documented PostgreSQL feature
- Cascade already exists: HIGH - Verified in migration file 20260115120000
- Policy fix syntax: MEDIUM - Pattern from docs, not tested in this specific schema

**Research date:** 2026-01-23
**Valid until:** 2026-02-23 (stable domain, 30-day validity)

---

## Implementation Checklist for Planner

Based on research, the planner should create tasks for:

1. **Verify cascade delete** (DB-01) - Already configured in schema, just needs verification test
2. **Fix or verify RLS policies** (DB-02) - Either confirm bypass works or add explicit service role check
3. **Add error_details JSONB column** (DB-03) - Simple ALTER TABLE, single migration
4. **Verify storage bucket exists** - Check `project-files` bucket configuration

**Migration file naming:** `20260123XXXXXX_phase1_foundation.sql` following Supabase convention.

**Blocked by nothing** - This is a foundation phase with no dependencies.
