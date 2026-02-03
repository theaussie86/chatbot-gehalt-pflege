---
phase: 09-suggested-response-chips
plan: 01
subsystem: api
tags: [gemini, state-machine, ux, suggestions, quick-replies]

# Dependency graph
requires:
  - phase: 07-conversation-persistence
    provides: FormState with section tracking and missingFields array
  - phase: 08-function-calling-enhancement
    provides: State machine conversation flow
provides:
  - Server-side suggestion generation service with stage-aware chip logic
  - API response includes suggestions array with 2-4 contextual quick reply options
  - Hybrid approach combining predefined chips for known fields and AI-generated suggestions
affects: [10-two-phase-validation, widget-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Hybrid suggestion generation (predefined + AI fallback)
    - Timeout-based graceful degradation for AI suggestions (2s)
    - Stage-aware response chip selection based on FormState

key-files:
  created:
    - apps/api/lib/suggestions.ts
  modified:
    - apps/api/types/form.ts
    - apps/api/app/api/chat/route.ts

key-decisions:
  - "Predefined chips for known fields (tariff systems, Steuerklasse 1-6, Stufe 1-6)"
  - "AI-generated suggestions for open questions with 2s timeout for graceful fallback"
  - "Skip chips for freeform fields (group) and completed state"
  - "Summary stage returns confirmation chips: ['Ja', 'Etwas ändern']"
  - "Max 4 chips per response to prevent overload"

patterns-established:
  - "SuggestionService as separate concern from state machine logic"
  - "Pass responseText to generateSuggestions for contextual AI suggestions"
  - "Empty array return for graceful degradation when suggestions unavailable"

# Metrics
duration: 3min
completed: 2026-02-03
---

# Phase 09 Plan 01: Suggested Response Chips Summary

**Server-side suggestion generation producing 2-4 contextual quick reply chips based on conversation state, with hybrid predefined/AI approach**

## Performance

- **Duration:** 3 min
- **Started:** 2026-02-03T08:02:57Z
- **Completed:** 2026-02-03T08:05:54Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- Created SuggestionService with stage-aware chip generation logic
- Integrated suggestions into all state machine response paths
- Implemented hybrid approach: predefined chips for known fields, AI-generated for open questions
- Added graceful degradation with 2s timeout for AI generation
- Exported suggestions field in API response for widget consumption

## Task Commits

Each task was committed atomically:

1. **Task 1: Create SuggestionService with stage-aware chip generation** - `89e2e87` (feat)
2. **Task 2: Integrate suggestion generation into chat API response** - `f3c0650` (feat)

## Files Created/Modified
- `apps/api/lib/suggestions.ts` - SuggestionService class with generateSuggestions and generateAISuggestions functions
- `apps/api/types/form.ts` - Added ChatResponse interface with suggestions field
- `apps/api/app/api/chat/route.ts` - Integrated generateSuggestions into 11 response paths

## Decisions Made

**1. Hybrid suggestion approach**
- Predefined chips for known multiple-choice fields (tariff, Steuerklasse, experience)
- AI-generated suggestions for open-ended questions via lightweight Gemini call
- Rationale: Combines reliability of predefined options with flexibility for contextual suggestions

**2. Graceful degradation with timeout**
- AI suggestion generation has 2s timeout
- Falls back to empty array on failure or timeout
- Rationale: Don't block main response if AI generation is slow or fails

**3. Stage-specific chip logic**
- job_details: Field-specific chips (TVöD/TV-L/AVR for tariff, Stufe 1-6 for experience, etc.)
- tax_details: Steuerklasse 1-6, Ja/Nein for kirchTax, 0/1/2/3+ for children
- summary: Confirmation chips ['Ja', 'Etwas ändern']
- completed: Empty array (no further input needed)
- Rationale: Contextual suggestions reduce typing friction for common responses

**4. Skip chips for freeform input**
- Fields like 'group' (job title) require typing, no predefined options make sense
- Rationale: Don't show chips when they won't help (forcing user to type anyway)

**5. Max 4 chips per response**
- Limit to 4 suggestions to prevent UI clutter
- Rationale: Per CONTEXT.md line 18, prevent suggestion overload

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - implementation straightforward with clear requirements from CONTEXT.md.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

**Ready for:**
- Phase 09 Plan 02: Widget UI implementation to render and handle chip clicks
- Phase 10: Two-phase validation can use suggestions for validation feedback

**API contract established:**
- ChatResponse.suggestions: string[] (0-4 items)
- Widget can expect suggestions in all state machine responses
- Empty array when no suggestions applicable (graceful degradation)

**Widget integration points:**
- Render chips above input field when suggestions.length > 0
- Click chip → fill input field (user can edit before sending)
- Clear chips after message sent, new chips appear with bot response
- Single selection only (tap replaces input text)

---
*Phase: 09-suggested-response-chips*
*Completed: 2026-02-03*
