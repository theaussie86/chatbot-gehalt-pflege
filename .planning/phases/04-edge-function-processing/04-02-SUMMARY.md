---
phase: 04-edge-function-processing
plan: 02
subsystem: edge-function
tags: [embeddings, error-handling, batch-processing, promise-allsettled]
requires:
  - phase: 04
    plan: 01
    reason: "Bug fixes for Blob MIME type and error handling must be in place"
provides:
  - "Defensive embedding response parsing with SDK version compatibility"
  - "All-or-nothing document processing semantics"
  - "Real-time processing stage visibility"
  - "Chunk count tracking on successful completion"
affects:
  - phase: 04
    plan: 03
    how: "Defensive parsing and error handling now in place"
  - phase: 05
    plan: 01
    how: "Error retry can use processing_stage for targeted recovery"
tech-stack:
  added: []
  patterns:
    - "Promise.allSettled for batch operations with graceful failure handling"
    - "All-or-nothing semantics for document integrity"
    - "Multi-format API response parsing with fallbacks"
key-files:
  created:
    - apps/api/migrations/20260124154600_add_processing_columns.sql
  modified:
    - supabase/functions/process-embeddings/index.ts
decisions:
  - id: defensive-embedding-parsing
    choice: "Three fallback paths for embedding extraction (v1.x singular, v0.x array, direct)"
    rationale: "SDK version variations return different response structures; defensive parsing prevents silent failures"
  - id: all-or-nothing-document
    choice: "Any chunk failure fails entire document (per CONTEXT.md)"
    rationale: "Partial embeddings would result in incomplete search results; better to fail clearly and allow retry"
  - id: promise-allsettled
    choice: "Use Promise.allSettled instead of Promise.all for batch processing"
    rationale: "Captures all results (success and failure) before deciding on outcome; prevents cascading failures from hiding root cause"
metrics:
  duration: "2 minutes"
  completed: "2026-01-24"
---

# Phase 04 Plan 02: Defensive Embedding Parsing Summary

Defensive embedding response parsing with SDK version compatibility and Promise.allSettled for batch processing with all-or-nothing document failure semantics.

## What Was Built

### Migration: Processing Columns
- **processing_stage** column: Tracks current processing stage (downloading file, extracting text, embedding chunks, inserting chunks)
- **chunk_count** column: Stores number of chunks created after successful embedding
- Both columns enable real-time visibility into processing progress

### Defensive Embedding Parsing
- `extractEmbeddingValues()` helper function with 3 fallback paths:
  1. `embedResult?.embedding?.values` - v1.x SDK format (singular)
  2. `embedResult?.embeddings?.[0]?.values` - v0.x SDK format (array)
  3. `embedResult?.values` - Direct format
- Validates result is non-empty array
- Warns on unexpected dimensions (expected 768 for text-embedding-004)
- Logs full response structure on failure for debugging

### Promise.allSettled with All-or-Nothing Semantics
- Replaced `Promise.all` with `Promise.allSettled` to capture all results
- Separates successful and failed results into typed arrays
- **All-or-nothing check**: If any chunk fails, entire document fails
- Provides clear error message with failure count and first failure reason

### Processing Stage Visibility
- Status updates at each stage:
  - "downloading file" - Initial status
  - "extracting text" - During Gemini text extraction
  - "embedding chunks" - During embedding generation
  - "inserting chunks" - During database insert
  - null - Cleared on successful completion
- Enables real-time UI updates via Supabase realtime subscriptions

### Chunk Count Storage
- Stores `chunk_count` on successful completion
- Enables document metrics and monitoring

## Task Execution

| Task | Name | Commit | Key Changes |
|------|------|--------|-------------|
| 1 | Add migration and defensive parsing | 7603551 | Migration for processing_stage/chunk_count, extractEmbeddingValues helper |
| 2 | Implement Promise.allSettled | 7253a16 | Promise.allSettled, all-or-nothing check, stage updates, chunk_count storage |

## Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Embedding extraction fallbacks | 3 paths (v1.x, v0.x, direct) | SDK version compatibility without breaking changes |
| All-or-nothing semantics | Any chunk failure = document failure | Partial embeddings create incomplete search; clear failure enables retry |
| Promise.allSettled | Replace Promise.all | Captures all results before deciding; no cascading failure hiding |

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

1. **Migration check**: File exists with processing_stage and chunk_count columns
2. **extractEmbeddingValues**: Helper exists with 3 fallback paths, array validation, dimension check
3. **Promise.allSettled**: Used instead of Promise.all (line 213)
4. **All-or-nothing**: `if (failed.length > 0) throw Error` check present (line 239)
5. **Status flow**: processing (downloading) -> extracting text -> embedding chunks -> inserting chunks -> embedded

## Next Phase Readiness

**Ready for:**
- Plan 04-03: Additional edge function improvements
- Phase 5 Plan 01: Error retry can use processing_stage for targeted recovery

**Deployment required:**
```bash
supabase functions deploy process-embeddings
```

**Migration required:**
Apply `20260124154600_add_processing_columns.sql` in Supabase SQL Editor.

## Files Changed

### Created
- `apps/api/migrations/20260124154600_add_processing_columns.sql`

### Modified
- `supabase/functions/process-embeddings/index.ts`
  - Added `extractEmbeddingValues()` helper (lines 9-33)
  - Added processing_stage updates (lines 86, 127, 169, 253)
  - Replaced Promise.all with Promise.allSettled (line 213)
  - Added all-or-nothing failure check (lines 238-244)
  - Store chunk_count on completion (line 268)
  - Clear processing_stage on completion (line 269)
