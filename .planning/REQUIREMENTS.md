# Requirements: Gehalt-Pflege Document Pipeline

**Defined:** 2026-01-23
**Core Value:** Documents uploaded by admins must reliably become searchable context for the chatbot

## v1 Requirements

Requirements for the document pipeline milestone. Each maps to roadmap phases.

### File Operations

- [x] **FILE-01**: Admin can upload documents (PDF, text, spreadsheets) with size/type validation
- [x] **FILE-02**: Admin can delete document atomically (storage file + DB record + chunks removed together)
- [x] **FILE-03**: Admin can download document via time-limited signed URL

### Status Tracking

- [x] **STAT-01**: Document status reflects pipeline state: pending → processing → embedded / error
- [x] **STAT-02**: Failed documents store error message explaining what went wrong
- [x] **STAT-03**: Admin UI displays document status with visual indicators

### Error Recovery

- [ ] **ERR-01**: Admin can reprocess failed documents (reset to pending, re-trigger pipeline)
- [x] **ERR-02**: Upload failure rolls back: if DB insert fails, storage file is deleted
- [x] **ERR-03**: Delete failure is atomic: storage and DB deletion succeed together or both fail

### Edge Function Processing

- [ ] **EDGE-01**: Edge function parses embedding API response defensively (handles structure variations)
- [ ] **EDGE-02**: Batch embedding uses Promise.allSettled for partial failure tolerance
- [ ] **EDGE-03**: Gemini uploaded files are cleaned up in finally block (even on error)
- [ ] **EDGE-04**: Chunks are inserted into document_chunks table with correct embeddings

### Database Integrity

- [x] **DB-01**: Deleting a document cascades to delete all associated chunks
- [x] **DB-02**: RLS policies allow service role to insert into document_chunks
- [x] **DB-03**: Documents table has error_details JSONB column for storing failure details

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Resilience

- **RES-01**: Automatic retry with exponential backoff (3 attempts before marking error)
- **RES-02**: Rate limiting between embedding batches to avoid API throttling
- **RES-03**: Circuit breaker for Gemini API failures

### Observability

- **OBS-01**: Progress percentage tracking during processing
- **OBS-02**: Processing duration metrics per document
- **OBS-03**: Audit trail of document operations (upload, delete, reprocess)

### Advanced Sync

- **SYNC-01**: Orphan cleanup scheduler (find storage files without DB records)
- **SYNC-02**: Batch upload with single progress indicator

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| File versioning | Adds complexity without clear need; users can delete and re-upload |
| Format conversion | Gemini already handles PDF, DOCX, TXT natively |
| Custom embedding models | text-embedding-004 is sufficient; adds testing surface |
| Real-time progress websockets | Polling is acceptable for v1 |
| Document expiry/TTL | No requirement; Pflege regulations may need long retention |
| Cancel in-progress processing | High complexity; can reprocess instead |

## Traceability

Which phases cover which requirements. Updated after roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| DB-01 | Phase 1 | Complete |
| DB-02 | Phase 1 | Complete |
| DB-03 | Phase 1 | Complete |
| FILE-01 | Phase 2 | Complete |
| FILE-02 | Phase 2 | Complete |
| FILE-03 | Phase 2 | Complete |
| ERR-02 | Phase 2 | Complete |
| ERR-03 | Phase 2 | Complete |
| STAT-01 | Phase 3 | Complete |
| STAT-02 | Phase 3 | Complete |
| STAT-03 | Phase 3 | Complete |
| EDGE-01 | Phase 4 | Pending |
| EDGE-02 | Phase 4 | Pending |
| EDGE-03 | Phase 4 | Pending |
| EDGE-04 | Phase 4 | Pending |
| ERR-01 | Phase 5 | Pending |

**Coverage:**
- v1 requirements: 16 total
- Mapped to phases: 16/16 ✓
- Unmapped: 0 ✓

**Phase distribution:**
- Phase 1 (Database & Storage Foundation): 3 requirements
- Phase 2 (Atomic File Operations): 5 requirements
- Phase 3 (Status & Error Tracking): 3 requirements
- Phase 4 (Edge Function Processing): 4 requirements
- Phase 5 (Error Recovery): 1 requirement
- Phase 6 (RAG Integration): 0 requirements (integration phase)

---
*Requirements defined: 2026-01-23*
*Last updated: 2026-01-24 - Phase 3 requirements complete*
