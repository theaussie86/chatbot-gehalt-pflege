# Phase 4: Edge Function Processing - Context

**Gathered:** 2026-01-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Edge function creates chunks with embeddings in document_chunks table when triggered by document upload. Downloads file from storage, extracts text via Gemini, splits into semantic chunks, generates embeddings, and inserts into database. Fixes identified P0 bugs: RLS policy issues, embedding response parsing, Blob MIME type access.

</domain>

<decisions>
## Implementation Decisions

### Chunking strategy
- Semantic chunking (paragraphs/sections) — respect document structure
- ~100 character overlap between chunks to preserve context at boundaries
- Target chunk size: 1000-3000 characters — balanced for tariff documents with tables/lists
- Chunk metadata: document_id + chunk index only (no page/section position tracking)

### Failure classification
- All-or-nothing processing — if any chunk fails, entire document fails
- No automatic retry — fail fast, admin uses Phase 5 UI to manually reprocess
- Full technical error details stored in error_details JSONB (API response, chunk index, stack trace)
- 60 second timeout per document — conservative limit, large documents may need split

### Processing feedback
- Status + processing stage updates: "processing: extracting text" / "processing: embedding chunks"
- Chunk count shown in UI after completion: "42 chunks created"
- Live updates via Supabase realtime (already implemented in Phase 3)
- Processing logs stored only on error — successful processing uses function logs only

### File type handling
- Supported formats: PDF, plain text (.txt, .md), spreadsheets (.xlsx, .csv)
- Spreadsheets converted to markdown table format for embedding
- Extraction failure = immediate error status — no fallback attempts
- Scanned/image-only PDFs rejected with clear message: "This PDF contains only images. Please upload text-based PDF."

### Claude's Discretion
- Exact semantic chunking algorithm implementation
- Embedding API batch size optimization
- Markdown table formatting details for spreadsheets
- Detection method for image-only PDFs

</decisions>

<specifics>
## Specific Ideas

- Processing should feel responsive — status updates in realtime so admin knows something is happening
- Error messages should be technical enough for debugging without admin needing to check Supabase logs directly

</specifics>

<deferred>
## Deferred Ideas

- Automatic retry with exponential backoff — noted in STATE.md as v2 feature
- OCR support for scanned PDFs — explicitly rejected for now, could revisit
- Progress percentage during processing (e.g., "50% embedded") — adds complexity, chunk count sufficient

</deferred>

---

*Phase: 04-edge-function-processing*
*Context gathered: 2026-01-24*
