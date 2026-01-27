# Project State: Gehalt-Pflege Chat Intelligence

**Project:** Gehalt-Pflege Document Pipeline
**Current Milestone:** v1.1 Chat Intelligence
**Current Phase:** Phase 7 of 11 (Conversation Persistence)
**Current Plan:** 1 of 5 (Conversation Persistence)
**Status:** Completed

## Project Reference

**File:** .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

**Current focus:** v1.1 Chat Intelligence milestone — conversation persistence, function calling, suggested responses, validation, citations

## Current Position

**Milestone:** v1.1 Chat Intelligence (Phases 7-11)

Phase: 7 of 11 (Conversation Persistence)
Plan: 3 of 3 complete
Status: Phase complete ✅
Last activity: 2026-01-27 — Completed 07-03-PLAN.md (Email Export with DOI Consent)

Progress: [█████████████░░░░░░░] 68% (17/25 plans across all milestones)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 14
- Milestone v1.0: 6 phases, 14 plans
- Average duration: Data from v1.0 execution
- Total execution time: Data from v1.0 execution

**By Phase (v1.0):**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 1. Database & Storage Foundation | 1 | — | — |
| 2. Atomic File Operations | 3 | — | — |
| 3. Status & Error Tracking | 3 | — | — |
| 4. Durable Document Processing | 4 | — | — |
| 5. Error Recovery | 1 | — | — |
| 6. RAG Integration | 2 | — | — |

**v1.1 Progress:**
- Phases planned: 5 (Phases 7-11)
- Plans created: 3 (Phase 7)
- Plans completed: 3 (07-01, 07-02, 07-03)
- Phase 7 complete ✅

*Updated after each plan completion*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

**Established patterns from v1.0:**
- Inngest for durable processing with automatic retries
- DB-first delete pattern prevents orphaned DB records
- Service role RLS via JWT claim for edge function auth
- Promise.allSettled for batch fault tolerance
- 0.75 similarity threshold for RAG quality

**v1.1 architectural decisions (from research):**
- Zod v4.3.5 upgrade for native Gemini structured output
- Dual-write pattern: localStorage (client) + Supabase (admin sync)
- State versioning with stateVersion field for migration safety
- Sliding window history (last 5 messages) + summarization for context window management

**Phase 7 (07-01) decisions:**
- localStorage over Dexie.js for conversation persistence (simpler for <100 messages)
- Duplicate FormState interface in widget types (build independence)
- Initialize formState to DEFAULT_FORM_STATE (not null) to activate state machine
- Clear localStorage when section reaches 'completed'
- "Neues Gespräch" text button for better discoverability

**Phase 7 (07-02) decisions:**
- Server action pattern for admin data fetching (consistent with documents.ts)
- Manual refresh for inquiry dashboard (no realtime subscriptions needed)
- Expandable table rows for detail views (better UX than modals)

**Phase 7 (07-03) decisions:**
- Inquiry ID flow: chat API returns ID on insert, widget stores in state, passes to email export
- Resend for email sending (simple API, generous free tier)
- Inline DOI form in chat (not modal or popup)
- Email export rate limit: 5 per IP per 60 seconds (stricter than chat)
- Graceful degradation if inquiryId is null (email delivery is primary purpose)

### Pending Todos

**Phase 7 (Plans 07-02 & 07-03):**
- User must apply setup tasks (see 07-USER-SETUP.md):
  - Add email column to salary_inquiries table (Plan 07-02)
  - Add RLS policy for authenticated read access (Plan 07-02)
  - Create Resend account and API key (Plan 07-03)
  - Configure sender domain for production (Plan 07-03, optional)

### Blockers/Concerns

**From research (to address during phases):**

Phase 7 must address:
- P0-1: State sync corruption (implement versioning, debounced writes, quota checks)
- P0-4: Context window explosion (sliding window + summarization)
- P1-2: State machine rigidity (intent-aware transitions)
- P1-4: RLS policies for conversations table (enable day 1)

Phase 8 must address:
- P0-2: Function calling schema drift (single source of truth, Zod validation)

Phase 9 must address:
- P1-1: Suggested response overload (3-4 chips max, multiple-choice only)
- P1-5: Separate LLM call for suggestions (use structured output in main call)

Phase 10 must address:
- P1-3: Data extraction relies solely on LLM (two-phase validation)

Phase 11 must address:
- P0-3: RAG citation hallucination (store page metadata, don't generate)

### Open Questions

**Phase 11 (Citation Quality):**
- Does Gemini File API preserve page boundaries in German tariff PDFs?
- What's accuracy rate for page marker extraction?
- Is unpdf more reliable than Gemini for page tracking?
- Test during Phase 11 Day 1, pivot to unpdf if Gemini <80% accurate

## Session Continuity

**Last command:** Plan 07-03 execution completed

**Last session:** 2026-01-27

**Stopped at:** Completed 07-03-PLAN.md (Email Export with DOI Consent)

**Resume file:** None

**Next step:** Phase 7 complete. Begin Phase 8 planning or continue with remaining milestone phases.

---

*Last updated: 2026-01-27*
*Phase 7 complete: Conversation persistence with localStorage, admin dashboard, email export with DOI consent*
