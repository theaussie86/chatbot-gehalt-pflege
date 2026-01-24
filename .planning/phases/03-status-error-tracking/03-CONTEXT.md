# Phase 3: Status & Error Tracking - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Documents visibly reflect their pipeline state (pending → processing → embedded / error), and admins can understand what went wrong when processing fails. This phase adds status display, error visibility, and list management — not the processing logic itself (Phase 4) or reprocess functionality (Phase 5).

</domain>

<decisions>
## Implementation Decisions

### Status display
- Icon + text format for status (icon followed by status text)
- Right-aligned badge in the document row (no dedicated column)
- Muted color palette: slate (pending), sky (processing), emerald (embedded), rose (error)
- Processing state shows pulsing badge animation to indicate activity

### Error details
- Side panel opens when clicking a document row (slide-out from right)
- Technical error messages — precise, includes technical context (e.g., 'Embedding API timeout after 30s')
- Standard metadata shown: error message, timestamp, stage that failed (extraction/embedding/etc)
- Panel shows document context alongside error: filename, size, upload date

### State transitions
- Real-time updates via Supabase realtime subscription
- Fade transition when status changes (old fades out, new fades in)
- Newly uploaded documents prepend to the top of the list
- Toast notifications for both success ('Document embedded') and failure ('Processing failed')

### List interactions
- Toggle chips above the list for status filtering (can combine multiple)
- Chips show counts: 'Error (3)', 'Pending (2)', etc.
- Checkbox selection for bulk actions
- Bulk delete available now; bulk reprocess deferred to Phase 5

### Claude's Discretion
- Exact animation timing and easing
- Side panel width and close behavior
- Chip styling and active state appearance
- Empty state when filter shows no results

</decisions>

<specifics>
## Specific Ideas

- Muted palette means subtle, not screaming — colors that don't dominate the UI
- Side panel pattern similar to common admin dashboards (click row → details slide in)
- Toggle chips should be combinable (e.g., show both 'Error' and 'Pending' at once)

</specifics>

<deferred>
## Deferred Ideas

- Bulk reprocess action — Phase 5 (requires reprocess functionality)
- Status history/timeline per document — out of scope for v1

</deferred>

---

*Phase: 03-status-error-tracking*
*Context gathered: 2026-01-24*
