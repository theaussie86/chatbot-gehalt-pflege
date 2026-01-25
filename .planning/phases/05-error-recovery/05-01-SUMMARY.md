---
phase: 05-error-recovery
plan: 01
subsystem: error-recovery
tags: [reprocessing, error-history, document-management, supabase-edge-functions]

# Dependency graph
requires:
  - phase: 04-edge-function-processing
    provides: Edge function document processing with error handling
  - phase: 03-status-error-tracking
    provides: Status tracking and error details UI panel
provides:
  - Complete reprocess workflow with chunk cleanup
  - Error history tracking across multiple retry attempts
  - Visual error history display in admin UI
affects: [06-rag-integration, future-monitoring]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Error history array format for tracking multiple processing attempts
    - Backward-compatible error_details field (single object or array)
    - useMemo for error normalization in React components

key-files:
  created: []
  modified:
    - apps/api/app/actions/documents.ts
    - supabase/functions/process-embeddings/index.ts
    - apps/api/components/DocumentManager.tsx

key-decisions:
  - "Preserve error history as array in error_details field to track multiple reprocess attempts"
  - "Convert legacy single-error format to array on first reprocess for backward compatibility"
  - "Delete document_chunks before reprocessing to ensure clean slate"
  - "Reset chunk_count and processing_stage to null on reprocess"

patterns-established:
  - "Error history pattern: array of error objects with attempt numbers"
  - "Backward-compatible error format handling (single object → array conversion)"
  - "Chunk cleanup before reprocessing to prevent orphaned data"

# Metrics
duration: 2min
completed: 2026-01-25
---

# Phase 05 Plan 01: Error Recovery Workflow Summary

**Admin can reprocess failed/embedded documents with full error history preservation and automatic chunk cleanup**

## Performance

- **Duration:** 2 min
- **Started:** 2026-01-25T11:05:45Z
- **Completed:** 2026-01-25T11:08:22Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments
- Reprocess action deletes chunks and preserves error history as array
- Edge function appends new errors to history with attempt numbers
- UI displays all retry attempts in stacked error cards
- Backward compatibility maintained for single-error documents

## Task Commits

Each task was committed atomically:

1. **Task 1: Enhance reprocessDocumentAction with cleanup and error history** - `69134ce` (feat)
2. **Task 2: Update edge function to append errors to history array** - `a394ee2` (feat)
3. **Task 3: Update error details panel to display error history** - `8673a2f` (feat)

## Files Created/Modified
- `apps/api/app/actions/documents.ts` - Reprocess action with chunk cleanup and error history preservation
- `supabase/functions/process-embeddings/index.ts` - Error handling that appends to error history array
- `apps/api/components/DocumentManager.tsx` - Error history display with attempt tracking

## Decisions Made

**Error history as array in error_details field**
- Preserves full debugging context across multiple retry attempts
- Single field avoids schema changes
- Backward compatible via type union (ErrorDetail[] | ErrorDetail | null)

**Chunk cleanup before reprocessing**
- Ensures clean slate for re-embedding
- Prevents orphaned chunks from failed attempts
- Maintains data integrity with cascade delete pattern

**Legacy format conversion on reprocess**
- Single error object converted to array format on first reprocess
- Enables seamless transition without breaking existing error documents
- useMemo normalizes format in UI for consistent rendering

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

**Supabase CLI not available in execution environment**
- Edge function changes committed but not deployed
- Manual deployment required: `supabase functions deploy process-embeddings --project-ref xjbkpfbiajcjkamvlrhw`
- This is expected - deployment can happen separately from code changes

## User Setup Required

**Manual edge function deployment needed:**

1. Deploy updated edge function:
   ```bash
   supabase functions deploy process-embeddings --project-ref xjbkpfbiajcjkamvlrhw
   ```

2. Verify deployment:
   - Upload a document that will fail processing
   - Click Reprocess button
   - Verify error history array is built correctly
   - Reprocess again to verify second attempt appends to history

## Next Phase Readiness

**Phase 5 Plan 01 complete** - Error recovery workflow implemented:
- Admins can retry failed documents without re-uploading
- Error debugging improved with full attempt history
- Chunk cleanup prevents data inconsistencies
- UI shows all error attempts with timestamps

**Ready for:**
- Phase 5 additional error recovery features (if planned)
- Phase 6 RAG integration (documents can be reliably reprocessed if needed)

**Deployment needed:**
- Edge function deployment required before E2E testing

---
*Phase: 05-error-recovery*
*Completed: 2026-01-25*
