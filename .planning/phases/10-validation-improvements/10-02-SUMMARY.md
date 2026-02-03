---
phase: 10
plan: 02
subsystem: validation
tags: [zod, validation, german-ux, error-handling, escalation-chips, two-phase-validation]
requires:
  - phase: 10-01
    provides: FieldValidator service with Zod schemas and retry tracking
  - phase: 09-02
    provides: Suggestion chips infrastructure for user guidance
provides:
  - Two-phase validation integrated into chat flow (LLM extraction → Zod validation)
  - Escalation chips after 3 validation failures
  - German error re-prompts with specific field context
  - Validation applied to both extraction and modification flows
affects: [11-citation-quality-enhancement]
tech-stack:
  added: []
  patterns: [two-phase-validation-flow, escalation-after-retries, context-aware-error-messages]
key-files:
  created: []
  modified:
    - apps/api/lib/suggestions.ts
    - apps/api/app/api/chat/route.ts
decisions:
  - id: escalation-chips-field-specific
    text: Field-specific German labels for escalation chips (e.g., "Klasse 1 (ledig)" not just "1")
    rationale: User-friendly labels help users understand their options without technical jargon
  - id: ttl-session-tracking
    text: Use activeProjectId for validation session tracking with 30-min TTL
    rationale: Retry counts accumulate within conversation, reset when user returns later
  - id: first-error-only-reprompt
    text: Re-prompt only for first validation error when multiple fields fail
    rationale: Avoids overwhelming user with multiple error messages, focuses on one fix at a time
duration: 3min
completed: 2026-02-03
---

# Phase 10 Plan 02: Tool Extraction Integration Summary

**Two-phase validation with FieldValidator replaces ResponseValidator, providing Zod-based field validation, German error re-prompts, and escalation chips after 3 failures**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T22:46:46Z
- **Completed:** 2026-02-03T22:50:13Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Replaced ResponseValidator with FieldValidator for Zod-based validation
- Added escalation chip generation with German field labels
- Integrated two-phase validation into extraction and modification flows
- Improved German re-prompts with specific field error context
- After 3 failures, chips appear with valid options for easy selection

## Task Commits

Each task was committed atomically:

1. **Task 1: Add escalation chip generation to suggestions.ts** - `71c072d` (feat)
2. **Task 2: Integrate FieldValidator into chat route extraction flow** - `b9cb7c5` (feat)

## Files Created/Modified

- `apps/api/lib/suggestions.ts` - Added generateEscalationChips function with German labels, updated generateSuggestions to accept escalation override
- `apps/api/app/api/chat/route.ts` - Integrated FieldValidator for two-phase validation, added escalation logic after 3 failures, improved German re-prompts

## Decisions Made

**1. Field-specific German labels for escalation chips**
- Example: "Klasse 1 (ledig)" instead of just "1" for tax class
- Maps internal values to user-friendly display labels
- Helps users understand options without technical knowledge

**2. TTL-based session tracking**
- Uses activeProjectId for validation session tracking
- 30-minute TTL for retry context (from FieldValidator)
- Retry counts accumulate within active conversation
- Counts reset when user returns after inactivity

**3. First error only for re-prompts**
- When multiple fields fail validation, re-prompt only for first error
- Focuses user on fixing one thing at a time
- Prevents overwhelming error messages

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - TypeScript compilation successful, all verifications passed.

## Next Phase Readiness

**Ready for Phase 11 (Citation Quality Enhancement):**
- Two-phase validation ensures data extraction reliability
- Escalation chips provide user-friendly error recovery
- German error messages guide users to correct input
- Validation applied consistently across extraction and modification flows

**Validation foundation complete:**
- LLM extracts → Zod validates → User-friendly errors
- After 3 failures → Chips appear with valid options
- Cross-field validation works (e.g., group requires tarif)
- TTL-based retry tracking prevents stale error counts

---
*Phase: 10-validation-improvements*
*Completed: 2026-02-03*
