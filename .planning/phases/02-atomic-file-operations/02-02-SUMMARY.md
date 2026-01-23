---
phase: 02-atomic-file-operations
plan: 02
subsystem: file-management
tags: [react, typescript, supabase, file-delete, file-download, signed-urls, atomicity, error-handling, sonner]

# Dependency graph
requires:
  - phase: 01-database-storage-foundation
    provides: Supabase storage bucket, RLS policies, and cascade delete configuration
  - phase: 02-01
    provides: Upload service with structured error handling pattern
provides:
  - Atomic delete operation using DB-first pattern to prevent orphaned DB records
  - Download with 5-minute signed URLs and expiry handling
  - Enhanced UI with separate view (open in tab) vs download (direct download) actions
  - Delete confirmation modal showing document name and embedding removal notice
affects: [02-03, FILE-02, FILE-03, ERR-03]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - DB-first delete pattern with compensating transaction (delete DB → delete storage)
    - URL caching with expiry tracking for signed URLs
    - Separate view vs download actions (click name vs click icon)

key-files:
  created: []
  modified:
    - apps/api/utils/documents.ts
    - apps/api/app/actions/documents.ts
    - apps/api/components/DocumentManager.tsx

key-decisions:
  - "DB-first delete pattern: delete DB record before storage file to prevent orphaned DB records"
  - "Storage cleanup failures after DB delete are logged but don't throw (orphaned files acceptable)"
  - "5-minute signed URL expiry (reduced from 1 hour) for enhanced security"
  - "Separate UI actions: click name to view in tab, click download icon for direct download"
  - "URL caching with expiry tracking to avoid regenerating URLs within 5-minute window"

patterns-established:
  - "Delete atomicity priority: Orphaned storage files (can clean later) > Orphaned DB records (cause user errors)"
  - "Signed URL response includes expiresAt timestamp for client-side refresh logic"
  - "Expired link toast with refresh action: 'Link expired. Click to generate new link.'"
  - "Delete confirmation modal shows document name: 'Delete \"filename.pdf\"? This will remove the file and all embeddings.'"

# Metrics
duration: 2.3min
completed: 2026-01-23
---

# Phase 02 Plan 02: Delete & Download Enhancement Summary

**DB-first atomic delete preventing orphaned records, 5-minute signed URLs for secure downloads, and enhanced UI separating view vs download actions**

## Performance

- **Duration:** 2 min 18 sec
- **Started:** 2026-01-23T16:06:20Z
- **Completed:** 2026-01-23T16:08:38Z
- **Tasks:** 3
- **Files modified:** 3

## Accomplishments

- Atomic delete using DB-first pattern: deletes DB record before storage file, preventing orphaned DB records
- 5-minute signed URLs (reduced from 1 hour) with expiresAt timestamp for client-side expiry handling
- Enhanced UI with separate view (click name → open in tab) and download (click icon → direct download) actions
- Delete confirmation modal shows document name and mentions embedding removal
- URL caching to avoid regenerating signed URLs within 5-minute window

## Task Commits

Each task was committed atomically:

1. **Task 1: Reorder delete operations for atomicity (DB-first)** - `13487bb` (refactor)
2. **Task 2: Update download signed URL to 5 minutes with expiry handling** - `8cf3633` (feat)
3. **Task 3: Enhance UI for download and delete confirmation** - `136b1e1` (feat)

## Files Created/Modified

- `apps/api/utils/documents.ts` - Reordered delete: DB first (with cascade to chunks), then storage; storage failures logged but don't throw
- `apps/api/app/actions/documents.ts` - Changed signed URL expiry from 3600s to 300s, added expiresAt to response
- `apps/api/components/DocumentManager.tsx` - Added view vs download handlers, URL cache with expiry, DownloadIcon component, enhanced delete modal

## Decisions Made

**1. DB-first delete pattern for atomicity**
- Rationale: Orphaned storage files are recoverable (can run cleanup job). Orphaned DB records pointing to deleted files cause user-facing errors.
- Implementation: Delete from documents table first (CASCADE removes chunks via FK), then delete from storage
- Impact: If storage delete fails, we log warning but don't throw. DB record is already gone, so no user-facing error.
- Trade-off: Accept occasional orphaned storage files (can be cleaned up later) to guarantee no orphaned DB records

**2. 5-minute signed URL expiry (reduced from 1 hour)**
- Rationale: Security-first approach per CONTEXT.md - shorter expiry reduces risk of URL sharing
- Implementation: Changed createSignedUrl parameter from 3600 to 300, added expiresAt timestamp to response
- Impact: URLs expire faster, requiring client-side refresh logic. Implemented with URL cache and expired link toast.

**3. Separate view vs download actions**
- Rationale: Different user intentions - view for quick check (PDF in browser), download for saving file
- Implementation: Click filename → handleView (opens in new tab), click download icon → handleDownload (direct download with filename)
- Impact: Clearer UX, follows CONTEXT.md decision

**4. URL caching with expiry tracking**
- Rationale: Avoid unnecessary signed URL regeneration within 5-minute window
- Implementation: Map<docId, {url, expiresAt}> stored in component state, check cache before calling action
- Impact: Reduces Supabase Storage API calls, faster view action on repeated clicks

## Deviations from Plan

None - plan executed exactly as written.

All DB-first delete logic, signed URL expiry changes, and UI enhancements implemented as specified in the plan tasks.

## Issues Encountered

None. Implementation proceeded smoothly with clear patterns established in 02-01.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for next plan (02-03: if exists):**
- Atomic delete pattern established for other file operations
- Signed URL pattern with expiry handling can be reused
- URL caching pattern applicable to other time-sensitive URLs

**Blockers/Concerns:**
None. Delete and download enhancements complete with all requirements met.

**Requirements Completed:**
- FILE-02: Atomic delete removes both storage file and database record with proper ordering
- FILE-03: Download via signed URLs (5-minute expiry) with separate view vs download actions
- ERR-03: Delete uses DB-first pattern preventing orphaned DB records

---
*Phase: 02-atomic-file-operations*
*Completed: 2026-01-23*
