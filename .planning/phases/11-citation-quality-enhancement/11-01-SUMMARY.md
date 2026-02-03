---
phase: 11-citation-quality-enhancement
plan: 01
subsystem: document-processing
tags: [inngest, pdf, page-extraction, citations, supabase]

dependency-graph:
  requires: [06-rag-integration]
  provides: [page-number-tracking, citation-metadata]
  affects: [11-02, 11-03]

tech-stack:
  added: []
  patterns: [page-marker-extraction, page-boundary-tracking]

key-files:
  created:
    - apps/api/migrations/20260203000000_add_page_data_to_chunks.sql
  modified:
    - apps/api/lib/inngest/functions/process-document.ts

decisions:
  - id: page-marker-format
    choice: "[PAGE:N] markers in Gemini extraction prompt"
    reason: "Simple regex-parseable format that Gemini can reliably produce"
  - id: page-tracking-strategy
    choice: "Track page boundaries during chunking, not post-hoc"
    reason: "More accurate than trying to map chunks back to pages after splitting"
  - id: has-page-data-flag
    choice: "Tri-state flag (null/true/false) on documents table"
    reason: "Distinguishes unprocessed from success/failure for backward compatibility"

metrics:
  duration: 2m
  completed: 2026-02-03
---

# Phase 11 Plan 01: Page Data Schema and Extraction Summary

**One-liner:** Database schema and Inngest function updates to extract and store page numbers during PDF processing for citation quality.

## What Was Built

### Database Schema (Migration)
- Added `page_start` and `page_end` INTEGER columns to `document_chunks` table
- Added `has_page_data` BOOLEAN column to `documents` table (null=unprocessed, true=success, false=failed)
- Updated `match_documents_with_metadata` SQL function to return page columns
- Updated `match_documents_global` SQL function to return page columns

### Page-Aware Document Processing
- Updated Gemini extraction prompt for PDFs to request `[PAGE:N]` markers before each page's content
- Implemented `parsePageMarkers()` function to extract page boundaries from extracted text
- Implemented `splitTextWithPageTracking()` to preserve page info through text chunking
- Chunks now store `page_start` and `page_end` when available (spans multi-page chunks)
- Documents flagged with `has_page_data` after processing based on whether any chunks have page data

## How It Works

1. **PDF Upload:** When a PDF is uploaded, the extraction prompt now includes instructions for Gemini to prefix each page's content with `[PAGE:1]`, `[PAGE:2]`, etc.

2. **Page Parsing:** The extracted text is parsed to identify page markers, creating a `PagedContent[]` array with page numbers.

3. **Chunk with Tracking:** Text is split using RecursiveCharacterTextSplitter (2000 char, 100 overlap) while tracking which pages each chunk spans.

4. **Storage:** Each chunk stores `page_start` and `page_end` columns. For multi-page chunks, both values differ; for single-page chunks, they're equal.

5. **Flag Setting:** After processing, `has_page_data` is set to `true` if any chunk has page data, `false` otherwise.

## Backward Compatibility

- Existing documents without page data continue to work (columns are nullable)
- Non-PDF documents (spreadsheets, text files) don't have pages and get null page values
- Page extraction failure doesn't fail processing - just sets `has_page_data = false`

## Files Changed

| File | Change |
|------|--------|
| `apps/api/migrations/20260203000000_add_page_data_to_chunks.sql` | New migration with schema changes and SQL function updates |
| `apps/api/lib/inngest/functions/process-document.ts` | Page-aware extraction, parsing, chunking, and storage |

## Verification

- [x] Migration creates page_start, page_end on document_chunks
- [x] Migration creates has_page_data on documents
- [x] Migration updates match_documents_with_metadata function
- [x] Process-document requests page markers for PDFs
- [x] Process-document stores page boundaries with chunks
- [x] Process-document sets has_page_data flag
- [x] TypeScript builds without errors

## Deviations from Plan

None - plan executed exactly as written.

## Next Phase Readiness

**For 11-02 (Citation Display in Admin):**
- `match_documents_with_metadata` now returns `page_start` and `page_end`
- `has_page_data` flag can filter documents with reliable citations
- Chunk data includes page boundaries for citation formatting

**Schema ready for:** "TVöD_2025.pdf, S. 5, 12, 15" citation format in admin UI.

## Commits

| Hash | Message |
|------|---------|
| 2600668 | feat(11-01): add page data columns to database schema |
| 90548a3 | feat(11-01): add page-aware document processing |
