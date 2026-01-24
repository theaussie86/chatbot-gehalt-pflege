# Project State: Gehalt-Pflege Document Pipeline

**Project:** Gehalt-Pflege Document Pipeline
**Current Phase:** 4 (In Progress)
**Current Plan:** 04-01 (Complete)
**Status:** Phase 4 Plan 01 Complete

## Project Reference

**File:** .planning/PROJECT.md

**Core value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

**Current focus:** Phase 4 - Edge Function Processing (Plan 01 Complete)

## Current Position

**Phase 4 of 6:** Edge Function Processing (In Progress)

**Goal:** Edge function reliably processes documents into searchable chunks with proper error handling.

**Last activity:** 2026-01-24 - Completed 04-01-PLAN.md (bug fixes)

**Next action:** Continue to Plan 04-02 (if exists) or complete Phase 4

## Progress

```
[████████████████████████████████████░░░░░░░░░░░░] 54.5% (3/6 phases + 1 plan)

Phase 1: Database & Storage Foundation ........ ✓ Complete | 1/1 plans
Phase 2: Atomic File Operations ............... ✓ Complete | 3/3 plans
Phase 3: Status & Error Tracking .............. ✓ Complete | 3/3 plans
Phase 4: Edge Function Processing ............. ◐ In Progress | 1/? plans
Phase 5: Error Recovery ....................... ○ Pending | 0/? plans
Phase 6: RAG Integration ...................... ○ Pending | 0/? plans
```

| Phase | Status | Plans | Requirements | Progress |
|-------|--------|-------|--------------|----------|
| 1 | ✓ Complete | 1/1 | 3 (DB-01✓, DB-02✓, DB-03✓) | 100% |
| 2 | ✓ Complete | 3/3 | 5 (FILE-01✓, FILE-02✓, FILE-03✓, ERR-02✓, ERR-03✓) | 100% |
| 3 | ✓ Complete | 3/3 | 3 (STAT-01✓, STAT-02✓, STAT-03✓) | 100% |
| 4 | ◐ In Progress | 1/? | 4 (EDGE-01✓, EDGE-02, EDGE-03, EDGE-04) | 25% |
| 5 | ○ Pending | 0/? | 1 (ERR-01) | 0% |
| 6 | ○ Pending | 0/? | 0 (integration) | 0% |

## Accumulated Context

### Known Issues

**P0-Blocking bugs identified in research:**
1. RLS policies checking `auth.uid()` fail when service role has NULL uid - service role bypasses SELECT but INSERT policies with JOIN conditions fail silently
2. Embedding API response structure: `embedResult.embeddings?.[0]?.values` may be undefined - need defensive parsing
3. ~~Blob MIME type: code uses `fileBlob.mime_type` but JavaScript Blob has `.type` property~~ **FIXED in 04-01**

**Current symptoms (pre-04-01 fixes):**
- Edge function triggers and authenticates successfully
- Text extraction works
- Chunks are NOT created in document_chunks table
- No error messages visible in logs

**Post 04-01:** Error details now captured with stage information. Ready to test end-to-end.

### Decisions

| Decision | Rationale | Date |
|----------|-----------|------|
| Fix foundation before features | Cannot build on broken RLS/schema; P0 bugs block all downstream work | 2026-01-23 |
| 6-phase structure (compressed from research 8) | Combine webhook setup into edge function phase, defer monitoring to v2 | 2026-01-23 |
| Phase 3 parallelizable with Phase 4 | UI/status tracking doesn't depend on edge function working | 2026-01-23 |
| Service role policy via JWT claim | Edge function uses service role key which has NULL auth.uid(), so use auth.jwt()->>'role' = 'service_role' check instead | 2026-01-23 |
| JSONB for error_details | Flexible schema allows storing different error types without schema changes | 2026-01-23 |
| Cascade delete requires no change | Already configured in 20260115120000_init_rag_pipeline.sql line 59 | 2026-01-23 |
| Sequential file processing for batch uploads | Provides predictable progress tracking and simpler error handling vs parallel processing | 2026-01-23 |
| 50MB file size limit | Balances usability with reasonable processing time for embedding generation | 2026-01-23 |
| Storage-first, DB-second with explicit rollback | Maintains existing pattern, adds compensating transaction for atomicity and visibility | 2026-01-23 |
| DB-first delete pattern | Orphaned storage files are recoverable (cleanup job); orphaned DB records cause user errors | 2026-01-23 |
| 5-minute signed URL expiry | Security-first approach - shorter expiry reduces risk of URL sharing vs convenience | 2026-01-23 |
| Separate view vs download actions | Different user intentions - view for quick check (browser), download for saving | 2026-01-23 |
| Direct browser upload for files >1MB | Bypasses Next.js server action size limit using Supabase browser client | 2026-01-24 |
| Muted color palette for status badges | Subtle, non-dominating colors (slate/sky/emerald/rose) for professional UI | 2026-01-24 |
| Set-based filter state for multi-select | Efficient toggle operations and OR logic for combining multiple status filters | 2026-01-24 |
| Proactive Sheet component installation | Install Plan 02 dependency during Plan 01 to eliminate setup work from next plan | 2026-01-24 |
| Sheet panel for document details | Provides contextual metadata view without navigation; 400px/540px responsive width | 2026-01-24 |
| Real-time via Supabase postgres_changes | Live status updates without polling; toast notifications provide immediate feedback | 2026-01-24 |
| Local state sync pattern | localDocuments synced from props and updated via realtime for dual source of truth | 2026-01-24 |
| Set-based checkbox selection | Set<string> for O(1) toggle/has operations; efficient for large lists | 2026-01-24 |
| Sequential bulk delete with per-item atomicity | Process documents one-by-one with individual success/failure tracking vs single transaction | 2026-01-24 |
| Realtime enablement via migration | Documents table explicitly added to supabase_realtime publication for live updates | 2026-01-24 |
| Store documentId at function scope | Variables declared before try block allow catch/finally blocks to access them | 2026-01-24 |
| Finally block for Gemini cleanup | Guarantees file deletion runs regardless of success/failure | 2026-01-24 |
| Fallback MIME type pattern | `fileBlob.type \|\| document.mime_type` ensures type is always available | 2026-01-24 |

### Active TODOs

**Phase 1 complete:**
- [x] Apply migration 20260123000000_phase1_foundation.sql in Supabase SQL Editor
- [x] Run verification queries to confirm fixes
- [ ] Test edge function with real document upload to verify chunks are inserted (can test now with 04-01 fixes)

**Phase 2 complete:**
- [x] Upload validation (size, MIME type)
- [x] Drag-drop upload zone with batch progress
- [x] Rollback visibility in error toasts
- [x] DB-first atomic delete
- [x] 5-minute signed URL downloads
- [x] Direct browser upload for large files (>1MB)

**Phase 3 complete:**
- [x] Plan 01: Status badges with icons and filter chips
- [x] Plan 02: Document details panel and realtime updates
- [x] Plan 03: Checkbox selection and bulk delete with human verification

**Phase 4 in progress:**
- [x] Plan 01: Fix Blob MIME type, error handling, Gemini cleanup
- [ ] Deploy updated edge function: `supabase functions deploy process-embeddings`
- [ ] Remaining plans (04-02, 04-03, etc.)

**Deferred to later phases:**
- Monitoring tools (stale document detection, processing duration metrics) - v2
- Optimization (progress tracking, rate limiting, orphan cleanup) - v2
- Automatic retry with exponential backoff - v2

### Blockers

None. Plan 04-01 complete. Edge function needs deployment to test fixes.

### Open Questions

1. Has text-embedding-004 been deprecated? (Research noted Jan 14, 2026 deprecation; today is Jan 24) - need to verify model availability during Phase 4
2. What are actual edge function timeout limits under load? (Documentation: 150s free tier, 400s Pro) - need load testing with 100+ page PDFs

## Session Continuity

**Last command:** `/gsd:execute-plan 04-01`

**Last session:** 2026-01-24

**Stopped at:** Plan 04-01 Complete

**Resume file:** None

**Context for next session:**
- **Plan 04-01 complete** - Edge function bug fixes:
  - Fixed Blob MIME type access (`fileBlob.type` not `.mime_type`)
  - Stage tracking for granular error reporting
  - Error handler uses pre-stored documentId (no re-parsing request)
  - Gemini files cleaned up in finally block
  - error_details JSONB populated with code, message, timestamp, stage
- **Deployment needed:** Run `supabase functions deploy process-embeddings` to apply fixes
- **Ready for testing:** Can now test document upload with error tracking visible in UI
- **Continue with:** Plan 04-02 or subsequent plans in Phase 4

---

*Last updated: 2026-01-24*
*Plan 04-01 complete - Edge function bug fixes*
