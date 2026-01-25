# Phase 5: Error Recovery - Context

**Gathered:** 2026-01-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Admin can reprocess failed documents without re-uploading. Reset document to pending, re-trigger the edge function pipeline. Single requirement: ERR-01.

</domain>

<decisions>
## Implementation Decisions

### Reprocess trigger
- Row action button in the documents table (icon button per row)
- Visible for documents with status 'error' OR 'embedded' (allows re-embedding if model changes)
- Simple confirmation dialog before starting: "Reprocess this document?"
- Single-document only — no bulk reprocess action

### Retry feedback
- Toast notification on trigger: "Reprocessing started"
- Status changes to 'pending' immediately in the UI
- Success toast when processing completes: document transitions to 'embedded'
- Error toast if reprocessing fails again: "Reprocessing failed"
- Error details updated with new failure info

### Pre-retry cleanup
- Delete existing chunks before reprocessing (avoid duplicates)
- Reset processing state: chunk_count=null, processing_stage=null
- Keep error history as array of attempts in error_details
  - Format: `[{attempt: 1, error: {...}, timestamp: ...}, {attempt: 2, error: {...}, timestamp: ...}]`
  - New errors append to array, previous failures preserved for debugging

### Claude's Discretion
- Icon choice for reprocess button (refresh, retry arrow, etc.)
- Confirmation dialog styling (match existing delete confirmation pattern)
- Toast duration and positioning
- Error history display in details panel

</decisions>

<specifics>
## Specific Ideas

- Reprocess should feel like a "retry" action, not a new upload
- Error history helps diagnose recurring issues (e.g., same document failing repeatedly)
- Already-embedded documents can be re-embedded if embedding model or chunking logic changes

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 05-error-recovery*
*Context gathered: 2026-01-25*
