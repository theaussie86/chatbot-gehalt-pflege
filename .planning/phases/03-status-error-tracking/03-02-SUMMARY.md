---
phase: 03-status-error-tracking
plan: 02
subsystem: ui
tags: [react, supabase, realtime, shadcn, side-panel, error-display]

# Dependency graph
requires:
  - phase: 03-status-error-tracking
    plan: 01
    provides: Sheet component and status badges
provides:
  - Document details side panel with metadata display
  - Real-time status updates via Supabase realtime subscription
  - Error details display for failed documents
affects: [03-03]

# Tech tracking
tech-stack:
  added: [Supabase Realtime (postgres_changes channel)]
  patterns: [Sheet side panel pattern, Realtime subscription with cleanup, Toast notifications for status changes]

key-files:
  created: []
  modified:
    - apps/api/components/DocumentManager.tsx

key-decisions:
  - "Sheet panel shows complete document metadata including error_details for error status"
  - "Realtime subscription handles INSERT/UPDATE/DELETE with toast notifications"
  - "Local state (localDocuments) synced from props and updated via realtime"
  - "Selected document updates live if its status changes"
  - "Panel closes automatically if selected document is deleted"

patterns-established:
  - "DocumentDetailsPanel: Inline component for side panel content"
  - "Realtime subscription: UPDATE/DELETE/INSERT events with state updates and toasts"
  - "Error details display: Formatted JSONB error_details in red-tinted box"
  - "stopPropagation pattern: Action buttons don't trigger row click"

# Metrics
duration: 3min
completed: 2026-01-24
---

# Phase 3 Plan 2: Document Details Panel & Realtime Updates Summary

**Clicking document row opens side panel with metadata; Supabase realtime subscription updates status live with toast notifications**

## Performance

- **Duration:** 3 min
- **Started:** 2026-01-24T11:01:29Z
- **Completed:** 2026-01-24T11:04:16Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Document details side panel implemented with Sheet component
- Panel displays filename, status badge, upload date, MIME type, project association
- Error status documents show formatted error_details section (code, message, stage, timestamp)
- Download and Delete actions available in panel footer
- Real-time Supabase subscription updates document status without page refresh
- Toast notifications for status changes (processing, embedded, error)
- New documents appear at top of list automatically
- Deleted documents removed from list and close panel if selected
- Document rows clickable with hover state; action buttons use stopPropagation

## Task Commits

Each task was committed atomically:

1. **Task 1: Add document details side panel** - `8edd3fc` (feat)
2. **Task 2: Add Supabase realtime status updates** - `8a22473` (feat)

## Files Created/Modified
- `apps/api/components/DocumentManager.tsx` - Added DocumentDetailsPanel component, Sheet integration, Supabase realtime subscription (modified)

## Decisions Made

**Sheet panel for document details:**
- Chose Sheet over Dialog for contextual side-panel feel
- 400px/540px width responsive to screen size
- Shows all metadata in readable format with proper spacing

**Error details formatting:**
- Red-tinted box (rose-50/rose-900) matches error status badge color
- Shows all available error fields: message (prominent), code, stage, timestamp
- Uses same formatDate helper as upload date for consistency

**Realtime subscription strategy:**
- Single channel 'documents-changes' listens to all events
- UPDATE: Updates both localDocuments and selectedDocument states
- DELETE: Removes from list and closes panel if currently selected
- INSERT: Prepends to list (newest first) with toast notification
- Toast notifications provide immediate user feedback for status changes

**Local state synchronization:**
- localDocuments state initialized from props
- useEffect syncs on props change (server refresh)
- Realtime updates modify local state without server round-trip
- Dual source of truth: server props + realtime updates

**Row interaction pattern:**
- Entire row clickable with cursor-pointer and hover background
- stopPropagation on all action buttons (view, download, reprocess, delete)
- Prevents panel from opening when clicking action buttons
- Visual feedback: gray-50 background on hover

## Deviations from Plan

None - plan executed exactly as written.

---

**Total deviations:** 0
**Impact on plan:** No scope creep, all features delivered as specified.

## Issues Encountered

None - implementation was straightforward. Sheet component already installed in Plan 01, Supabase realtime API well-documented.

## User Setup Required

None - Supabase realtime already enabled on the project. No configuration changes needed.

## Next Phase Readiness

**Ready for Plan 03-03 (if planned) or Phase 4:**
- Document status updates work in real-time across browser tabs
- Error details visible in side panel
- Toast notifications provide user feedback
- All Phase 3 UI features complete

**Testing recommendations:**
1. Open /documents in two browser tabs
2. Upload a document in one tab
3. Verify it appears in the other tab without refresh
4. Simulate status change (via SQL: UPDATE documents SET status='error' WHERE id='...')
5. Verify both tabs update and show toast
6. Click document row to verify panel opens with all metadata
7. For error document, verify error_details section displays correctly

**Potential Phase 4 integration:**
- When edge function processes documents, status updates will appear live
- Error details from edge function will display in panel
- Users can watch processing happen in real-time

---
*Phase: 03-status-error-tracking*
*Completed: 2026-01-24*
