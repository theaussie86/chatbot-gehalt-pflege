# Project State: Gehalt-Pflege Document Pipeline

**Project:** Gehalt-Pflege Document Pipeline
**Current Phase:** 6 (Complete)
**Current Plan:** 06-02 (Complete)
**Status:** Phase 6 Complete

## Project Reference

**File:** .planning/PROJECT.md

**Core value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

**Current focus:** All phases complete - awaiting human verification of RAG flow

## Current Position

**Phase 6 of 6:** RAG Integration (Complete)

**Goal:** Documents are used as context in chatbot responses with proper citations.

**Last activity:** 2026-01-25 - Completed 06-02-PLAN.md (RAG citations and cache invalidation)

**Next action:** Project complete - all 6 phases finished

## Progress

```
[████████████████████████████████████████████████████████] 100% (6/6 phases complete)

Phase 1: Database & Storage Foundation ........ ✓ Complete | 1/1 plans
Phase 2: Atomic File Operations ............... ✓ Complete | 3/3 plans
Phase 3: Status & Error Tracking .............. ✓ Complete | 3/3 plans
Phase 4: Durable Document Processing .......... ✓ Complete | 4/4 plans
Phase 5: Error Recovery ....................... ✓ Complete | 1/1 plans
Phase 6: RAG Integration ...................... ✓ Complete | 2/2 plans
```

| Phase | Status | Plans | Requirements | Progress |
|-------|--------|-------|--------------|----------|
| 1 | ✓ Complete | 1/1 | 3 (DB-01✓, DB-02✓, DB-03✓) | 100% |
| 2 | ✓ Complete | 3/3 | 5 (FILE-01✓, FILE-02✓, FILE-03✓, ERR-02✓, ERR-03✓) | 100% |
| 3 | ✓ Complete | 3/3 | 3 (STAT-01✓, STAT-02✓, STAT-03✓) | 100% |
| 4 | ✓ Complete | 4/4 | 4 (EDGE-01✓, EDGE-02✓, EDGE-03✓, EDGE-04✓) | 100% |
| 5 | ✓ Complete | 1/1 | 1 (ERR-01✓) | 100% |
| 6 | ✓ Complete | 2/2 | 2 (RAG-01✓, RAG-02✓) | 100% |

## Accumulated Context

### Known Issues

**P0-Blocking bugs identified in research:**
1. ~~RLS policies checking `auth.uid()` fail when service role has NULL uid~~ **FIXED in 04-01**
2. ~~Embedding API response structure: `embedResult.embeddings?.[0]?.values` may be undefined~~ **FIXED in 04-02**
3. ~~Blob MIME type: code uses `fileBlob.mime_type` but JavaScript Blob has `.type` property~~ **FIXED in 04-01**
4. ~~Gemini file upload response: code used `file.file.name` but response has `file.name` directly~~ **FIXED in 04-04**

**Post Phase 4 Complete:**
- All P0 bugs fixed and verified
- E2E document processing working: upload -> Inngest pipeline -> chunks with 768-dim embeddings
- Scanned PDFs process successfully via Gemini OCR (better than planned rejection)
- Realtime status updates visible during processing
- Chunk count displayed after successful embedding
- Architecture upgraded from Edge Function to Inngest for durable execution with built-in retries

### Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Fix foundation before features | Cannot build on broken RLS/schema; P0 bugs block all downstream work | 2026-01-23 |
| 6-phase structure (compressed from research 8) | Combine webhook setup into edge function phase, defer monitoring to v2 | 2026-01-23 |
| Phase 3 parallelizable with Phase 4 | UI/status tracking doesn't depend on edge function working | 2026-01-23 |
| Service role policy via JWT claim | Edge function uses service role key which has NULL auth.uid(), so use auth.jwt()->>'role' = 'service_role' check instead | 2026-01-23 |
| JSONB for error_details | Flexible schema allows storing different error types without schema changes | 2026-01-23 |
| Cascade delete requires no change | Already configured in 20260115120000_init_rag_pipeline.sql line 59 | 2026-01-23 |
| Sequential file processing for batch uploads | Provides predictable progress tracking and simpler error handling vs parallel processing | 2026-01-23 |
| 50MB file size limit | Balances usability with reasonable processing time for embedding generation | 2026-01-23 |
| Storage-first, DB-second with explicit rollback | Maintains existing pattern, adds compensating transaction for atomicity and visibility | 2026-01-23 |
| DB-first delete pattern | Orphaned storage files are recoverable (cleanup job); orphaned DB records cause user errors | 2026-01-23 |
| 5-minute signed URL expiry | Security-first approach - shorter expiry reduces risk of URL sharing vs convenience | 2026-01-23 |
| Separate view vs download actions | Different user intentions - view for quick check (browser), download for saving | 2026-01-23 |
| Direct browser upload for files >1MB | Bypasses Next.js server action size limit using Supabase browser client | 2026-01-24 |
| Muted color palette for status badges | Subtle, non-dominating colors (slate/sky/emerald/rose) for professional UI | 2026-01-24 |
| Set-based filter state for multi-select | Efficient toggle operations and OR logic for combining multiple status filters | 2026-01-24 |
| Proactive Sheet component installation | Install Plan 02 dependency during Plan 01 to eliminate setup work from next plan | 2026-01-24 |
| Sheet panel for document details | Provides contextual metadata view without navigation; 400px/540px responsive width | 2026-01-24 |
| Real-time via Supabase postgres_changes | Live status updates without polling; toast notifications provide immediate feedback | 2026-01-24 |
| Local state sync pattern | localDocuments synced from props and updated via realtime for dual source of truth | 2026-01-24 |
| Set-based checkbox selection | Set<string> for O(1) toggle/has operations; efficient for large lists | 2026-01-24 |
| Sequential bulk delete with per-item atomicity | Process documents one-by-one with individual success/failure tracking vs single transaction | 2026-01-24 |
| Realtime enablement via migration | Documents table explicitly added to supabase_realtime publication for live updates | 2026-01-24 |
| Store documentId at function scope | Variables declared before try block allow catch/finally blocks to access them | 2026-01-24 |
| Finally block for Gemini cleanup | Guarantees file deletion runs regardless of success/failure | 2026-01-24 |
| Fallback MIME type pattern | `fileBlob.type \|\| document.mime_type` ensures type is always available | 2026-01-24 |
| Defensive embedding parsing | 3 fallback paths (v1.x, v0.x, direct) for SDK version compatibility | 2026-01-24 |
| All-or-nothing document semantics | Any chunk failure fails entire document; partial embeddings create incomplete search | 2026-01-24 |
| Promise.allSettled for batches | Captures all results before deciding outcome; no cascading failure hiding | 2026-01-24 |
| Chunk size 2000 chars | Middle of 1000-3000 range per CONTEXT.md; balances semantic coherence with retrieval granularity | 2026-01-24 |
| Chunk overlap 100 chars | Per CONTEXT.md specification; provides context continuity at chunk boundaries | 2026-01-24 |
| Paragraph-first separators | Semantic chunking respects document structure by splitting on \\n\\n first | 2026-01-24 |
| Image-only PDF heuristic | >1000 bytes/char AND <100 chars extracted detects scanned PDFs | 2026-01-24 |
| Spreadsheet markdown extraction | File-type specific prompts convert tables to markdown format for embedding | 2026-01-24 |
| Gemini file response structure | File upload returns file.name directly, not nested in file.file.name | 2026-01-25 |
| Error history as array in error_details | Preserves full debugging context across multiple retry attempts; single field avoids schema changes | 2026-01-25 |
| Chunk cleanup before reprocessing | Ensures clean slate for re-embedding; prevents orphaned chunks from failed attempts | 2026-01-25 |
| Legacy error format conversion on reprocess | Single error object converted to array format on first reprocess for seamless transition | 2026-01-25 |
| Filter by status='embedded' in search | Only embedded documents searchable to exclude failed/processing documents from results | 2026-01-25 |
| Preserve existing query() method | Maintain backward compatibility by adding queryWithMetadata() rather than modifying existing method | 2026-01-25 |
| 0.75 similarity threshold for RAG | Filters low-quality matches to avoid irrelevant RAG results in chat responses | 2026-01-25 |
| Numbered citation format | [Quelle N: filename] provides clear, user-friendly source attribution in responses | 2026-01-25 |
| Cache invalidation on document changes | Ensures users never get stale answers referencing deleted/changed documents | 2026-01-25 |
| Inngest replaces Edge Function | Durable execution with built-in retries (3 attempts), no timeout limits, better observability via dashboard | 2026-01-25 |
| Vertex AI inline data | Use base64 inline data instead of Gemini File API for compatibility with Vertex AI | 2026-01-25 |
| Programmatic trigger via inngest.send() | Cleaner than SQL webhook triggers; called from server actions on upload/reprocess | 2026-01-25 |

### Active TODOs

**Phase 1 complete:**
- [x] Apply migration 20260123000000_phase1_foundation.sql in Supabase SQL Editor
- [x] Run verification queries to confirm fixes
- [x] Test document processing with real document upload to verify chunks are inserted

**Phase 2 complete:**
- [x] Upload validation (size, MIME type)
- [x] Drag-drop upload zone with batch progress
- [x] Rollback visibility in error toasts
- [x] DB-first atomic delete
- [x] 5-minute signed URL downloads
- [x] Direct browser upload for large files (>1MB)

**Phase 3 complete:**
- [x] Plan 01: Status badges with icons and filter chips
- [x] Plan 02: Document details panel and realtime updates
- [x] Plan 03: Checkbox selection and bulk delete with human verification

**Phase 4 complete:**
- [x] Plan 01: Fix Blob MIME type, error handling, Gemini cleanup
- [x] Plan 02: Defensive embedding parsing, Promise.allSettled, processing stage visibility
- [x] Plan 03: Improved chunking (2000/100), MIME validation, spreadsheet markdown, image-only PDF detection
- [x] Plan 04: Deploy and verify E2E processing
- [x] Apply migration 20260124154600_add_processing_columns.sql
- [x] Inngest pipeline deployed (replaced Edge Function)
- [x] E2E verification passed (PDF, text files, scanned PDFs via OCR)

**Phase 5 complete:**
- [x] Plan 01: Reprocess workflow with error history
- [x] Chunk cleanup before reprocessing
- [x] Error history tracking in array format
- [x] UI display of all retry attempts
- [x] Inngest pipeline handles reprocessing with durable execution

**Phase 6 complete:**
- [x] Plan 01: Metadata-aware semantic search
  - [x] match_documents_with_metadata SQL function
  - [x] queryWithMetadata() method in VectorstoreService
  - [ ] Apply SQL migration to Supabase (manual step)
- [x] Plan 02: RAG citations and cache invalidation
  - [x] queryWithMetadata() integrated in chat route
  - [x] Similarity threshold filtering (0.75)
  - [x] Citation formatting with source filenames
  - [x] Cache invalidation on delete/reprocess/bulk-delete

**Deferred to later phases:**
- Monitoring tools (stale document detection, processing duration metrics) - v2
- Optimization (progress tracking, rate limiting, orphan cleanup) - v2
- Automatic retry with exponential backoff - v2

### Blockers

**Manual SQL migration required:**
- SQL function match_documents_with_metadata created in migration file but not applied to database
- Apply via Supabase SQL Editor: `apps/api/migrations/20260125000000_match_documents_with_metadata.sql`
- Project ref: xjbkpfbiajcjkamvlrhw
- queryWithMetadata() method will work after migration applied

**No edge function deployment needed:**
- Edge function removed in commit 3c09ead - replaced by Inngest pipeline
- Inngest is configured and running automatically via `/api/inngest` route

### Open Questions

1. ~~Has text-embedding-004 been deprecated?~~ **RESOLVED** - Model works, E2E verified
2. ~~What are actual edge function timeout limits under load?~~ **RESOLVED** - Migrated to Inngest which has no timeout limits (durable background execution)

## Session Continuity

**Last command:** `/gsd:execute-plan 06-02`

**Last session:** 2026-01-25

**Stopped at:** Completed 06-02-PLAN.md - RAG citations and cache invalidation

**Resume file:** None

**Context for next session:**
- **Plan 06-02 complete** - RAG citations and cache invalidation:
  - Chat route uses queryWithMetadata() with 0.75 similarity threshold
  - Responses include numbered citations: [Quelle N: filename]
  - Cache invalidation on delete/reprocess/bulk-delete
  - Graceful fallback when no relevant documents found
  - TypeScript compiles without errors
- **Phase 6 complete - All 6 phases finished!**
- **Architecture note:** Document processing migrated from Edge Function to Inngest for durable execution
- **Remaining blocker:** SQL migration needs manual application via Supabase SQL Editor

---

*Last updated: 2026-01-25*
*Phase 6 complete - All phases finished!*
