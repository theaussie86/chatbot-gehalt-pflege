# Phase 1: Database & Storage Foundation - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Database schema and storage bucket are correctly configured with secure RLS policies that allow the edge function to insert chunks. This phase fixes P0-blocking bugs: service role NULL uid issue, missing error_message column, and cascade configuration. No new features — this is foundation repair.

</domain>

<decisions>
## Implementation Decisions

### RLS Policy Approach
- Bypass RLS for service role (default Supabase behavior) — ensure policies don't accidentally block it
- Full audit of all existing RLS policies across the schema, not just document_chunks
- Verify fixes work via SQL console tests running as service role
- Keep using default service role, no custom edge_function role needed

### Schema Migration Strategy
- Single migration file containing all Phase 1 changes (RLS fixes, error_message column, cascade setup)
- No existing production data in document_chunks — table can be safely modified
- Apply migrations via Supabase MCP tool (apply_migration) for tracked, versioned changes
- No rollback migration needed — changes are additive/safe, fix forward if issues arise

### Error Message Storage
- Structured JSON format in JSONB column (not plain text)
- JSON structure: `{ code: string, message: string, timestamp: string }`
- Sanitize errors for display — store clean, user-friendly messages; log raw errors separately
- Column name: likely `error_details` (JSONB) to distinguish from simple text field

### Cascade Behavior
- Hard delete — DELETE removes document row completely, cascades to chunks via foreign key
- Block delete if document status is "processing" — return error to user
- Storage file deletion cascades with document deletion
- Implement cascade via application code (delete service), not database trigger — simpler, easier to debug

### Claude's Discretion
- Exact RLS policy syntax and structure
- Migration file naming convention
- Error code taxonomy (which codes to define)
- How to detect "processing" status for delete blocking

</decisions>

<specifics>
## Specific Ideas

- Service role bypasses RLS by default in Supabase — the issue is likely policies with JOIN conditions or explicit auth.uid() checks that fail for NULL
- Error JSON should be queryable for future admin dashboards (e.g., "show all documents with EMBEDDING_FAILED code")
- Delete blocking prevents orphaned edge function executions writing to deleted documents

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-database-storage-foundation*
*Context gathered: 2026-01-23*
