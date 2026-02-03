# Project State: Gehalt-Pflege Chat Intelligence

**Project:** Gehalt-Pflege Document Pipeline
**Current Milestone:** v1.1 Chat Intelligence
**Current Phase:** Phase 11 of 11 (Citation Quality Enhancement)
**Current Plan:** 02
**Status:** MILESTONE COMPLETE

## Project Reference

**File:** .planning/PROJECT.md (updated 2026-01-26)

**Core value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

**Current focus:** v1.1 Chat Intelligence milestone COMPLETE — conversation persistence, function calling, suggested responses, validation, citations

## Current Position

**Milestone:** v1.1 Chat Intelligence (Phases 7-11) — COMPLETE

Phase: 11 of 11 (Citation Quality Enhancement) — COMPLETE
Plan: 02 of 02 — COMPLETE
Status: Milestone complete
Last activity: 2026-02-03 — Completed 11-02-PLAN.md (citation integration)

Progress: [████████████████████] 100% (25/25 plans across all milestones)

## Performance Metrics

**Velocity (v1.0 baseline):**
- Total plans completed: 25
- Milestone v1.0: 6 phases, 14 plans
- Milestone v1.1: 5 phases, 11 plans
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
- Phase 7 complete (3/3 plans)
- Phase 8 complete (2/2 plans)
- Phase 9 complete (2/2 plans)
- Phase 10 complete (2/2 plans)
- Phase 11 complete (2/2 plans)

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

**Phase 9 decisions:**
- Hybrid suggestion approach: predefined chips for known fields, AI-generated for open questions
- 2s timeout for AI suggestions with graceful fallback to empty array
- Max 4 chips per response to prevent UI overload
- Skip chips for freeform fields (group) and completed state
- Summary stage returns confirmation chips: ['Ja', 'Etwas ändern']
- Pass responseText to generateSuggestions for contextual AI suggestions
- 44x44px minimum tap targets for mobile accessibility compliance
- Fade to 40% opacity when typing (not hide) to maintain discoverability
- Single selection only - tapping another chip replaces input text
- FLIP animation technique for 60fps chip-to-bubble transition (300ms ease-out)
- Tap-to-fill without auto-submit (user can edit before sending)

**Phase 10 decisions:**
- Zod schemas as single source of truth for field validation (both extraction and validation phases)
- German number word pre-processing (eins, zwei, drei → 1, 2, 3) for natural language input
- 30-min TTL for retry context (fresh start when user returns after inactivity)
- Cross-field group validation requires tarif context for P/E prefix (P5-P15 for Pflege, E5-E15 for general)
- Field-specific German labels for escalation chips (e.g., "Klasse 1 (ledig)" not just "1")
- Use activeProjectId for validation session tracking with 30-min TTL
- Re-prompt only for first validation error when multiple fields fail (avoid overwhelming user)

**Phase 11 decisions:**
- [PAGE:N] markers in Gemini extraction prompt for page tracking
- Track page boundaries during chunking (not post-hoc)
- Tri-state has_page_data flag (null/true/false) for backward compatibility
- Store citations in formState.ragCitations to persist through session
- Only cite chunks with page data (strict quality)
- Consolidate citations by document name before storage and display
- Remove prompt instruction to cite sources in user-facing responses

### Pending Todos

**Phase 7 (User Setup Required):**
- User must apply setup tasks (see .planning/phases/07-conversation-persistence/07-USER-SETUP.md):
  - Add email column to salary_inquiries table
  - Add RLS policy for authenticated read access
  - Create Resend account and API key
  - Configure sender domain for production (optional)

**Phase 11 (User Setup Required):**
- User must apply migration 20260203000000_add_page_data_to_chunks.sql to database

### Blockers/Concerns

**All P0/P1 concerns addressed:**

Phase 8 addressed:
- P0-2: Function calling schema drift (single source of truth, Zod validation)

Phase 9 addressed:
- P1-1: Suggested response overload (max 4 chips, skip for freeform fields)
- P1-5: Separate LLM call for suggestions (AI generation with timeout, hybrid approach)

Phase 10 addressed:
- P1-3: Data extraction relies solely on LLM (two-phase validation with FieldValidator)

Phase 11 addressed:
- P0-3: RAG citation hallucination (store page metadata, don't generate)

### Open Questions

**Phase 11 (Citation Quality) - for future iteration:**
- Does Gemini File API preserve page boundaries in German tariff PDFs?
- What's accuracy rate for page marker extraction?
- Is unpdf more reliable than Gemini for page tracking?
- Test with real documents, pivot to unpdf if Gemini <80% accurate

## Session Continuity

**Last command:** /gsd:execute-plan 11-02

**Last session:** 2026-02-03

**Stopped at:** v1.1 Chat Intelligence milestone complete. All 25 plans executed.

**Resume file:** None

**Next step:** Plan v1.2 milestone or production deployment

---

*Last updated: 2026-02-03*
*v1.1 Chat Intelligence milestone complete: conversation persistence, function calling, suggested responses, validation, citations*
