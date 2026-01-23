# Pitfalls Research

**Research Date:** 2026-01-23
**Domain:** Document Processing Pipeline (Supabase Edge Functions + Google GenAI Embeddings)

---

## Critical Pitfalls

### 1. Embedding API Response Structure Assumptions

**What goes wrong:**
The Google GenAI SDK's `embedContent()` response structure varies between SDK versions, leading to silent failures when accessing `embeddings[0].values`. The current bug fits this pattern - code expects `result.embeddings[0].values` but the API may return `result.embedding.values` or a different structure entirely.

**Warning signs:**
- Edge function logs show successful execution but no rows appear in `document_chunks` table
- `console.log` shows `values` is `undefined` or `null`
- No error thrown, just silent data loss
- Works in development/test environment but fails in production with different SDK version

**Prevention:**
```typescript
// BAD: Assumes specific structure
const values = embedResult.embeddings?.[0]?.values;

// GOOD: Defensive with multiple fallbacks
const values =
  embedResult.embedding?.values ||           // v1.x format
  embedResult.embeddings?.[0]?.values ||     // v0.x format
  embedResult.values ||                       // Direct format
  null;

if (!values || !Array.isArray(values) || values.length === 0) {
  throw new Error(`Invalid embedding response structure: ${JSON.stringify(embedResult)}`);
}
```

**Recovery:**
- Add comprehensive logging of full API response structure before accessing nested properties
- Implement explicit type guards and validation
- Monitor embedding dimension count (should be 768 for text-embedding-004)
- Query `net._http_response` table in Supabase to check for silent errors

**Phase relevance:**
Phase 1 (Setup) and Phase 3 (Testing). Must be caught during initial integration testing and load testing phases.

**References:**
- [Embeddings | Gemini API | Google AI for Developers](https://ai.google.dev/gemini-api/docs/embeddings)
- [Get text embeddings | Vertex AI](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/embeddings/get-text-embeddings)

---

### 2. Promise.all() Batch Processing Failure Cascade

**What goes wrong:**
Using `Promise.all()` for batch embedding requests means **one failed chunk kills the entire batch**. With 100 chunks, a single rate limit error or network timeout rejects all 100 promises, losing all work and causing high memory usage.

**Warning signs:**
- Intermittent "all or nothing" behavior - either all chunks succeed or none do
- Edge function timeout errors (>60s) for large documents
- Memory issues during large document processing
- Rate limiting errors from Google API causing complete batch failure

**Prevention:**
```typescript
// BAD: One failure kills everything
const batchPromises = batch.map(async (chunk) => {
  const embedResult = await genAI.models.embedContent({...});
  return { embedding: embedResult.embeddings[0].values };
});
const results = await Promise.all(batchPromises); // 💥 One error = all fail

// GOOD: Individual error handling with Promise.allSettled
const batchPromises = batch.map(async (chunk, idx) => {
  try {
    const embedResult = await genAI.models.embedContent({...});
    return { status: 'fulfilled', value: embedResult, index: idx };
  } catch (error) {
    console.error(`Chunk ${idx} failed:`, error);
    return { status: 'rejected', reason: error, index: idx };
  }
});

const results = await Promise.allSettled(batchPromises);
const successful = results
  .filter(r => r.status === 'fulfilled' && r.value?.value)
  .map(r => r.value.value);

// Track failures for retry or manual review
const failed = results
  .filter(r => r.status === 'rejected')
  .map(r => ({ index: r.value?.index, error: r.value?.reason }));

if (failed.length > 0) {
  console.warn(`${failed.length} chunks failed, continuing with ${successful.length}`);
}
```

**Recovery:**
- Switch from `Promise.all()` to `Promise.allSettled()` immediately
- Implement partial success handling (insert successful chunks even if some fail)
- Add retry logic with exponential backoff for failed chunks
- Store failed chunk indices in document metadata for manual reprocessing

**Phase relevance:**
Phase 2 (Core Pipeline). Must be addressed before production load testing. Consider using a task queue library like `p-queue` for rate limiting.

**References:**
- [Promise queues and batching concurrent tasks in Deno | Snyk](https://snyk.io/blog/promise-queues-concurrent-tasks-deno/)
- [Promise.all() - MDN](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/all)

---

### 3. RLS Policy Mismatch Between Service Role and User Context

**What goes wrong:**
Edge function uses `SUPABASE_SERVICE_ROLE_KEY` to bypass RLS during inserts, but the RLS policies on `document_chunks` may still reference `auth.uid()` or require specific user context. The service role bypasses SELECT policies but INSERT policies with JOIN conditions can still fail silently if the parent `documents` table row isn't accessible to the service role context.

**Current code shows this exact pattern:**
```sql
-- From migration 20260121000000_rls_reset.sql
CREATE POLICY "Users can insert chunks for accessible documents"
  ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND documents.user_id = auth.uid()  -- 💥 auth.uid() is NULL for service role!
    )
  );
```

**Warning signs:**
- Edge function shows successful execution (status 200)
- `INSERT` statement returns success but row count is 0
- No error messages in logs
- Service role key is used but inserts still fail
- RLS policies reference `auth.uid()` in WITH CHECK clause

**Prevention:**
```sql
-- BAD: Assumes user context exists
CREATE POLICY "..." ON document_chunks FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM documents WHERE id = document_chunks.document_id
            AND user_id = auth.uid())  -- Fails for service role
  );

-- GOOD: Service role bypass OR user check
CREATE POLICY "..." ON document_chunks FOR INSERT
  WITH CHECK (
    -- Service role can always insert
    auth.jwt()->>'role' = 'service_role'
    OR
    -- Regular users must own the document
    EXISTS (SELECT 1 FROM documents WHERE id = document_chunks.document_id
            AND user_id = auth.uid())
  );
```

**Alternative:** Use `security definer` function owned by postgres/service_role:
```sql
CREATE OR REPLACE FUNCTION insert_chunks_batch(chunks jsonb[])
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER  -- Runs with function owner's privileges
AS $$
BEGIN
  INSERT INTO document_chunks (document_id, content, embedding, ...)
  SELECT * FROM unnest(chunks);
END;
$$;
-- Grant execute to service role only
GRANT EXECUTE ON FUNCTION insert_chunks_batch TO service_role;
```

**Recovery:**
- Check `net._http_response` table for actual error responses from edge function
- Query `pg_stat_activity` to see if INSERT was attempted
- Temporarily disable RLS on `document_chunks` to verify if it's the blocker
- Add explicit logging after INSERT to check `rowCount` from result

**Phase relevance:**
Phase 1 (Setup). Critical security misconfiguration that must be caught during initial webhook testing. Add to pre-deployment checklist.

**References:**
- [Row Level Security | Supabase Docs](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Why is my service role key getting RLS errors?](https://supabase.com/docs/guides/troubleshooting/why-is-my-service-role-key-client-getting-rls-errors-or-not-returning-data-7_1K9z)
- [Edge Functions: how to authorize the user AND bypass RLS?](https://github.com/orgs/supabase/discussions/15631)

---

### 4. Database Webhook Trigger Not Firing (pg_net Silent Failures)

**What goes wrong:**
The database trigger calls `net.http_post()` but the webhook never reaches the edge function. The hook entry appears in `supabase_functions.hooks` but is never added to `net.http_request_queue`. This happens when:
- pg_net async HTTP worker is not enabled for the region
- Missing schema permissions (`GRANT USAGE ON SCHEMA net`)
- RLS policy blocking access to net tables
- Wrong authorization header (JWT required but not provided)

**Warning signs:**
- Document status stuck at "pending" forever
- No edge function logs in Supabase dashboard despite trigger firing
- Rows in `supabase_functions.hooks` but none in `net.http_request_queue`
- `net._http_response` table empty or shows 401/403 errors
- Local development works but production doesn't

**Prevention:**
```sql
-- 1. Verify pg_net extension is enabled
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Grant network permissions to function role
GRANT USAGE ON SCHEMA net TO supabase_functions_admin;

-- 3. Ensure RLS allows SELECT for service role
CREATE POLICY "Service role can read hooks"
  ON supabase_functions.hooks FOR SELECT
  TO supabase_functions_admin
  USING (true);

-- 4. Use service role key in authorization header (not anon key)
CREATE OR REPLACE FUNCTION trigger_process_embeddings()
RETURNS trigger AS $$
DECLARE
  service_role_key text := current_setting('app.settings.service_role_key', true);
BEGIN
  PERFORM net.http_post(
    url := 'https://xxx.supabase.co/functions/v1/process-embeddings',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Recovery:**
- Check Supabase dashboard → Database → Extensions to verify pg_net is enabled
- Query `net._http_response` for error details: `SELECT * FROM net._http_response ORDER BY created_at DESC LIMIT 10;`
- Verify edge function is deployed: `supabase functions list`
- Test webhook manually with curl to edge function endpoint
- Check if JWT verification is enabled in edge function config (may need to disable or pass valid JWT)

**Phase relevance:**
Phase 1 (Setup). Must be verified during initial deployment. Add health check endpoint to edge function and monitor it.

**References:**
- [Database Webhooks | Supabase Docs](https://supabase.com/docs/guides/database/webhooks)
- [Database Webhook Fails Silently](https://github.com/orgs/supabase/discussions/36691)
- [Webhook debugging guide](https://supabase.com/docs/guides/troubleshooting/webhook-debugging-guide-M8sk47)

---

### 5. Blob MIME Type Property Access Error

**What goes wrong:**
The Deno edge function downloads a Blob from Supabase Storage and tries to access `fileBlob.mime_type`, but Blob objects in JavaScript don't have a `mime_type` property - they have `type`. This causes `mimeType: fileBlob.mime_type` to be `undefined`, breaking the Gemini file upload.

**Current bug in process-embeddings/index.ts line 79:**
```typescript
const uploadResult = await genAI.files.upload({
  file: new File([fileBlob], document.filename, { type: fileBlob.mime_type }), // 💥 undefined!
  config: {
    mimeType: fileBlob.mime_type,  // 💥 undefined!
    displayName: document.filename,
  },
});
```

**Warning signs:**
- Edge function logs show "Invalid MIME type" or "MIME type required"
- File upload to Gemini API fails with 400 Bad Request
- `fileBlob.mime_type` is undefined in logs
- Text extraction returns empty or fails

**Prevention:**
```typescript
// BAD: Accessing non-existent property
const mimeType = fileBlob.mime_type; // undefined

// GOOD: Use correct Blob property and fallback
const mimeType = fileBlob.type || document.mime_type || 'application/pdf';

// Even better: Validate MIME type
const allowedTypes = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'image/jpeg',
  'image/png'
];

const mimeType = fileBlob.type || document.mime_type || 'application/octet-stream';
if (!allowedTypes.includes(mimeType)) {
  throw new Error(`Unsupported MIME type: ${mimeType}`);
}

const uploadResult = await genAI.files.upload({
  file: new File([fileBlob], document.filename, { type: mimeType }),
  config: { mimeType, displayName: document.filename },
});
```

**Recovery:**
- Check Blob API documentation for correct property names
- Log the entire `fileBlob` object to inspect available properties
- Verify MIME type is stored correctly in `documents` table
- Add MIME type validation before storage download

**Phase relevance:**
Phase 1 (Setup). Should be caught immediately during first test upload. Add unit tests for file type handling.

**References:**
- [JavaScript API Reference | Supabase Storage](https://supabase.com/docs/reference/javascript/storage-from-download)
- [Supabase Storage MIME type issues](https://github.com/orgs/supabase/discussions/34982)

---

## Common Mistakes

### 6. Missing Error Status Updates in Catch Blocks

**Problem:**
The edge function has a try-catch that updates document status to "error" on failure, but it tries to re-parse the request body (`await req.json()`) which has already been consumed. This causes the error handler to fail silently, leaving the document stuck in "processing" state.

**Current code (lines 199-206):**
```typescript
try {
  const payload: WebhookPayload = await req.json().catch(() => ({ record: {} } as any));
  // 💥 req.json() already called at line 37, can't call again
  if (payload?.record?.id) {
    await supabase.from("documents").update({ status: "error" }).eq("id", payload.record.id);
  }
} catch {}
```

**Fix:**
```typescript
// At top of handler, store the parsed payload
let documentId: string | null = null;

try {
  const payload: WebhookPayload = await req.json();
  documentId = payload.record.id; // Store early
  // ... rest of processing
} catch (error) {
  console.error("Error processing document:", error);

  if (documentId) {
    const errorSupabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    await errorSupabase
      .from("documents")
      .update({
        status: "error",
        error_message: error.message,
        error_at: new Date().toISOString()
      })
      .eq("id", documentId);
  }

  return new Response(JSON.stringify({ error: error.message }), {
    status: 500,
    headers: { "Content-Type": "application/json" },
  });
}
```

---

### 7. Insufficient Batch Size for Rate Limiting

**Problem:**
Batch size of 10 is arbitrary and doesn't account for Google API rate limits (1500 requests per minute for text-embedding-004). With large documents (1000+ chunks), this can hit rate limits and fail without backoff.

**Better approach:**
```typescript
const BATCH_SIZE = 50; // Optimize for throughput
const REQUESTS_PER_MINUTE = 1500;
const DELAY_BETWEEN_BATCHES = (60 / REQUESTS_PER_MINUTE) * BATCH_SIZE * 1000; // ~2 seconds

for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  // ... process batch

  // Rate limit delay
  if (i + BATCH_SIZE < chunks.length) {
    await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_BATCHES));
  }
}
```

---

### 8. No Idempotency Protection

**Problem:**
If the edge function is called twice (webhook retry, manual trigger), it will:
1. Delete all existing chunks
2. Re-process entire document
3. Waste API quota

**Solution:**
```typescript
// Check if already processed
const { data: existingChunks } = await supabase
  .from("document_chunks")
  .select("id", { count: "exact", head: true })
  .eq("document_id", document.id);

if (existingChunks && existingChunks.length > 0 && document.status === "embedded") {
  console.log(`Document ${document.id} already processed, skipping`);
  return new Response(JSON.stringify({ message: "Already processed" }), {
    headers: { "Content-Type": "application/json" }
  });
}
```

---

### 9. No Progress Tracking for Large Documents

**Problem:**
User uploads 100-page PDF, waits 5 minutes with no feedback. Status is "processing" the entire time.

**Solution:**
```typescript
// Add progress field to documents table
await supabase
  .from("documents")
  .update({
    status: "processing",
    progress: 0,
    total_chunks: chunks.length
  })
  .eq("id", document.id);

// Update progress during batch processing
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  // ... process batch
  const progress = Math.floor(((i + BATCH_SIZE) / chunks.length) * 100);
  await supabase
    .from("documents")
    .update({ progress: Math.min(progress, 100) })
    .eq("id", document.id);
}
```

---

### 10. Missing Cleanup on Gemini File API

**Problem:**
If the edge function crashes after uploading to Gemini but before deletion (line 175), the file stays in Gemini Files API forever, counting against quota.

**Solution:**
```typescript
let uploadedFile: any = null;

try {
  uploadedFile = await genAI.files.upload({...});
  // ... processing

} finally {
  // Always cleanup, even on error
  if (uploadedFile) {
    try {
      await genAI.files.delete({ name: uploadedFile.file.name });
      console.log(`Cleaned up Gemini file: ${uploadedFile.file.name}`);
    } catch (e) {
      console.error("Failed to cleanup Gemini file (may need manual deletion):", e);
      // Log to monitoring system for manual cleanup
    }
  }
}
```

---

## Supabase-Specific Gotchas

### Storage Bucket MIME Type Restrictions
If the `project-files` bucket has MIME type restrictions configured, uploads will fail silently or return 400. Check bucket settings:

```sql
SELECT * FROM storage.buckets WHERE id = 'project-files';
-- Check allowed_mime_types column
```

### Edge Function Environment Variables
Environment variables must be set in the Supabase dashboard (Settings → Edge Functions → Secrets) or via CLI. They are NOT read from `.env` files. Missing `GEMINI_API_KEY` will cause silent failures.

```bash
# Set secrets for edge functions
supabase secrets set GEMINI_API_KEY=your_key_here
```

### RLS "SECURITY DEFINER" Functions
Functions marked `SECURITY DEFINER` run with the creator's permissions, not the caller's. If created by a superuser, they bypass all RLS. If created by a regular user, they inherit that user's limitations.

### Transaction Isolation in Webhooks
Database webhooks fire AFTER COMMIT, so the row is already committed even if the edge function fails. This can lead to inconsistent states. Consider using:
- Status column to track processing states
- Retry logic in edge function
- Dead letter queue for failed webhooks

---

## Google GenAI SDK Gotchas

### SDK Version Incompatibility Between Deno and Node.js

The `npm:@google/genai` package used in Deno edge functions may have version drift from the `@google/genai` used in the Next.js API (apps/api). Current versions:
- API: 1.35.0
- Widget: 1.33.0
- Edge Function: Latest from npm registry (may differ)

**Solution:** Pin the version in `deno.json`:
```json
{
  "imports": {
    "@google/genai": "npm:@google/genai@1.35.0"
  }
}
```

### text-embedding-004 Model Deprecation

**CRITICAL:** The `text-embedding-004` model is scheduled for deprecation on **January 14, 2026** (per Google's documentation). Since today is January 23, 2026, this model may already be deprecated or in grace period.

**Warning signs:**
- 404 "Model not found" errors
- Deprecation warnings in API responses
- Gradual degradation of service

**Migration path:**
```typescript
// OLD (deprecated)
const result = await genAI.models.embedContent({
  model: 'text-embedding-004',
  contents: text
});

// NEW (recommended)
const result = await genAI.models.embedContent({
  model: 'gemini-embedding-001',  // New model name
  contents: text
});
```

**Impact:** May require re-embedding all documents if vector dimensions change.

### File Upload Size Limits

Gemini Files API has size limits (typically 20MB for documents). Large PDFs will fail silently or timeout.

**Solution:**
```typescript
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB

if (fileBlob.size > MAX_FILE_SIZE) {
  throw new Error(`File too large: ${fileBlob.size} bytes (max ${MAX_FILE_SIZE})`);
}
```

### Exponential Backoff Not Implemented

Google APIs may return 429 (rate limit) or 503 (service unavailable). The current implementation doesn't retry.

**Solution:**
```typescript
async function embedWithRetry(text: string, maxRetries = 3): Promise<number[]> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await genAI.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });
      return result.embeddings[0].values;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      const isRetryable =
        error.status === 429 ||
        error.status === 503 ||
        error.code === 'ECONNRESET';

      if (!isRetryable) throw error;

      const delayMs = Math.pow(2, attempt) * 1000; // 1s, 2s, 4s
      console.log(`Retry ${attempt + 1}/${maxRetries} after ${delayMs}ms`);
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}
```

---

## Quality Gate Checklist

Before moving to Phase 2 (Implementation), verify:

- [ ] Edge function logs full API response structure before accessing nested properties
- [ ] `Promise.allSettled()` used instead of `Promise.all()` for batch operations
- [ ] RLS policies allow service role to INSERT into `document_chunks`
- [ ] `pg_net` extension enabled and permissions granted
- [ ] Service role key (not anon key) passed in webhook Authorization header
- [ ] Blob MIME type accessed via `.type` property, not `.mime_type`
- [ ] Document ID captured early for error status updates
- [ ] Rate limiting with delays between batches
- [ ] Idempotency check to prevent duplicate processing
- [ ] Progress tracking for user feedback
- [ ] Cleanup of Gemini files in `finally` block
- [ ] Exponential backoff retry logic for API failures
- [ ] Environment variables set via `supabase secrets set`
- [ ] Unit tests for MIME type handling and response structure validation
- [ ] Integration test for full pipeline (upload → trigger → embed → query)
- [ ] Monitoring for `net._http_response` errors
- [ ] Alert on documents stuck in "processing" status >5 minutes

---

## Phase Mapping

| Pitfall | Phase | Priority |
|---------|-------|----------|
| Embedding API response structure | Phase 1 (Setup) | P0 - Blocking |
| Promise.all failure cascade | Phase 2 (Core Pipeline) | P0 - Blocking |
| RLS policy mismatch | Phase 1 (Setup) | P0 - Blocking |
| Webhook trigger not firing | Phase 1 (Setup) | P0 - Blocking |
| Blob MIME type property | Phase 1 (Setup) | P0 - Blocking |
| Error status updates | Phase 2 (Core Pipeline) | P1 - High |
| Batch size rate limiting | Phase 2 (Core Pipeline) | P1 - High |
| Idempotency protection | Phase 3 (Testing) | P1 - High |
| Progress tracking | Phase 4 (Polish) | P2 - Medium |
| Gemini file cleanup | Phase 2 (Core Pipeline) | P1 - High |
| Model deprecation | Phase 1 (Setup) | P0 - Blocking |

**P0 (Blocking):** Must fix before production deployment
**P1 (High):** Should fix before load testing
**P2 (Medium):** Can defer to post-launch optimization

---

## Summary: Root Cause of Current Bug

Based on the codebase analysis, the most likely root cause of "chunks don't appear in document_chunks table" is **a combination of pitfalls #1, #3, and #5**:

1. **Embedding API response structure** (line 142): `embedResult.embeddings?.[0]?.values` may be undefined due to SDK version or API changes
2. **RLS policy mismatch** (migration 20260121000000_rls_reset.sql): The INSERT policy checks `documents.user_id = auth.uid()` which is NULL for service role
3. **Blob MIME type error** (line 79): `fileBlob.mime_type` is undefined, causing Gemini upload to fail silently

**Recommended fix order:**
1. Fix MIME type access: `fileBlob.type || document.mime_type`
2. Fix RLS policy: Add service role bypass or use SECURITY DEFINER function
3. Add defensive embedding response parsing with validation
4. Switch to `Promise.allSettled()` for batch processing
5. Add comprehensive logging at each step

---

## Additional Resources

- [Supabase Edge Functions Troubleshooting](https://supabase.com/docs/guides/functions/troubleshooting)
- [Deno Error Handling Best Practices](https://medium.com/deno-the-complete-reference/denos-built-in-errors-e8de397c45b4)
- [Google Gen AI SDK Models API](https://googleapis.github.io/js-genai/release_docs/classes/models.Models.html)
- [Supabase RLS Deep Dive](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

**Document Status:** ✅ Complete
**Last Updated:** 2026-01-23
**Next Review:** Before Phase 1 implementation begins
