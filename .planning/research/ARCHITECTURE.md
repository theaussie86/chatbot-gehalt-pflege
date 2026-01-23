# Architecture Research

**Research Date:** 2026-01-23
**Domain:** Document Processing Pipeline

## Component Overview

Document processing pipelines typically follow a multi-stage architecture with clear separation between synchronous and asynchronous phases. Based on analysis of the existing implementation and industry patterns, the major components are:

### 1. Upload Controller Layer
**Responsibility:** Handle HTTP requests, validate inputs, orchestrate upload flow
- **Location:** `apps/api/app/actions/documents.ts`
- **Type:** Next.js Server Actions
- **Operations:**
  - User authentication/authorization
  - File validation (type, size)
  - Orchestration of service layer
  - UI revalidation

### 2. Upload Service Layer
**Responsibility:** Business logic for coordinating storage and database operations
- **Location:** `apps/api/utils/documents.ts`
- **Type:** Service functions (uploadDocumentService, deleteDocumentService)
- **Operations:**
  - Dual-write pattern (Storage + Database)
  - Compensating transactions on failure
  - Status management
  - Error handling and rollback

### 3. Storage Layer
**Responsibility:** Persistent file storage
- **Provider:** Supabase Storage (S3-compatible)
- **Bucket:** `project-files`
- **Path Structure:** `{projectId|'global'}/{timestamp}-{filename}`
- **Access Pattern:** Direct upload via Supabase SDK
- **Features:**
  - RLS policies for access control
  - 52MB file size limit
  - PDF-only via MIME type enforcement

### 4. Database Layer
**Responsibility:** Metadata storage and transaction management
- **Provider:** Supabase PostgreSQL
- **Tables:**
  - `documents` - Parent record with status tracking
  - `document_chunks` - Child records with embeddings (CASCADE delete)
- **Status Flow:** `pending → processing → embedded/error`
- **Access Pattern:** Via Supabase client with RLS enforcement

### 5. Webhook Trigger Layer
**Responsibility:** Event-driven background job initiation
- **Mechanism:** PostgreSQL trigger + pg_net HTTP POST
- **Trigger Condition:** `AFTER INSERT ON documents WHERE status = 'pending'`
- **Target:** Supabase Edge Function endpoint
- **Payload:** Full document record as JSON
- **Location:** `apps/api/migrations/20260116000000_setup_embedding_webhook.sql`

### 6. Background Processing Layer (Edge Function)
**Responsibility:** Async document processing pipeline
- **Location:** `supabase/functions/process-embeddings/index.ts`
- **Runtime:** Deno with HTTP server
- **Stages:**
  1. Status update (`pending → processing`)
  2. File download from Storage
  3. External API upload (Gemini File API)
  4. Text extraction via LLM
  5. Text chunking (RecursiveCharacterTextSplitter)
  6. Batch embedding generation
  7. Database insertion
  8. Cleanup and status finalization

### 7. External AI Service Layer
**Responsibility:** Document understanding and vectorization
- **Provider:** Google Gemini API
- **Models:**
  - `gemini-2.5-flash` - Text extraction
  - `text-embedding-004` - Vector embeddings (768 dimensions)
- **Access Pattern:** Ephemeral file upload, synchronous API calls, cleanup after processing
- **Error Handling:** Independent try-catch blocks per chunk

### 8. Vector Database Layer
**Responsibility:** Semantic search via embeddings
- **Extension:** pgvector with HNSW index
- **Storage:** `document_chunks` table
- **Query Function:** `match_documents()` RPC with cosine similarity
- **Access Pattern:** Called during RAG query flow in chat endpoint

---

## Data Flow

### Upload Flow (Synchronous Phase)

```
User (Browser)
    │
    ├─ Step 1: Select PDF file
    │
    ▼
DocumentManager Component
    │
    ├─ Step 2: Build FormData with projectId
    │
    ▼
uploadDocumentAction (Server Action)
    │
    ├─ Step 3: Authenticate user via Supabase Auth
    ├─ Step 4: Extract file and projectId
    │
    ▼
uploadDocumentService
    │
    ├─ Step 5a: Upload to Supabase Storage
    │   └─ Path: project-files/{projectId}/{timestamp}-{filename}
    │   └─ Returns: storage_path, object_id
    │
    ├─ Step 5b: Insert to documents table
    │   └─ Fields: project_id, filename, mime_type, storage_path, status='pending'
    │   └─ Trigger fires: on_document_created_process_embeddings
    │
    ├─ Step 5c: IF DB insert fails → DELETE from Storage (compensating transaction)
    │
    ▼
Return to UI
    │
    └─ Step 6: Toast notification + UI revalidation
```

**Sync Points:**
- ✅ Storage upload MUST complete before DB insert
- ✅ DB insert failure triggers immediate storage cleanup
- ✅ User receives confirmation only after both operations succeed
- ❌ Background processing status NOT awaited (async)

---

### Processing Flow (Asynchronous Phase)

```
Database Trigger (AFTER INSERT)
    │
    ├─ Trigger Condition: NEW.status = 'pending'
    │
    ▼
pg_net.http_post (Webhook Dispatch)
    │
    ├─ URL: https://{project}.supabase.co/functions/v1/process-embeddings
    ├─ Headers: Authorization Bearer {service_role_key}
    ├─ Body: { type: 'INSERT', record: {...} }
    │
    ▼
Edge Function: process-embeddings
    │
    ├─ Step 1: Update status to 'processing'
    │   └─ Prevents duplicate processing
    │
    ├─ Step 2: Download file from Storage
    │   └─ Via: supabase.storage.from('project-files').download(storage_path)
    │   └─ Returns: Blob
    │
    ├─ Step 3: Upload to Gemini File API (ephemeral)
    │   └─ Purpose: Required for multimodal text extraction
    │   └─ Returns: fileUri for API reference
    │
    ├─ Step 4: Extract text via Gemini 2.5 Flash
    │   └─ Prompt: "Extract all text... no markdown formatting"
    │   └─ Returns: Raw text string
    │
    ├─ Step 5: Chunk text
    │   └─ RecursiveCharacterTextSplitter
    │   └─ Config: chunkSize=1000, chunkOverlap=200
    │   └─ Separators: ["\n\n", "\n", " ", ""]
    │   └─ Returns: Array of text chunks
    │
    ├─ Step 6: Generate embeddings (batched)
    │   └─ Batch size: 10 chunks at a time
    │   └─ Per chunk: Call text-embedding-004
    │   └─ Error handling: Individual chunk failures return null
    │   └─ Returns: Array of { document_id, chunk_index, content, embedding[768], token_count }
    │
    ├─ Step 7: Delete old chunks (idempotency)
    │   └─ DELETE FROM document_chunks WHERE document_id = {id}
    │
    ├─ Step 8: Batch insert chunks
    │   └─ INSERT INTO document_chunks (batched)
    │   └─ If insertError → throw (triggers error handler)
    │
    ├─ Step 9: Cleanup Gemini temporary file
    │   └─ genAI.files.delete(fileUri)
    │   └─ Best effort (catch + warn, don't fail)
    │
    ├─ Step 10: Update status to 'embedded'
    │   └─ Signals processing complete
    │
    ▼
Return Response
    └─ Status 200: { success: true }
    └─ Status 500: { error: message } + status='error' update
```

**Async Points:**
- ⏱️ Processing happens outside request/response cycle
- ⏱️ No timeout constraint from client perspective
- ⏱️ Status polling via UI (DocumentManager refetch on interval)
- ⏱️ Webhook delivery is at-least-once (may retry on failure)

---

### Delete Flow (Synchronous Phase)

```
User (Browser)
    │
    ├─ Step 1: Click delete button
    │
    ▼
Confirm Dialog
    │
    ├─ Step 2: User confirms deletion
    │
    ▼
deleteDocumentAction (Server Action)
    │
    ├─ Step 3: Authenticate user
    │
    ▼
deleteDocumentService
    │
    ├─ Step 4: SELECT document (RLS enforces access control)
    │   └─ If not found → throw "Document not found"
    │
    ├─ Step 5: DELETE from Storage
    │   └─ supabase.storage.from('project-files').remove([storage_path])
    │   └─ If fails → log warning, continue (soft failure)
    │
    ├─ Step 6: DELETE from documents table
    │   └─ Cascade: Automatically deletes document_chunks (ON DELETE CASCADE)
    │   └─ If fails → throw error
    │
    ▼
Return to UI
    └─ Step 7: Toast notification + UI revalidation
```

**Sync Points:**
- ✅ Storage deletion happens before DB deletion
- ⚠️ Storage deletion failure is non-blocking (logged but doesn't halt)
- ✅ DB deletion automatically cascades to chunks
- ✅ User confirmation required before execution

---

### RAG Query Flow (Synchronous Phase)

```
Chat Request
    │
    ├─ User message + project context
    │
    ▼
ConversationAnalyzer
    │
    ├─ Detect intent type
    ├─ If intent === 'question' → proceed to RAG
    │
    ▼
VectorstoreService.query()
    │
    ├─ Step 1: Check in-memory cache
    │   └─ Cache key: {projectId}:{question}
    │   └─ TTL: 24 hours (86400000ms)
    │   └─ If hit → return cached answer
    │
    ├─ Step 2: Generate query embedding
    │   └─ genAI.models.embedContent({ model: 'text-embedding-004', contents: question })
    │   └─ Returns: 768-dimensional vector
    │
    ├─ Step 3: Semantic search via RPC
    │   └─ supabase.rpc('match_documents', {
    │         query_embedding: vector,
    │         match_threshold: 0.7,
    │         match_count: 3,
    │         filter_project_id: projectId
    │       })
    │   └─ SQL: Uses cosine similarity (<=> operator)
    │   └─ Filters: project docs + global docs (project_id IS NULL)
    │   └─ Returns: Top-k chunks with similarity scores
    │
    ├─ Step 4: Combine results
    │   └─ Join chunks with '\n\n---\n\n' separator
    │   └─ Fallback: "Ich habe dazu keine spezifischen Informationen..."
    │
    ├─ Step 5: Cache result
    │   └─ Store in Map with timestamp
    │
    ▼
Inject into LLM Prompt
    │
    └─ Context added to Gemini request
    └─ Generate response with enriched context
```

**Sync Points:**
- ✅ Embedding generation is synchronous (blocks chat response)
- ✅ Database query via RPC is synchronous
- ✅ Cache hit avoids external API call
- ⚠️ No distributed cache (in-memory only, per-instance)

---

## Sync Patterns

### Pattern 1: Dual-Write with Compensating Transaction

**Scenario:** Upload requires both Storage and Database to succeed

**Implementation:**
```typescript
// Step 1: Write to Storage first (immutable, no transactions)
const { data: uploadData, error: storageError } = await supabase.storage
  .from('project-files')
  .upload(storagePath, file);

if (storageError) throw new Error('Storage failed');

// Step 2: Write to Database
const { data: document, error: dbError } = await supabase
  .from('documents')
  .insert({ storage_path: storagePath, status: 'pending' });

if (dbError) {
  // COMPENSATING TRANSACTION: Rollback storage
  await supabase.storage.from('project-files').remove([storagePath]);
  throw new Error('Database failed, storage cleaned up');
}
```

**Why this order?**
- Storage API has no built-in transaction support
- Database is source of truth for document existence
- Storage cleanup is easier than DB cleanup (no foreign keys)

**Failure Modes:**
1. ❌ Storage fails → No cleanup needed, throw immediately
2. ❌ DB fails after storage → Compensating delete, then throw
3. ❌ Compensating delete fails → Orphaned file in storage (requires periodic cleanup job)

**Recovery Strategy:**
- Periodic job to scan storage for files without DB records (future enhancement)
- Current: Best-effort cleanup, accept small risk of orphaned files

---

### Pattern 2: Status-Based State Machine

**Scenario:** Track async processing progress

**Implementation:**
```sql
-- Status field with enum-like constraint (recommended future enhancement)
status TEXT CHECK (status IN ('pending', 'processing', 'embedded', 'error'))

-- Trigger fires only on 'pending'
CREATE TRIGGER on_document_created_process_embeddings
  AFTER INSERT ON documents
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION trigger_process_embeddings();
```

**State Transitions:**
```
pending (initial)
    │
    ├─ Webhook fired → processing
    │
    ├─ Success → embedded (terminal)
    │
    └─ Failure → error (terminal)
```

**Idempotency:**
- Re-processing: Set status back to 'pending' → webhook fires again
- Duplicate prevention: First action in edge function is status update to 'processing'
- Old chunks deleted before new ones inserted (Step 7 in processing flow)

**Failure Handling:**
- Edge function catch block sets status='error'
- User can manually "Reprocess" via `reprocessDocumentAction()`
- Reprocess logic: `UPDATE documents SET status='pending' WHERE id={id}`

---

### Pattern 3: Webhook-Based Async Dispatch

**Scenario:** Trigger background job without blocking response

**Implementation:**
```sql
-- Function calls pg_net.http_post (non-blocking)
CREATE OR REPLACE FUNCTION trigger_process_embeddings()
RETURNS trigger AS $$
BEGIN
  PERFORM net.http_post(
    url := 'https://project.supabase.co/functions/v1/process-embeddings',
    headers := jsonb_build_object('Authorization', 'Bearer ' || service_role_key),
    body := jsonb_build_object('type', TG_OP, 'record', row_to_json(NEW))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

**Characteristics:**
- **Non-blocking:** Trigger function returns immediately, HTTP call happens in background
- **At-least-once delivery:** pg_net may retry on network failures
- **No guaranteed order:** Multiple documents may process concurrently
- **Payload:** Full document record (no need for edge function to re-query)

**Reliability:**
- ✅ Automatic retry on transient network errors (pg_net built-in)
- ⚠️ No dead letter queue for permanent failures
- ⚠️ No visibility into webhook delivery failures (check Supabase logs)
- ✅ Status field provides indirect confirmation (stuck in 'pending' = webhook failed)

---

### Pattern 4: Cascade Deletion

**Scenario:** Delete document and all associated chunks

**Implementation:**
```sql
-- Foreign key with CASCADE
CREATE TABLE document_chunks (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  content text,
  embedding vector(768)
);
```

**Delete Flow:**
```typescript
// 1. Delete file from storage (best effort)
await supabase.storage.from('project-files').remove([storage_path]);

// 2. Delete document record → cascade to chunks
await supabase.from('documents').delete().eq('id', documentId);
```

**Why Storage First?**
- DB deletion is irreversible and cascades
- If storage delete fails, DB record remains (can retry)
- If storage succeeds but DB fails, document is still accessible via DB

**Failure Modes:**
1. ✅ Storage delete fails → abort, throw error, DB unchanged
2. ⚠️ Storage succeeds, DB fails → Orphaned storage file (low impact)
3. ✅ Both succeed → Complete cleanup

**Current Implementation Note:**
- Storage deletion errors are logged but don't halt DB deletion
- This is pragmatic: DB is source of truth, orphaned files are low impact
- Future: Periodic cleanup job for orphaned storage files

---

### Pattern 5: Batch Processing with Partial Failure Tolerance

**Scenario:** Embed 100 chunks, some may fail

**Implementation:**
```typescript
const batchPromises = batch.map(async (chunkText, index) => {
  try {
    const embedding = await genAI.models.embedContent({ ... });
    return { chunk_index: index, content: chunkText, embedding: embedding.values };
  } catch (e) {
    console.error(`Failed to embed chunk ${index}`, e);
    return null; // Partial failure, continue with other chunks
  }
});

const results = await Promise.all(batchPromises);
const validResults = results.filter(r => r !== null);

// Insert only successful chunks
await supabase.from('document_chunks').insert(validResults);
```

**Tradeoff:**
- ✅ Partial success better than complete failure
- ⚠️ Document may have incomplete embeddings
- ⚠️ No record of which chunks failed (future: error_chunks table)

**Alternative Approach (More Strict):**
```typescript
// Abort entire document if any chunk fails
if (validResults.length < chunks.length) {
  throw new Error(`Only ${validResults.length}/${chunks.length} chunks succeeded`);
}
```

**Current Choice:** Partial tolerance (lenient)
**Recommendation:** Add chunk-level error tracking for observability

---

## Error Recovery

### Failure Mode 1: Storage Upload Fails

**Symptoms:** `storageError` thrown before DB insert

**Impact:**
- ❌ Document not created
- ❌ User sees error toast
- ✅ No cleanup needed (nothing persisted)

**Recovery:**
- User: Retry upload
- System: No automated recovery needed

**Prevention:**
- Validate file size before upload (52MB limit)
- Validate MIME type client-side
- Check storage quota/permissions

---

### Failure Mode 2: Database Insert Fails After Storage Upload

**Symptoms:** `dbError` thrown, storage file exists

**Impact:**
- ❌ Document not created in DB
- ⚠️ Orphaned file in storage (before compensating transaction)
- ✅ Compensating transaction deletes storage file

**Recovery:**
```typescript
if (dbError) {
  await supabase.storage.from('project-files').remove([storagePath]);
  throw new Error('Database error, storage cleaned up');
}
```

**If Compensating Transaction Also Fails:**
- Log error with storage path
- Manual cleanup via Supabase dashboard
- Future: Periodic cleanup job

**Prevention:**
- Ensure RLS policies allow document insertion
- Verify foreign key constraints (project_id valid)
- Check database quotas

---

### Failure Mode 3: Webhook Delivery Fails

**Symptoms:** Document stuck in 'pending' status indefinitely

**Detection:**
- User observes status not changing
- Check Supabase Function logs for missing invocations
- Query: `SELECT * FROM documents WHERE status='pending' AND created_at < NOW() - INTERVAL '10 minutes'`

**Root Causes:**
- pg_net extension not enabled
- Edge function endpoint incorrect/unauthorized
- Network partition between database and function host
- Edge function cold start timeout

**Recovery:**
```typescript
// Manual reprocess via UI button
export async function reprocessDocumentAction(documentId: string) {
  await supabase
    .from('documents')
    .update({ status: 'pending' })
    .eq('id', documentId);
  // Trigger fires again on UPDATE if configured
}
```

**Automated Recovery (Future Enhancement):**
```sql
-- pg_cron job to retry stale pending documents
SELECT cron.schedule(
  'retry-stale-pending-docs',
  '*/10 * * * *', -- Every 10 minutes
  $$ UPDATE documents
     SET status = 'pending'
     WHERE status = 'pending'
       AND created_at < NOW() - INTERVAL '10 minutes' $$
);
```

**Prevention:**
- Monitor webhook delivery success rate
- Alert on documents stuck in 'pending' > 5 minutes
- Health check endpoint for edge functions

---

### Failure Mode 4: Edge Function Crashes During Processing

**Symptoms:** Document stuck in 'processing' status

**Impact:**
- ❌ No embeddings generated
- ⚠️ Partial chunks may exist (if crash after Step 8)
- ⚠️ Gemini file not cleaned up (small cost leak)

**Detection:**
```sql
SELECT * FROM documents
WHERE status = 'processing'
  AND updated_at < NOW() - INTERVAL '5 minutes';
```

**Root Causes:**
- Out of memory (large PDF)
- Timeout (Edge function limit: 60 seconds default)
- Gemini API error (rate limit, service outage)
- Malformed PDF (text extraction fails)

**Recovery:**
```typescript
// Reset to pending (will delete old partial chunks on retry)
await supabase
  .from('documents')
  .update({ status: 'pending' })
  .eq('id', documentId);
```

**Prevention:**
- Add timeout handling in edge function
- Limit file size upload (current: 52MB)
- Add retry logic with exponential backoff for Gemini API
- Catch and log specific error types (OOM vs timeout vs API error)

**Enhanced Error Handling (Recommendation):**
```typescript
// Add error_message column to documents table
try {
  // ... processing ...
} catch (error) {
  await supabase
    .from('documents')
    .update({
      status: 'error',
      error_message: error.message.substring(0, 500) // Store error details
    })
    .eq('id', document.id);
}
```

---

### Failure Mode 5: Partial Chunk Embedding Failure

**Symptoms:** `validResults.length < chunks.length`

**Impact:**
- ⚠️ Document marked 'embedded' but incomplete
- ⚠️ RAG queries may miss content from failed chunks
- ✅ Some content still searchable

**Current Behavior:**
- Silently continues with partial results
- No indication to user that embedding is incomplete

**Detection:**
```sql
-- Find documents with suspiciously few chunks
SELECT d.id, d.filename, COUNT(dc.id) as chunk_count
FROM documents d
LEFT JOIN document_chunks dc ON dc.document_id = d.id
WHERE d.status = 'embedded'
GROUP BY d.id, d.filename
HAVING COUNT(dc.id) < 5; -- Heuristic: expect at least 5 chunks
```

**Recovery:**
- Reprocess document (delete + re-upload or manual status reset)

**Prevention:**
```typescript
// Strict mode: Abort if any chunk fails
if (validResults.length < chunks.length) {
  throw new Error(
    `Partial failure: ${validResults.length}/${chunks.length} chunks embedded`
  );
}
```

**Enhanced Logging (Recommendation):**
```typescript
// Add chunk-level error tracking
const failedChunks = chunks.length - validResults.length;
if (failedChunks > 0) {
  console.warn(`Document ${document.id}: ${failedChunks} chunks failed embedding`);
  // Future: Insert into error_log table
}
```

---

### Failure Mode 6: Delete Fails Due to RLS Policy

**Symptoms:** Delete action returns 0 rows deleted

**Impact:**
- ❌ Document not deleted
- ❌ User sees "Failed to delete" error
- ✅ No data loss (safe failure)

**Root Causes:**
- User lacks project membership (RLS blocks SELECT)
- User has 'viewer' role (needs 'editor' or 'admin')
- Project ID mismatch

**Recovery:**
- Grant user appropriate role in project_members table
- Or: Admin deletes via Supabase dashboard (bypasses RLS)

**Prevention:**
- Hide delete button for users without 'editor'/'admin' role
- Show clear error message indicating permission issue
- Audit RLS policies for consistency

---

### Failure Mode 7: Cascade Delete Fails

**Symptoms:** Database constraint violation on document delete

**Impact:**
- ❌ Document not deleted
- ✅ Chunks remain intact (safe failure)

**Root Causes:**
- Misconfigured foreign key (missing ON DELETE CASCADE)
- Manual chunk insertion without document_id reference

**Detection:**
```sql
-- Verify cascade is configured
SELECT constraint_name, delete_rule
FROM information_schema.referential_constraints
WHERE constraint_schema = 'public'
  AND table_name = 'document_chunks';
-- Expected: delete_rule = 'CASCADE'
```

**Recovery:**
```sql
-- Manually delete chunks then document
DELETE FROM document_chunks WHERE document_id = '<id>';
DELETE FROM documents WHERE id = '<id>';
```

**Prevention:**
- Migration tests to verify cascade behavior
- Schema validation in CI/CD

---

### Failure Mode 8: RAG Query Timeout

**Symptoms:** Embedding generation or RPC call exceeds timeout

**Impact:**
- ❌ Chat response fails or returns without context
- ⚠️ User experience degraded

**Root Causes:**
- Gemini API slow response
- Large RPC result set (many matching chunks)
- Cold start latency

**Recovery:**
```typescript
// Timeout wrapper
const queryWithTimeout = async (question: string, timeout = 5000) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const result = await vectorstore.query(question, projectId);
    clearTimeout(timeoutId);
    return result;
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('RAG query timeout, proceeding without context');
      return ''; // Graceful degradation
    }
    throw error;
  }
};
```

**Prevention:**
- Cache embeddings (already implemented: 24h TTL)
- Limit RPC match_count (currently 3, good)
- Index optimization (HNSW already used)
- Consider materialized views for frequently accessed chunks

---

## Build Order

Based on component dependencies, here's the recommended implementation sequence:

### Phase 1: Storage + Database Foundation
**Duration:** 2-3 days
**Components:**
1. Supabase Storage bucket setup
2. Database tables (documents, document_chunks)
3. RLS policies
4. pgvector extension + HNSW index

**Deliverables:**
- Migration files
- Storage policies
- Basic SELECT/INSERT/DELETE operations work

**Dependencies:** None
**Validation:** Manual SQL tests

---

### Phase 2: Upload Service Layer
**Duration:** 2-3 days
**Components:**
1. `uploadDocumentService` with dual-write pattern
2. `deleteDocumentService` with cascade
3. Compensating transaction logic
4. Error handling and logging

**Deliverables:**
- `apps/api/utils/documents.ts`
- Unit tests for failure scenarios

**Dependencies:** Phase 1
**Validation:**
- Test storage-only success
- Test DB-only failure + rollback
- Test successful upload end-to-end

---

### Phase 3: Upload Controller Layer
**Duration:** 1-2 days
**Components:**
1. Server Actions (uploadDocumentAction, deleteDocumentAction)
2. Authentication checks
3. UI revalidation
4. Error responses

**Deliverables:**
- `apps/api/app/actions/documents.ts`
- Integration with Next.js

**Dependencies:** Phase 2
**Validation:**
- Upload via frontend form
- Error toasts display correctly
- UI updates after operations

---

### Phase 4: Frontend UI
**Duration:** 2-3 days
**Components:**
1. DocumentManager component
2. File upload form
3. Status polling
4. Delete confirmation dialog

**Deliverables:**
- `apps/api/components/DocumentManager.tsx`
- Real-time status updates

**Dependencies:** Phase 3
**Validation:**
- Upload multiple files
- View status changes
- Delete with confirmation

---

### Phase 5: Webhook Trigger Setup
**Duration:** 1 day
**Components:**
1. pg_net extension enable
2. Trigger function
3. Database trigger creation
4. Webhook endpoint configuration

**Deliverables:**
- `apps/api/migrations/*_setup_embedding_webhook.sql`
- Environment variables for edge function URL

**Dependencies:** Phase 2 (status field must exist)
**Validation:**
- Insert document with status='pending'
- Verify HTTP POST logged in Supabase
- Confirm edge function receives payload

---

### Phase 6: Edge Function - Basic Structure
**Duration:** 2 days
**Components:**
1. Deno HTTP server skeleton
2. Webhook payload parsing
3. Status update to 'processing'
4. Error handling wrapper
5. Status update to 'error' on failure

**Deliverables:**
- `supabase/functions/process-embeddings/index.ts` (minimal)
- Deployment to Supabase

**Dependencies:** Phase 5
**Validation:**
- Trigger webhook
- Verify status changes pending → processing → error
- Check function logs

---

### Phase 7: Document Download & Text Extraction
**Duration:** 2-3 days
**Components:**
1. Storage download logic
2. Gemini File API upload
3. LLM-based text extraction
4. Gemini file cleanup

**Deliverables:**
- Integration with Gemini SDK
- Text extraction logic
- Cleanup on success/failure

**Dependencies:** Phase 6
**Validation:**
- Upload PDF
- Verify text extracted in logs
- Confirm Gemini file deleted

---

### Phase 8: Text Chunking
**Duration:** 1 day
**Components:**
1. RecursiveCharacterTextSplitter integration
2. Chunk parameter tuning (size, overlap)
3. Separator configuration

**Deliverables:**
- Chunking logic in edge function
- Logging of chunk count

**Dependencies:** Phase 7
**Validation:**
- Upload multi-page PDF
- Verify chunks logged
- Check chunk sizes in logs

---

### Phase 9: Embedding Generation & Storage
**Duration:** 3-4 days
**Components:**
1. Batch embedding generation
2. Partial failure handling
3. Old chunk deletion (idempotency)
4. Batch insertion to document_chunks
5. Status update to 'embedded'

**Deliverables:**
- Full embedding pipeline
- Error handling for partial failures
- Database insertion

**Dependencies:** Phase 8
**Validation:**
- Upload document
- Query document_chunks table
- Verify embeddings (768 dimensions)
- Verify status='embedded'

---

### Phase 10: RAG Query Service
**Duration:** 2-3 days
**Components:**
1. VectorstoreService class
2. Embedding generation for queries
3. RPC function (match_documents)
4. In-memory cache
5. Result formatting

**Deliverables:**
- `apps/api/lib/vectorstore/VectorstoreService.ts`
- SQL RPC function

**Dependencies:** Phase 9 (chunks must exist)
**Validation:**
- Query with known keywords
- Verify relevant chunks returned
- Test cache hit/miss

---

### Phase 11: RAG Integration in Chat
**Duration:** 1-2 days
**Components:**
1. Intent detection (question vs data_provision)
2. Conditional RAG query
3. Context injection into LLM prompt
4. Response generation with context

**Deliverables:**
- Updated chat endpoint
- Context-aware responses

**Dependencies:** Phase 10
**Validation:**
- Ask question about uploaded document
- Verify answer uses document content
- Test fallback when no context found

---

### Phase 12: Monitoring & Recovery Tools
**Duration:** 2-3 days
**Components:**
1. Reprocess action
2. Stale document detection query
3. Error message storage
4. Admin dashboard for failed docs

**Deliverables:**
- `reprocessDocumentAction()`
- Admin UI for retries
- Logging enhancements

**Dependencies:** Phase 9 (processing must be complete)
**Validation:**
- Force error in edge function
- Reprocess via UI
- Verify status changes correctly

---

### Total Estimated Duration: 20-30 days (4-6 weeks)

### Critical Path:
Phase 1 → Phase 2 → Phase 3 → Phase 5 → Phase 6 → Phase 7 → Phase 8 → Phase 9 → Phase 10 → Phase 11

### Parallelizable:
- Phase 4 (Frontend) can start after Phase 3
- Phase 12 (Monitoring) can be built in parallel with Phase 10-11

---

## Key Architectural Decisions

### 1. Why Dual-Write Instead of Transactional Pattern?

**Rationale:**
- Supabase Storage is S3-compatible (no transaction support)
- Database is source of truth, storage is blob store
- Compensating transactions are simpler than distributed 2PC
- Industry pattern for storage + DB sync ([AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/building-a-scalable-document-pre-processing-pipeline/))

**Tradeoff:**
- ⚠️ Risk of orphaned files if compensating delete fails
- ✅ Simpler implementation
- ✅ Better performance (no distributed locks)

---

### 2. Why Webhook Instead of Queue?

**Rationale:**
- Supabase provides pg_net + database triggers out-of-box
- No additional infrastructure needed (vs SQS, Pub/Sub)
- At-least-once delivery semantics sufficient for our use case
- Industry pattern for async document processing ([Document Processing Pipeline](https://deepwiki.com/papra-hq/papra/2.3-document-processing-pipeline))

**Tradeoff:**
- ⚠️ No visibility into delivery failures (rely on status field)
- ⚠️ No dead letter queue for permanent failures
- ✅ Zero operational overhead
- ✅ Native Supabase integration

---

### 3. Why Status Field Instead of Separate Job Table?

**Rationale:**
- Status is intrinsic to document lifecycle
- Single source of truth (no sync issues between tables)
- Simpler queries (no JOIN needed)
- Common pattern for background job tracking ([Background Jobs with Supabase](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions))

**Tradeoff:**
- ⚠️ No history of processing attempts (can't see retry count)
- ⚠️ No detailed error messages (would need additional column)
- ✅ Simpler schema
- ✅ Easier to query current state

**Future Enhancement:**
```sql
-- Add job history table for auditability
CREATE TABLE document_processing_jobs (
  id uuid PRIMARY KEY,
  document_id uuid REFERENCES documents(id),
  attempt_number int,
  started_at timestamptz,
  completed_at timestamptz,
  status text,
  error_message text
);
```

---

### 4. Why Cascade Delete Instead of Soft Delete?

**Rationale:**
- Chunks have no independent value (always tied to parent document)
- Hard delete saves storage costs (embeddings are large)
- Simpler queries (no need to filter deleted=false)
- Easier to reason about state

**Tradeoff:**
- ⚠️ No recovery after accidental delete (could add backup strategy)
- ⚠️ No audit trail of deletions (could add trigger for audit table)
- ✅ Simpler application logic
- ✅ Better performance (no index on deleted column)

---

### 5. Why Partial Failure Tolerance in Embedding?

**Rationale:**
- Embedding API can have transient failures
- Partial document better than no document
- Allows processing to complete for other chunks
- Common pattern in batch processing pipelines

**Tradeoff:**
- ⚠️ User not notified of incomplete embeddings
- ⚠️ RAG quality degraded for affected documents
- ✅ Higher success rate overall
- ✅ Better user experience (not waiting for retries)

**Recommendation:**
- Add warning indicator on documents with failed chunks
- Track chunk success rate as metric
- Consider strict mode for critical documents

---

## References

Industry research and patterns:

- [Document Processing Pipeline - papra-hq](https://deepwiki.com/papra-hq/papra/2.3-document-processing-pipeline)
- [The Pipeline Pattern - DEV Community](https://dev.to/wallacefreitas/the-pipeline-pattern-streamlining-data-processing-in-software-architecture-44hn)
- [Webhooks and Asynchronous Processing - Veryfi](https://faq.veryfi.com/en/articles/5588143-webhooks-and-asynchronous-processing)
- [Document Processing Pipeline for Regulated Industries - AWS Samples](https://github.com/aws-samples/document-processing-pipeline-for-regulated-industries)
- [Building a Scalable Document Pre-Processing Pipeline - AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/building-a-scalable-document-pre-processing-pipeline/)
- [Edge Functions Troubleshooting - Supabase Docs](https://supabase.com/docs/guides/functions/troubleshooting)
- [Edge Functions Architecture - Supabase Docs](https://supabase.com/docs/guides/functions/architecture)
- [Background Jobs with Supabase Tables and Edge Functions](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions)

---

## Quality Gate Checklist

- [x] Components clearly defined with boundaries
  - 8 major components identified with responsibilities
  - Component interactions mapped

- [x] Data flow direction explicit
  - Upload flow (synchronous): 6 steps documented
  - Processing flow (asynchronous): 10 steps documented
  - Delete flow (synchronous): 7 steps documented
  - RAG query flow (synchronous): 5 steps documented

- [x] Failure modes and recovery strategies identified
  - 8 failure modes documented with:
    - Symptoms
    - Impact assessment
    - Root causes
    - Detection methods
    - Recovery procedures
    - Prevention strategies

- [x] Build order implications noted
  - 12 phases defined with:
    - Duration estimates
    - Component deliverables
    - Dependency chains
    - Validation criteria
  - Critical path identified
  - Parallelization opportunities noted
  - Total timeline: 4-6 weeks

---

*Architecture research completed: 2026-01-23*
