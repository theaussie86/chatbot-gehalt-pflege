# Roadmap: Gehalt-Pflege Document Pipeline

**Created:** 2026-01-23
**Depth:** standard
**Phases:** 6
**Coverage:** 16/16 v1 requirements mapped

## Overview

This roadmap transforms the document pipeline from a broken state (chunks not being created) to a production-ready system where admins can upload, process, and search documents reliably.

| Phase | Name | Goal | Requirements |
|-------|------|------|--------------|
| 1 | Database & Storage Foundation | Database schema and storage are correct and secure | DB-01, DB-02, DB-03 |
| 2 | Atomic File Operations | Admins can upload, delete, and download documents without data loss | FILE-01, FILE-02, FILE-03, ERR-02, ERR-03 |
| 3 | Status & Error Tracking | Documents show clear status and admins can diagnose failures | STAT-01, STAT-02, STAT-03 |
| 4 | Durable Document Processing | Inngest pipeline creates chunks with embeddings in database | EDGE-01, EDGE-02, EDGE-03, EDGE-04 |
| 5 | Error Recovery | Admins can recover from failures without re-uploading | ERR-01 |
| 6 | RAG Integration | Chatbot uses document context to answer domain questions | (Integration phase, no new requirements) |

## Progress Table

| Phase | Status | Plans | Progress |
|-------|--------|-------|----------|
| 1 | ✓ Complete | 1/1 | 100% |
| 2 | ✓ Complete | 3/3 | 100% |
| 3 | ✓ Complete | 3/3 | 100% |
| 4 | ✓ Complete | 4/4 | 100% |
| 5 | ✓ Complete | 1/1 | 100% |
| 6 | ✓ Complete | 2/2 | 100% |

---

## Phase 1: Database & Storage Foundation

**Goal:** Database schema and storage bucket are correctly configured with secure RLS policies that allow the processing pipeline to insert chunks.

**Requirements:**
- **DB-01**: Deleting a document cascades to delete all associated chunks
- **DB-02**: RLS policies allow service role to insert into document_chunks
- **DB-03**: Documents table has error_details JSONB column for storing failure details

**Plans:** 1 plan

Plans:
- [x] 01-01-PLAN.md - Fix RLS policies, add error_details column, verify cascade delete

**Success Criteria:**
1. Service role can insert into document_chunks table (verified via SQL console)
2. Deleting a document automatically removes all associated chunks (verified via foreign key cascade)
3. Documents table has error_details JSONB column (verified via schema inspection)
4. Storage bucket project-files exists with proper access policies (verified via Supabase dashboard)

**Dependencies:** None (foundation phase)

**Why this first:** Research identified P0-blocking bug: RLS policies checking `auth.uid()` fail when service role has NULL uid. Cannot proceed to processing without fixing the data layer. This phase establishes the correct schema and permissions for all downstream work.

---

## Phase 2: Atomic File Operations

**Goal:** Admins can upload, delete, and download documents with compensating transactions that prevent orphaned files or database records.

**Requirements:**
- **FILE-01**: Admin can upload documents (PDF, text, spreadsheets) with size/type validation
- **FILE-02**: Admin can delete document atomically (storage file + DB record + chunks removed together)
- **FILE-03**: Admin can download document via time-limited signed URL
- **ERR-02**: Upload failure rolls back: if DB insert fails, storage file is deleted
- **ERR-03**: Delete failure is atomic: storage and DB deletion succeed together or both fail

**Plans:** 3 plans

Plans:
- [x] 02-01-PLAN.md - Upload service with drag-drop UI, validation, and rollback visibility
- [x] 02-02-PLAN.md - Atomic delete (DB-first) and 5-minute signed URL downloads
- [x] 02-03-PLAN.md - Human verification of complete file operations workflow

**Success Criteria:**
1. User can upload a PDF and see it appear in the documents list
2. Upload interrupted after storage write (simulated DB failure) leaves no orphaned file in storage bucket
3. User can delete a document and verify both storage file and DB record are removed
4. User can click download and receive a file via time-limited signed URL
5. Delete interrupted (simulated) leaves database and storage in consistent state (both present or both absent)

**Dependencies:** Phase 1 (requires schema with error_details column, RLS policies)

**Why this second:** Upload/delete services use dual-write pattern with compensating transactions. Research shows storage-database sync failures are common pitfall. This phase provides the foundation for all document operations before building async processing.

---

## Phase 3: Status & Error Tracking

**Goal:** Documents visibly reflect their pipeline state, and admins can understand what went wrong when processing fails.

**Requirements:**
- **STAT-01**: Document status reflects pipeline state: pending → processing → embedded / error
- **STAT-02**: Failed documents store error message explaining what went wrong
- **STAT-03**: Admin UI displays document status with visual indicators

**Plans:** 3 plans

Plans:
- [x] 03-01-PLAN.md — Status badges with icons and filter chips with counts
- [x] 03-02-PLAN.md — Document details side panel and real-time status updates
- [x] 03-03-PLAN.md — Checkbox selection, bulk delete, and human verification

**Success Criteria:**
1. Newly uploaded document shows status "pending" in admin UI
2. Failed document shows status "error" with human-readable error message
3. Successfully processed document shows status "embedded"
4. Admin UI shows visual status indicators (colors, icons) for each state
5. Admin can view error details without checking database directly

**Dependencies:** Phase 2 (requires upload service and documents table)

**Why this third:** Status tracking enables observability before building complex async processing. Admin needs visibility into what's happening with documents. This phase completes the user-facing upload/status workflow and can be built in parallel with Phase 4 webhook setup.

---

## Phase 4: Durable Document Processing

**Goal:** Inngest pipeline successfully creates chunks with embeddings in document_chunks table when triggered by document upload.

**Requirements:**
- **EDGE-01**: Processing pipeline parses embedding API response defensively (handles structure variations)
- **EDGE-02**: Batch embedding uses Promise.allSettled for partial failure tolerance
- **EDGE-03**: Durable steps with automatic retries (up to 3 attempts per step)
- **EDGE-04**: Chunks are inserted into document_chunks table with correct embeddings

**Plans:** 4 plans

Plans:
- [x] 04-01-PLAN.md — Fix Blob MIME type, error handling, request body parsing
- [x] 04-02-PLAN.md — Defensive embedding parsing and Promise.allSettled batch processing
- [x] 04-03-PLAN.md — Improved chunking and file type handling
- [x] 04-04-PLAN.md — Deploy and verify end-to-end processing

**Success Criteria:**
1. Document uploaded triggers Inngest workflow (verified via Inngest dashboard)
2. Pipeline downloads file, extracts text via Gemini, and creates chunks
3. Chunks appear in document_chunks table with 768-dimensional embeddings
4. Partial batch failure (1 chunk fails out of 100) doesn't kill entire document processing
5. Durable execution with automatic retries handles transient failures

**Dependencies:**
- Phase 1 (requires RLS policies fixed)
- Phase 2 (requires upload service creating documents)
- Inngest triggered programmatically via `inngest.send()` from server actions

**Why this fourth:** This is the core processing pipeline. Research identified P0 bugs: embedding response structure assumptions, Blob MIME type property access, Promise.all failure cascade. Fixes all three issues to make chunks actually appear. Architecture upgraded from Edge Function to Inngest for durable execution with built-in retries.

**Architecture Note (2026-01-25):** Originally implemented as Supabase Edge Function, later migrated to Inngest for better durability, observability, and retry handling. Edge function removed in commit 3c09ead.

---

## Phase 5: Error Recovery

**Goal:** Admins can recover from processing failures by reprocessing documents without re-uploading.

**Requirements:**
- **ERR-01**: Admin can reprocess failed documents (reset to pending, re-trigger pipeline)

**Plans:** 1 plan

Plans:
- [x] 05-01-PLAN.md — Complete reprocess workflow with error history

**Success Criteria:**
1. Admin sees "Reprocess" button on documents with status "error" or "embedded"
2. Clicking reprocess changes status back to "pending"
3. Inngest pipeline re-executes and processes document again
4. Successfully reprocessed document transitions from error → pending → processing → embedded
5. Error history preserved as array, visible in details panel

**Dependencies:**
- Phase 3 (requires status tracking UI)
- Phase 4 (requires working Inngest pipeline)

**Why this fifth:** Error recovery requires working processing pipeline to test against. Status-based state machine enables retry without re-upload. This completes the error handling workflow identified in research as "should have" feature.

---

## Phase 6: RAG Integration

**Goal:** Chatbot uses embedded documents to provide context-aware answers about German nursing tariffs.

**Requirements:** (Integration phase - no new requirements, uses existing VectorstoreService)

**Plans:** 2 plans

Plans:
- [x] 06-01-PLAN.md — Metadata-aware search (SQL function + VectorstoreService enhancement)
- [x] 06-02-PLAN.md — Chat route integration with citations + cache invalidation

**Success Criteria:**
1. User asks salary question in chatbot and receives answer augmented with document context
2. VectorstoreService query returns top-k relevant chunks from document_chunks table
3. Chat response includes citation of which document provided context
4. Questions about newly uploaded documents receive updated answers (cache invalidation works)
5. Semantic search finds relevant chunks even when query uses different terminology

**Dependencies:** Phase 4 (requires document_chunks populated with embeddings)

**Why this sixth:** RAG integration is the final delivery that makes documents useful. Existing VectorstoreService provides the infrastructure; this phase integrates it with the chat endpoint and validates end-to-end flow from admin upload to chatbot response.

---

## Coverage Validation

All 16 v1 requirements mapped:

| Requirement | Phase | Category |
|-------------|-------|----------|
| DB-01 | 1 | Database Integrity |
| DB-02 | 1 | Database Integrity |
| DB-03 | 1 | Database Integrity |
| FILE-01 | 2 | File Operations |
| FILE-02 | 2 | File Operations |
| FILE-03 | 2 | File Operations |
| ERR-02 | 2 | Error Recovery |
| ERR-03 | 2 | Error Recovery |
| STAT-01 | 3 | Status Tracking |
| STAT-02 | 3 | Status Tracking |
| STAT-03 | 3 | Status Tracking |
| EDGE-01 | 4 | Edge Function Processing |
| EDGE-02 | 4 | Edge Function Processing |
| EDGE-03 | 4 | Edge Function Processing |
| EDGE-04 | 4 | Edge Function Processing |
| ERR-01 | 5 | Error Recovery |

**No orphaned requirements.**

---

## Notes

**Critical path:** Phases 1 -> 2 -> 4 -> 6 are sequential (each depends on previous). Phase 3 can be built in parallel with Phase 4. Phase 5 requires both 3 and 4 complete.

**Architecture evolution:** Phase 4 was originally implemented with Supabase Edge Functions but migrated to Inngest for:
- Durable execution with automatic retries (3 attempts per step)
- Better observability via Inngest dashboard
- No timeout limits (background job execution)
- Programmatic triggering via `inngest.send()` instead of SQL webhooks

**Compression rationale:** Research suggested 8 phases, but several can be combined without losing coherence:
- Research Phase 1 (Foundation & Bug Fixes) maps to our Phase 1
- Research Phase 2 (Upload & Sync) + Phase 3 (Controllers & UI) maps to our Phase 2 + 3
- Research Phase 4 (Webhooks) + Phase 5 (Edge Function) maps to our Phase 4 (now Inngest pipeline)
- Research Phase 6 (RAG) maps to our Phase 6
- Research Phase 7 (Monitoring) deferred to v2 (monitoring happens naturally via status tracking in Phase 3)
- Research Phase 8 (Optimization) deferred to v2

This compression maintains natural delivery boundaries while hitting standard depth (6 phases = 5-8 target).

---

*Last updated: 2026-01-25 - All phases complete - Milestone v1.0 ready for audit*
