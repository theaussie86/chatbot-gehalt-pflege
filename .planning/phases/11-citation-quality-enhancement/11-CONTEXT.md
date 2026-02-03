# Phase 11: Citation Quality Enhancement - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Enhance RAG responses with document name and page number citations for admin traceability. Users see clean answers without source references; admins see full citation data in the inquiry dashboard. This builds trust and debugging capability without exposing internal document names to end users.

</domain>

<decisions>
## Implementation Decisions

### Citation Visibility
- Admin-only citations — users see no source references in chat
- Full citations (document name + page number) visible in admin inquiry detail view
- No user-facing "Quelle" or document references

### Page Number Extraction
- Extract and store page numbers during document upload/processing (not at retrieval time)
- Extend existing Gemini extraction pipeline to capture page markers
- Store page range (e.g., "S. 12-13") when chunks span multiple pages
- Admin can manually trigger reprocessing for existing documents from dashboard

### Citation Granularity
- Only cite RAG-sourced answers (not general conversation)
- No similarity threshold for citations — cite all retrieved chunks when RAG is used
- Show top 3 most relevant chunks per response
- Consolidate by document — one entry per document with multiple page numbers listed (e.g., "TVöD_2025.pdf, S. 5, 12, 15")

### Error Handling
- Omit chunks without page numbers from citations (strict quality approach)
- Mark documents as "no page data" flag when page extraction fails
- Reprocessing failure results in document flag, not silent failure

### Claude's Discretion
- How to display empty citations state in admin (no citations vs explicit message)
- Whether to log detailed error reasons for page extraction failures
- Admin UI layout for citations within inquiry detail view

</decisions>

<specifics>
## Specific Ideas

- Citations exist purely for admin debugging and traceability — not for end-user trust signals
- Internal documents remain hidden from users since all citations are admin-only
- Existing Gemini File API pipeline should be extended, no new PDF parsing dependencies

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 11-citation-quality-enhancement*
*Context gathered: 2026-02-03*
