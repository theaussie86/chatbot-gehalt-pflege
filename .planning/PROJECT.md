# Gehalt-Pflege Document Pipeline

## What This Is

A robust document management pipeline for the Gehalt-Pflege admin dashboard. Enables admins to upload context documents (PDFs, text, spreadsheets), which are processed by a Supabase edge function to extract text, generate embeddings, and store chunks for RAG retrieval. The chat widget uses these embeddings to answer domain-specific questions about German nursing tariffs.

## Core Value

Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

## Requirements

### Validated

- ✓ Chat endpoint with state machine interview flow — existing
- ✓ Gemini integration for text extraction and embeddings — existing (migrated to Vertex AI)
- ✓ Supabase Storage bucket `project-files` — existing
- ✓ Database schema with `documents` and `document_chunks` tables — existing
- ✓ Basic admin dashboard with authentication — existing
- ✓ VectorstoreService for RAG queries — existing

### Active

- [ ] Edge function creates chunks in `document_chunks` table (currently broken)
- [ ] Upload operation is atomic: storage + DB succeed together or both rollback
- [ ] Delete operation is atomic: removes file, DB record, and all chunks
- [ ] Download generates signed URLs for authorized users
- [ ] Reprocess action resets document to `pending` and re-triggers embedding
- [ ] Document status reflects pipeline state: `pending` → `processing` → `embedded` / `error`
- [ ] Admin UI displays document status and allows reprocessing failed documents

### Out of Scope

- Chat widget improvements — backend first
- New document types beyond PDF/text/spreadsheets — current types sufficient
- Real-time processing status updates — polling is acceptable for now
- Multi-user collaboration on documents — single-admin workflow for v1

## Context

**Current state:**
- Edge function (`supabase/functions/process-embeddings/index.ts`) triggers correctly and authenticates, but doesn't create chunks in the database
- Upload service has partial sync handling (cleans up storage if DB insert fails)
- Delete service doesn't handle partial failures robustly
- Admin UI exists but may need status display improvements

**Technical environment:**
- Supabase edge functions run on Deno
- Embeddings via Google `text-embedding-004` model
- Text extraction via Gemini 2.5 Flash
- Chunks are 1000 chars with 200 char overlap

**Known issues:**
- Embedding API response structure may have changed — need to verify `embedResult.embeddings[0].values` path
- No transaction support across storage + DB operations (need compensating actions)

## Constraints

- **Platform**: Supabase edge functions (Deno runtime, limited to Supabase SDK patterns)
- **LLM Provider**: Vertex AI / Google Gemini (recently migrated)
- **Storage**: Must use Supabase Storage bucket `project-files`
- **Sync**: No distributed transactions — must use compensating actions for rollback

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use Supabase edge function for processing | Native integration, automatic scaling, webhook trigger | — Pending |
| Compensating actions over distributed transactions | Supabase doesn't support cross-service transactions | — Pending |
| Status field on documents table | Simple state tracking without separate job queue | — Pending |

---
*Last updated: 2026-01-23 after initialization*
