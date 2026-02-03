# Project State: Gehalt-Pflege Chat Intelligence

**Project:** Gehalt-Pflege Document Pipeline
**Current Milestone:** v1.1 Chat Intelligence
**Current Phase:** Phase 8 of 11 (Function Calling Enhancement)
**Current Plan:** —
**Status:** Phase complete

## Project Reference

**File:** .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

**Current focus:** v1.1 Chat Intelligence milestone — conversation persistence, function calling, suggested responses, validation, citations

## Current Position

**Milestone:** v1.1 Chat Intelligence (Phases 7-11)

Phase: 9 of 11 (Suggested Response Chips)
Plan: 01 of 02 — COMPLETE ✅
Status: In progress
Last activity: 2026-02-03 — Completed 09-01-PLAN.md (Suggestion Generation Service)

Progress: [████████████████░░░░] 80% (20/25 plans across all milestones)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 19
- Milestone v1.0: 6 phases, 14 plans
- Milestone v1.1: Phase 7 complete (3 plans), Phase 8 complete (2 plans)
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
- Phase 7 complete ✅ (3/3 plans)
- Phase 8 complete ✅ (2/2 plans)
- Phase 9 in progress (1/2 plans complete)
- Phase 10-11: Not started

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

**Phase 7 decisions:**
- localStorage over Dexie.js for conversation persistence (simpler for <100 messages)
- Duplicate FormState interface in widget types (build independence)
- Initialize formState to DEFAULT_FORM_STATE (not null) to activate state machine
- Clear localStorage when section reaches 'completed'
- "Neues Gesprach" text button for better discoverability
- Server action pattern for admin data fetching (consistent with documents.ts)
- Manual refresh for inquiry dashboard (no realtime subscriptions needed)
- Expandable table rows for detail views (better UX than modals)
- Inquiry ID flow: chat API returns ID on insert, widget stores in state, passes to email export
- Resend for email sending (simple API, generous free tier)
- Inline DOI form in chat (not modal or popup)
- Email export rate limit: 5 per IP per 60 seconds
- Graceful degradation if inquiryId is null

**Phase 8 decisions:**
- Zod schemas as single source of truth for tool validation AND Gemini function declarations
- Literal unions for taxClass (1-6) for strict validation at parse time
- German .describe() annotations help AI understand field context
- z.infer<typeof schema> for TypeScript type inference (single source of truth)
- Stufe as string enum ['1'-'6'] to match existing form data patterns
- Use Gemini SDK Type enum in schemaConverter for proper type compatibility
- Max 6 tool iterations in GeminiAgent to allow tariff + tax + potential retries
- Singleton ToolExecutor for shared session state across requests
- Session-based retry context key format: {sessionId}:{toolName}
- Real salary tables for TVöD, TV-L, AVR (P5-P15, E5-E15 groups)

**Phase 9 decisions (Plan 01):**
- Hybrid suggestion approach: predefined chips for known fields, AI-generated for open questions
- 2s timeout for AI suggestions with graceful fallback to empty array
- Max 4 chips per response to prevent UI overload
- Skip chips for freeform fields (group) and completed state
- Summary stage returns confirmation chips: ['Ja', 'Etwas ändern']
- Pass responseText to generateSuggestions for contextual AI suggestions

### Pending Todos

**Phase 7 (User Setup Required):**
- User must apply setup tasks (see .planning/phases/07-conversation-persistence/07-USER-SETUP.md):
  - Add email column to salary_inquiries table
  - Add RLS policy for authenticated read access
  - Create Resend account and API key
  - Configure sender domain for production (optional)

### Blockers/Concerns

**From research (to address during phases):**

Phase 8 addressed:
- ✅ P0-2: Function calling schema drift (single source of truth, Zod validation)

Phase 9 addressed (Plan 01):
- ✅ P1-1: Suggested response overload (max 4 chips, skip for freeform fields)
- 🔄 P1-5: Separate LLM call for suggestions (AI generation with timeout, Plan 02 may optimize)

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

**Last command:** /gsd:execute-plan 09-01

**Last session:** 2026-02-03

**Stopped at:** Phase 09 Plan 01 complete ✅ (2/2 tasks). SUMMARY created: .planning/phases/09-suggested-response-chips/09-01-SUMMARY.md

**Resume file:** None

**Next step:** Run `/gsd:execute-plan 09-02` for Widget UI Integration or `/gsd:plan-phase 10` for Two-Phase Validation

---

*Last updated: 2026-02-03*
*Phase 9 Plan 01 complete: SuggestionService with stage-aware chip generation, hybrid predefined/AI approach*
