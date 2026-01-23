# Stack Research

**Research Date:** 2026-01-23
**Domain:** Document Processing Pipeline
**Context:** Gehalt-Pflege chatbot (German nursing salary calculator) - Adding RAG capabilities to existing Next.js/Supabase app

## Recommended Stack

### AI/Embeddings SDK

- **@google/genai** v1.37+ — Official Google Gen AI SDK (replaces deprecated @google/generative-ai)
  - Confidence: **High**
  - Models: `gemini-2.5-flash` for text extraction, `text-embedding-004` for embeddings (768 dimensions)
  - Deno import: `npm:@google/genai`
  - Rationale:
    - The old `@google/generative-ai` was archived Dec 2024, all support ended Aug 31, 2025
    - v1.37+ reached GA in May 2025 across all platforms
    - Works with Vertex AI (your existing setup) and Gemini API
    - Documented Deno compatibility via npm: specifier
  - Known issues: Some users report import challenges in Supabase Edge Functions - may require specific version pinning
  - Alternatives considered:
    - ❌ `@google/generative-ai` — Deprecated/archived
    - ❌ LangChain Google integrations — Adds unnecessary abstraction layer

### Text Chunking

- **@langchain/textsplitters** v1.0.1 — Industry-standard recursive character text splitter
  - Confidence: **High**
  - Deno import: `npm:@langchain/textsplitters@1.0.1`
  - Rationale:
    - Battle-tested chunking algorithms (recursive character splitting)
    - Maintains semantic boundaries by splitting on `\n\n` → `\n` → ` ` → `""`
    - Small package, no need for full LangChain
    - Your current edge function already uses this successfully
  - Alternatives considered:
    - ❌ Custom chunking (VectorstoreService.ts) — Reinventing the wheel, bug-prone
    - ❌ tiktoken — Overkill for character-based chunking, adds complexity

### PDF/Document Parsing

- **unpdf** v0.12+ — Modern PDF.js wrapper for edge environments
  - Confidence: **Medium-High**
  - Deno import: `npm:unpdf`
  - Rationale:
    - Built specifically for Deno, Workers, and nodeless environments
    - Ships with serverless build of Mozilla's PDF.js v4.0.189
    - Replaces unmaintained pdf-parse
    - ~1.4MB minified (acceptable for edge functions)
    - Can extract text, links, and images
  - Caveats: Measure memory impact in edge functions first
  - Alternatives considered:
    - ❌ pdf-parse — Unmaintained, fails in edge functions with fs errors
    - ❌ pdfjs-serverless — unpdf is a wrapper around this, provides better API
    - ⚠️ Gemini File API (current approach) — Works but adds latency and Google File API quota usage; consider unpdf for simple PDFs

### Database Extension

- **pgvector** v0.6.0+ — Postgres vector similarity search
  - Confidence: **High**
  - Rationale:
    - Official Supabase recommendation
    - 768-dim vectors for text-embedding-004
    - HNSW indexing for fast approximate search
    - Your schema already uses this correctly
  - Index Strategy:
    - **HNSW** (default): Best for <10M vectors, RAM-based, 40.5 QPS at 99.8% recall
    - **pgvectorscale** (future): For >10M vectors, disk-based DiskANN, 471 QPS at 99% recall
  - Current setup: ✅ Already using HNSW with `vector_cosine_ops`

### Edge Function Runtime

- **Deno 2.x** — Supabase Edge Runtime (Deno-compatible)
  - Confidence: **High**
  - Import pattern: Use `npm:` specifier for npm packages
  - Import maps: Define in `deno.json` for centralized dependency management
  - Rationale:
    - Built into Supabase Edge Functions
    - Native TypeScript support
    - npm compatibility with Deno 2.0+
    - Use `node:` specifier for built-ins (e.g., `node:buffer`)
  - Best practices:
    ```json
    // deno.json
    {
      "imports": {
        "@google/genai": "npm:@google/genai@1.37.0",
        "@langchain/textsplitters": "npm:@langchain/textsplitters@1.0.1",
        "@supabase/supabase-js": "jsr:@supabase/supabase-js@2"
      }
    }
    ```

### Supabase Client

- **@supabase/supabase-js** v2 — Official Supabase JavaScript client
  - Confidence: **High**
  - Deno import: `jsr:@supabase/supabase-js@2` (JSR registry preferred over npm)
  - Rationale:
    - First-class Deno support via JSR
    - Edge Functions use service role key for admin operations
    - Your current edge function uses this correctly
  - Pattern: Always use `SUPABASE_SERVICE_ROLE_KEY` in edge functions

## Anti-Recommendations

- **@google/generative-ai** — Deprecated and archived Dec 2024, use @google/genai instead
- **pdf-parse** — Unmaintained, fails in edge functions with Node.js fs errors
- **LangChain (full)** — Overkill for simple document processing; just use @langchain/textsplitters
- **esm.sh imports** — Deno 2.0+ prefers npm: specifiers for better dependency resolution
- **node_modules in edge functions** — Avoid unless using Node-API addons; edge functions work without it
- **HTTP imports (https://esm.sh)** — Lack install hooks, cause duplicate dependencies, use npm: instead
- **IVFFlat index** — HNSW is 15.5x faster at same recall; IVFFlat only faster to build (not worth it)

## Key Patterns

### 1. Document Processing Flow (Current Implementation)

```typescript
// ✅ Your edge function already follows best practices
1. Webhook trigger (INSERT to documents table with status='pending')
2. Download from Supabase Storage (project-files bucket)
3. Upload to Gemini File API
4. Extract text with gemini-2.5-flash
5. Chunk with RecursiveCharacterTextSplitter (1000 chars, 200 overlap)
6. Generate embeddings (text-embedding-004) in batches of 10
7. Insert chunks with embeddings to document_chunks table
8. Cleanup Gemini file
9. Update status to 'embedded'
```

### 2. Error Handling Pattern

```typescript
// ✅ Your edge function implements this
try {
  await processDocument()
} catch (error) {
  console.error(error)
  await supabase
    .from('documents')
    .update({ status: 'error' })
    .eq('id', documentId)
  return new Response(JSON.stringify({ error }), { status: 500 })
}
```

### 3. Batch Embedding Generation

```typescript
// ✅ Your pattern is optimal
const BATCH_SIZE = 10; // Prevents rate limiting
for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
  const batch = chunks.slice(i, i + BATCH_SIZE);
  const embeddings = await Promise.all(
    batch.map(chunk => genAI.models.embedContent({
      model: 'text-embedding-004',
      contents: chunk
    }))
  );
}
```

### 4. Vector Search Pattern

```typescript
// ✅ Your match_documents function is correct
-- plpgsql function with cosine similarity
1 - (embedding <=> query_embedding) as similarity
-- <=> is cosine distance operator
-- Order by distance (ASC), not similarity (DESC)
ORDER BY embedding <=> query_embedding
```

### 5. Background Tasks for Long Processing

```typescript
// For documents >6 minutes processing time:
Deno.serve(async (req) => {
  const payload = await req.json();

  // Return immediately
  req.waitUntil(processDocumentBackground(payload));

  return new Response(JSON.stringify({ accepted: true }));
});
```

Limits:
- Free tier: 150s (2m 30s) background tasks
- Pro tier: 400s (6m 40s) background tasks
- Request timeout: 150s idle timeout
- CPU time: 2s per request (doesn't include I/O)

### 6. Webhook Security Pattern

```typescript
// config.toml
[functions.process-embeddings]
verify_jwt = false  # Webhooks can't send JWTs

// Add secret header validation instead:
const SECRET = Deno.env.get('WEBHOOK_SECRET');
if (req.headers.get('X-Secret-Key') !== SECRET) {
  return new Response('Unauthorized', { status: 401 });
}
```

### 7. Index Strategy

```sql
-- ✅ Your current HNSW index is optimal for <10M vectors
CREATE INDEX document_chunks_embedding_idx
ON document_chunks
USING hnsw (embedding vector_cosine_ops);

-- For >10M vectors, consider pgvectorscale:
-- (Not needed now, but future-proof)
CREATE INDEX ON document_chunks
USING diskann (embedding);
```

### 8. Alternative: Skip Gemini File API for Simple PDFs

```typescript
// If PDFs are text-based (not scanned images):
import { extractText } from 'npm:unpdf';

const { data: fileBlob } = await supabase.storage
  .from('project-files')
  .download(storagePath);

const text = await extractText(await fileBlob.arrayBuffer());

// Pros: Faster, no Google quota usage, cheaper
// Cons: Doesn't work for scanned PDFs (need OCR)
// Your use case: Tariff PDFs are likely text-based → consider this
```

## Implementation Recommendations

### Immediate (Fix Current Issues)

1. **Verify @google/genai import** — Your edge function uses `npm:@google/genai`, which is correct. If chunks aren't being created:
   - Check `embedResult.embeddings?.[0]?.values` structure (your code looks correct)
   - Verify `document_chunks` table RLS policies allow service role inserts
   - Check edge function logs for embedding errors
   - Verify `GEMINI_API_KEY` is set in edge function secrets

2. **Add debugging** — Log each step:
   ```typescript
   console.log(`Uploaded: ${uploadResult.uri}`);
   console.log(`Extracted: ${textContent.length} chars`);
   console.log(`Chunks: ${chunks.length}`);
   console.log(`Embeddings: ${chunkDataArray.length} generated`);
   ```

3. **Check database insert** — Your insert looks correct, but verify:
   ```typescript
   const { data, error } = await supabase
     .from('document_chunks')
     .insert(chunkDataArray)
     .select(); // Add .select() to see what was inserted

   console.log(`Inserted: ${data?.length || 0} chunks`);
   ```

### Short-term Improvements

1. **Add retry logic** — Gemini API can be flaky:
   ```typescript
   async function embedWithRetry(text, maxRetries = 3) {
     for (let i = 0; i < maxRetries; i++) {
       try {
         return await genAI.models.embedContent({
           model: 'text-embedding-004',
           contents: text
         });
       } catch (e) {
         if (i === maxRetries - 1) throw e;
         await new Promise(r => setTimeout(r, 1000 * (i + 1)));
       }
     }
   }
   ```

2. **Add webhook secret validation** — Your webhook has `verify_jwt = false`, add secret header check

3. **Consider unpdf for text PDFs** — Skip Gemini File API if PDFs are text-based (faster, cheaper)

### Long-term Optimizations

1. **Implement caching** — Your VectorstoreService has caching, but edge function doesn't. Cache extracted text by file hash.

2. **Add progress tracking** — For multi-page documents, update progress:
   ```sql
   ALTER TABLE documents ADD COLUMN processing_progress INTEGER DEFAULT 0;
   ```

3. **Consider pgvectorscale** — If you exceed 10M vectors, switch to DiskANN indexing

4. **Add telemetry** — Track processing time, embedding costs, error rates

## Known Issues & Workarounds

### Issue 1: Chunks Not Being Created

**Symptoms:** Edge function runs, status changes to 'embedded', but document_chunks table empty

**Possible causes:**
1. RLS policy blocks service role inserts (unlikely, but check)
2. Embedding API returns different structure than expected
3. Silent failure in batch processing (return null but don't log)

**Debug steps:**
```typescript
// Add before insert:
console.log('Sample chunk data:', JSON.stringify(chunkDataArray[0]));
console.log('Embedding dimensions:', chunkDataArray[0]?.embedding?.length);

// Verify RLS:
-- Run as service role:
SELECT * FROM document_chunks WHERE document_id = '<test-id>';
```

### Issue 2: Gemini Import Errors in Deno

**Workaround:** Pin to specific version in deno.json:
```json
{
  "imports": {
    "@google/genai": "npm:@google/genai@1.37.0"
  }
}
```

### Issue 3: Edge Function Timeout

**Workaround:** Use background tasks or break into smaller jobs:
```typescript
req.waitUntil(processChunks(startIndex, endIndex));
```

## Performance Benchmarks

Based on research and your current setup:

- **Text extraction:** ~2-5s per PDF page (Gemini File API)
- **Chunking:** ~100ms for 10k chars (LangChain splitter)
- **Embedding:** ~500ms per batch of 10 chunks (Gemini API)
- **Vector search:** ~50ms for topK=3 with HNSW index (<1M vectors)

**Bottleneck:** Gemini File API upload + extraction (can take 60-90s for large PDFs)

**Optimization:** For text-based PDFs, unpdf is 5-10x faster than Gemini File API

## Cost Analysis

Per 1,000 documents (avg 10 pages each):

- **Gemini File API:** Free (quota limits may apply)
- **text-embedding-004:** $0.025 per 1M tokens ≈ $0.25 for 10M tokens (10k pages)
- **gemini-2.5-flash:** $0.075 per 1M input tokens ≈ $0.75 for 10M tokens
- **Supabase Storage:** $0.021/GB/month
- **Edge Functions:** $2/month for 2M requests (Free tier: 500K)

**Total:** ~$3/month for 1,000 documents (10k pages)

## Sources

### Official Documentation
- [Supabase Edge Functions Architecture](https://supabase.com/docs/guides/functions/architecture)
- [Supabase Edge Functions Limits](https://supabase.com/docs/guides/functions/limits)
- [Supabase Background Tasks](https://supabase.com/docs/guides/functions/background-tasks)
- [Supabase Database Webhooks](https://supabase.com/docs/guides/database/webhooks)
- [Supabase pgvector HNSW Indexes](https://supabase.com/docs/guides/ai/vector-indexes/hnsw-indexes)
- [Supabase pgvector IVFFlat Indexes](https://supabase.com/docs/guides/ai/vector-indexes/ivf-indexes)
- [Deno Node and npm Compatibility](https://docs.deno.com/runtime/fundamentals/node/)
- [Deno Modules and Dependencies](https://docs.deno.com/runtime/fundamentals/modules/)
- [Google Gen AI SDK Documentation](https://googleapis.github.io/js-genai/)
- [Google Vertex AI Text Embeddings API](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/model-reference/text-embeddings-api)

### Package Documentation
- [@google/genai on npm](https://www.npmjs.com/package/@google/genai)
- [@langchain/textsplitters on npm](https://www.npmjs.com/package/@langchain/textsplitters)
- [unpdf on GitHub](https://github.com/unjs/unpdf)
- [pgvectorscale on GitHub](https://github.com/timescale/pgvectorscale)

### Blog Posts & Benchmarks
- [Supabase: pgvector v0.5.0 with HNSW](https://supabase.com/blog/increase-performance-pgvector-hnsw)
- [Supabase: Processing Large Jobs with Edge Functions](https://supabase.com/blog/processing-large-jobs-with-edge-functions)
- [Supabase: Edge Functions Background Tasks](https://supabase.com/blog/edge-functions-background-tasks-websockets)
- [Deno Blog: If You're Not Using npm Specifiers](https://deno.com/blog/not-using-npm-specifiers-doing-it-wrong)
- [Vector Search 2026: Pinecone vs Supabase pgvector](https://geetopadesha.com/vector-search-in-2026-pinecone-vs-supabase-pgvector-performance-test/)
- [Medium: Optimizing Vector Search at Scale](https://medium.com/@dikhyantkrishnadalai/optimizing-vector-search-at-scale-lessons-from-pgvector-supabase-performance-tuning-ce4ada4ba2ed)
- [Medium: How I Solved Background Jobs with Supabase](https://www.jigz.dev/blogs/how-i-solved-background-jobs-using-supabase-tables-and-edge-functions)

### Community Discussions
- [Supabase Discussion: Edge Function Timeout](https://github.com/orgs/supabase/discussions/40074)
- [Supabase Discussion: Can't import @google/generative-ai](https://github.com/supabase/supabase-js/issues/1345)
- [GitHub Issue: How to import in Deno?](https://github.com/google-gemini/deprecated-generative-ai-js/issues/319)

---

**Research Quality:** All versions verified as of 2026-01-23. Recommendations based on official docs, recent benchmarks, and codebase analysis.

**Confidence Summary:**
- High (90%+): @google/genai, pgvector, Deno 2.x, @langchain/textsplitters, @supabase/supabase-js
- Medium-High (70-90%): unpdf, HNSW indexing strategy
- Medium (50-70%): pgvectorscale (newer extension, less battle-tested)
