# Phase 2: Atomic File Operations - Context

**Gathered:** 2026-01-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Admins can upload, delete, and download documents with compensating transactions that prevent orphaned files or database records. This phase delivers the core file operations UI and backend services with dual-write safety. Processing (embedding) is a separate phase.

</domain>

<decisions>
## Implementation Decisions

### Upload experience
- Drag-drop zone with click-to-browse button
- Batch upload supported (multiple files at once)
- Overall progress indicator for the batch (not per-file)
- Validation happens server-side (after upload attempt, not on file selection)

### Delete confirmation
- Confirmation modal required before delete
- Modal includes document name: "Delete \"Tariftabelle_2025.pdf\"? This will remove the file and all embeddings."
- Single document delete only (no batch delete)
- Hard delete — immediate removal from storage + database

### Error feedback
- Toast notifications for errors (non-blocking, auto-dismiss)
- Show rollback process: "Upload failed. Cleaning up..." then "File removed."
- Failed uploads include retry button in the toast
- Error messages include error code: "Upload failed: file too large (ERR_SIZE_LIMIT)"

### Download behavior
- Click document name → opens in new tab (PDFs viewable inline)
- Explicit download icon button for direct download
- Signed URLs valid for 5 minutes (short for security)
- Expired link shows error with refresh option: "Link expired. Click to generate new link."

### Claude's Discretion
- Exact toast positioning and timing
- Drop zone visual styling (border, colors, hover states)
- Progress indicator design (bar vs percentage vs spinner)
- Error code naming convention

</decisions>

<specifics>
## Specific Ideas

- Rollback visibility is important — admin should understand the system is keeping things consistent
- Error codes help support debugging without exposing full technical details
- Short signed URLs (5 min) preferred over convenience — security first

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-atomic-file-operations*
*Context gathered: 2026-01-23*
