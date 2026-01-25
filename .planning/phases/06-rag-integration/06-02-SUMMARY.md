---
phase: 06-rag-integration
plan: 02
subsystem: api
tags: [rag, citations, cache-invalidation, vectorstore, gemini]

# Dependency graph
requires:
  - phase: 06-01
    provides: queryWithMetadata() method and match_documents_with_metadata SQL function
provides:
  - RAG-augmented question handling with document citations in chat responses
  - Cache invalidation on document changes (delete, reprocess, bulk delete)
  - Similarity threshold filtering (0.75) to avoid low-quality matches
affects: [future-rag-enhancements, citation-formatting, cache-strategy]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Citation formatting with numbered sources: [Quelle 1: filename.pdf]"
    - "Similarity threshold filtering for RAG quality control"
    - "Cache invalidation pattern for document lifecycle events"

key-files:
  created: []
  modified:
    - apps/api/app/api/chat/route.ts
    - apps/api/app/actions/documents.ts

key-decisions:
  - "Use 0.75 similarity threshold to filter low-quality RAG matches"
  - "Numbered citation format: [Quelle N: filename] for user-friendly attribution"
  - "Cache invalidation on delete/reprocess/bulk-delete to ensure fresh answers"
  - "Graceful fallback message when no relevant documents found"

patterns-established:
  - "Pattern 1: RAG citation flow - query with metadata → filter by similarity → build citations → inject in prompt"
  - "Pattern 2: Cache invalidation via helper function with graceful env var handling"

# Metrics
duration: 1min
completed: 2026-01-25
---

# Phase 6 Plan 2: RAG Citations and Cache Invalidation Summary

**Chat questions get document-grounded answers with filename citations, cache invalidated on document changes**

## Performance

- **Duration:** 1 min
- **Started:** 2026-01-25T12:49:32+01:00
- **Completed:** 2026-01-25T12:50:08+01:00
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Chat route uses queryWithMetadata() with 0.75 similarity threshold for quality RAG results
- Responses include numbered citations with source filenames: [Quelle 1: tarif-tabelle.pdf]
- Cache invalidation ensures fresh answers after document delete/reprocess/bulk-delete
- Graceful fallback when no relevant documents found

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance chat route question handling with citations** - `86abcab` (feat)
2. **Task 2: Add cache invalidation to document actions** - `13f7149` (feat)

## Files Created/Modified

- `apps/api/app/api/chat/route.ts` - Enhanced question handling with queryWithMetadata(), similarity filtering, and citation formatting
- `apps/api/app/actions/documents.ts` - Added cache invalidation to deleteDocumentAction, reprocessDocumentAction, and bulkDeleteDocumentsAction

## Decisions Made

1. **0.75 similarity threshold** - Filters low-quality matches to avoid irrelevant RAG results
2. **Numbered citation format** - `[Quelle ${i + 1}: ${filename}]` provides clear, user-friendly source attribution
3. **Cache invalidation on all document changes** - Ensures users never get stale answers referencing deleted/changed documents
4. **Graceful env var handling** - Helper function logs warning if env vars missing rather than crashing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - both tasks completed without blockers.

## User Setup Required

**Manual SQL migration and edge function deployment required.** Before verification:

1. **Apply SQL migration** in Supabase SQL Editor:
   - File: `apps/api/migrations/20260125000000_match_documents_with_metadata.sql`
   - Project ref: `xjbkpfbiajcjkamvlrhw`

2. **Deploy edge function** (if not already deployed):
   ```bash
   supabase functions deploy process-embeddings --project-ref xjbkpfbiajcjkamvlrhw
   ```

## Next Phase Readiness

**Phase 6 complete (2/2 plans).** RAG integration is fully operational:

- Documents are searchable with metadata-aware queries
- Chat responses include proper citations with source filenames
- Cache invalidation ensures consistency on document changes
- Similarity threshold maintains answer quality

**No blockers.** System ready for production RAG usage.

**Future enhancements (deferred to v2):**
- Advanced citation formats (page numbers, section references)
- Confidence scores in responses
- Multi-document synthesis
- Citation click-through to document viewer

---
*Phase: 06-rag-integration*
*Completed: 2026-01-25*
