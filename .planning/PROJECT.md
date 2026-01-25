# Gehalt-Pflege Document Pipeline

## What This Is

A production-ready document management pipeline for the Gehalt-Pflege admin dashboard. Admins upload context documents (PDFs, text, spreadsheets), which are processed by an Inngest pipeline to extract text, generate embeddings, and store chunks. The chatbot uses these embeddings with source citations to answer domain-specific questions about German nursing tariffs.

## Core Value

Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

## Current State (v1.0 shipped)

**Shipped:** 2026-01-25

**What v1.0 delivered:**
- Atomic file operations (upload/delete/download with rollback)
- Real-time status tracking (pending -> processing -> embedded/error)
- Durable document processing via Inngest with automatic retries
- Error recovery (reprocess without re-uploading, error history)
- RAG-augmented chat with source citations

**Tech stack:**
- Next.js + Supabase (PostgreSQL, Storage, Realtime)
- Inngest for durable background processing
- Gemini 2.5 Flash for text extraction
- text-embedding-004 for 768-dim embeddings
- ~210,000 LOC TypeScript (full monorepo)

## Requirements

### Validated

- FILE-01: Admin can upload documents (PDF, text, spreadsheets) with size/type validation — v1.0
- FILE-02: Admin can delete document atomically (storage + DB + chunks) — v1.0
- FILE-03: Admin can download document via time-limited signed URL — v1.0
- STAT-01: Document status reflects pipeline state — v1.0
- STAT-02: Failed documents store error message — v1.0
- STAT-03: Admin UI displays document status with visual indicators — v1.0
- ERR-01: Admin can reprocess failed documents — v1.0
- ERR-02: Upload failure rolls back storage file — v1.0
- ERR-03: Delete failure is atomic — v1.0
- EDGE-01: Defensive embedding parsing — v1.0
- EDGE-02: Promise.allSettled for batch tolerance — v1.0
- EDGE-03: Durable steps with automatic retries — v1.0
- EDGE-04: Chunks inserted with correct embeddings — v1.0
- DB-01: Cascade delete for chunks — v1.0
- DB-02: Service role RLS for chunk insertion — v1.0
- DB-03: error_details JSONB column — v1.0

### Active

(None — fresh requirements defined in next milestone)

### Out of Scope

- Chat widget improvements — backend first, v1 focused on pipeline
- File versioning — users can delete and re-upload
- Format conversion — Gemini handles PDF, DOCX, TXT natively
- Custom embedding models — text-embedding-004 sufficient
- Real-time progress websockets — polling acceptable for v1
- Cancel in-progress processing — can reprocess instead

## Context

**Current codebase:**
- Full E2E document pipeline operational
- 16/16 v1 requirements satisfied
- Zero tech debt from v1

**Known issues:** None — all P0 bugs fixed in v1.0

**Technical environment:**
- Inngest for durable background processing (replaced Edge Functions)
- 768-dim embeddings via text-embedding-004
- 2000 char chunks with 100 char overlap
- 0.75 similarity threshold for RAG quality

## Constraints

- **Platform**: Next.js + Supabase (PostgreSQL, Storage, Realtime, RLS)
- **LLM Provider**: Vertex AI / Google Gemini
- **Storage**: Supabase Storage bucket `project-files`
- **Sync**: Compensating actions for atomicity (no distributed transactions)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Inngest over Edge Functions | Better durability, retries, observability | Good |
| DB-first delete pattern | Prevents orphaned DB records on storage failure | Good |
| Service role RLS via JWT claim | Edge function has NULL auth.uid() | Good |
| Promise.allSettled for batches | Partial failure tolerance | Good |
| Error history as array | Preserve retry attempts for debugging | Good |
| 0.75 similarity threshold | Filter low-quality RAG matches | Good |
| Compensating actions over transactions | Supabase doesn't support cross-service transactions | Good |
| Sequential bulk delete | Per-document atomicity, partial success reporting | Good |
| 5-minute signed URL expiry | Security-first approach | Good |
| 2000 char chunks / 100 overlap | Balances coherence with retrieval granularity | Good |

---
*Last updated: 2026-01-25 after v1.0 milestone*
