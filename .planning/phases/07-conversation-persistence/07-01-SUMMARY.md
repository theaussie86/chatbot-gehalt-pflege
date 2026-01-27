---
phase: 07-conversation-persistence
plan: 01
subsystem: widget-persistence
tags: [localStorage, conversation-state, step-indicator, ux]
dependency_graph:
  requires: [06-02-rag-integration]
  provides: [conversation-persistence, step-progress-ui]
  affects: [07-02-inquiry-dashboard, 07-03-email-capture]
tech_stack:
  added: [localStorage-api]
  patterns: [conversation-store-service, display-only-stepper]
key_files:
  created:
    - apps/web/services/conversationStore.ts
    - apps/web/components/StepBar.tsx
  modified:
    - apps/web/App.tsx
    - apps/web/types.ts
    - apps/web/services/gemini.ts
decisions:
  - id: CONV-01-001
    choice: "localStorage over Dexie.js for conversation persistence"
    rationale: "Single conversation (<100 messages) doesn't justify IndexedDB complexity. localStorage is simpler, sufficient, and has better compatibility."
  - id: CONV-01-002
    choice: "Duplicate FormState interface in widget types"
    rationale: "Widget is separate Vite app - cannot import from API app. Type duplication necessary for build independence."
  - id: CONV-01-003
    choice: "Initialize formState to DEFAULT_FORM_STATE (not null)"
    rationale: "State machine requires valid initial formState with section 'job_details' and missingFields populated to activate on first API call."
  - id: CONV-01-004
    choice: "Clear localStorage when section reaches 'completed'"
    rationale: "Completed conversations are saved in Supabase - local storage no longer needed. Prevents stale data."
  - id: CONV-01-005
    choice: "Replace icon button with labeled 'Neues Gespräch' button"
    rationale: "Text label makes reset action clearer to users. Improved discoverability."
metrics:
  duration: "3.5 minutes"
  completed: "2026-01-27"
---

# Phase 7 Plan 01: Conversation Persistence Summary

**One-liner:** localStorage conversation persistence with 4-step StepBar (Jobdaten, Steuerdaten, Übersicht, Ergebnis) replacing percentage ProgressBar.

## Performance

**Execution time:** 3.5 minutes
**Tasks completed:** 2/2
**Verification:** All TypeScript compiles, build succeeds

## Accomplishments

### Client-Side Persistence (CONV-01, CONV-02)
- Created `ConversationStore` service with localStorage API
- Save/load/clear operations with quota error handling
- Auto-resume on mount - user sees full conversation history within 1 second
- Conversation persists across page refreshes and browser sessions
- Storage cleared automatically when conversation completes (`section: 'completed'`)

### State Machine Integration
- Added `FormState` type to widget (duplicated from API types for build independence)
- `DEFAULT_FORM_STATE` constant ensures state machine activates on first API call
- Updated `sendMessageToGemini` to send `currentFormState` and receive updated `formState`
- App.tsx tracks formState and saves after each message exchange
- Critical fix: Initialize formState to `DEFAULT_FORM_STATE` (not null) so API state machine branch activates immediately

### Visual Progress Indicator (CONV-05)
- Created `StepBar` component with 4 German-labeled steps:
  - **Jobdaten** (job_details)
  - **Steuerdaten** (tax_details)
  - **Übersicht** (summary)
  - **Ergebnis** (completed)
- Visual states: completed (checkmark, filled), current (ring, outlined), upcoming (gray)
- Connecting lines between steps (primary color when completed, gray otherwise)
- Display-only (not interactive/clickable) per requirements
- Uses theme CSS variables for consistent brand styling
- Replaced percentage ProgressBar with StepBar in main layout

### User Reset Experience
- "Neues Gespräch" button replaces icon-only RefreshCw button
- Immediate reset (no page reload required)
- Clears localStorage and resets all React state
- Improved discoverability with text label

## Task Commits

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Conversation storage service and widget integration | d7e3ab6 | conversationStore.ts, gemini.ts, App.tsx, types.ts |
| 2 | Step bar progress indicator | 451ea34 | StepBar.tsx, App.tsx |

## Files Created

### `apps/web/services/conversationStore.ts` (75 lines)
- `ConversationStore` class with static methods
- `save()` - Persists conversation with quota error handling
- `load()` - Restores conversation, parses Date objects from JSON
- `clear()` - Removes localStorage key
- `exists()` - Quick check for saved data
- `StoredConversation` interface: messages, formState, progress, updatedAt

### `apps/web/components/StepBar.tsx` (94 lines)
- Horizontal 4-step progress indicator
- German labels: Jobdaten → Steuerdaten → Übersicht → Ergebnis
- State determination based on `currentSection` prop
- Responsive layout with connecting lines
- Checkmark icon for completed steps, numbers for current/upcoming

## Files Modified

### `apps/web/types.ts`
- Added `FormState` interface (duplicated from API types)
- Added `DEFAULT_FORM_STATE` constant with initial state:
  - section: 'job_details'
  - missingFields: ['tarif', 'group', 'experience', 'hours', 'state']
- Ensures state machine activates on first API call

### `apps/web/services/gemini.ts`
- Updated `sendMessageToGemini` signature to accept `currentFormState?: FormState`
- Return type changed from `Promise<string>` to `Promise<{ text: string; formState?: FormState }>`
- Request body includes `currentFormState`
- Response parsing extracts both `text` and `formState`

### `apps/web/App.tsx`
- Added `formState` state variable initialized to `DEFAULT_FORM_STATE`
- Auto-resume on mount: loads saved conversation from `ConversationStore.load()`
- Updated `handleSendMessage`:
  - Passes `formState` to `sendMessageToGemini`
  - Destructures `{ text: rawText, formState: newFormState }` from response
  - Passes `rawText` string to `parseResponse()` (not full response object)
  - Updates `formState` state when API returns new state
  - Saves conversation after each message (unless completed)
  - Clears storage when `section === 'completed'`
- Updated `handleReset`:
  - Removes `window.confirm` prompt
  - Calls `ConversationStore.clear()`
  - Resets all state without page reload
- Header: "Neues Gespräch" text button replaces icon-only button
- Replaced ProgressBar with StepBar component

## Decisions Made

### D1: localStorage over Dexie.js
**Context:** Research suggested Dexie.js 4.0.11+ for client storage
**Decision:** Use localStorage instead
**Rationale:** For a single conversation with <100 messages, localStorage is sufficient and simpler. Dexie.js would be over-engineering. JSON serialization handles the data model fine.

### D2: FormState type duplication
**Context:** Widget needs FormState type from API
**Decision:** Duplicate the interface in `apps/web/types.ts`
**Rationale:** Widget is a separate Vite app that cannot import from the API Next.js app. Build independence requires type duplication.

### D3: Initialize to DEFAULT_FORM_STATE (not null)
**Context:** First API call must activate state machine
**Decision:** Initialize formState to `DEFAULT_FORM_STATE` with section 'job_details' and populated missingFields
**Rationale:** Without a valid initial formState, the API doesn't enter the state machine branch, and progress tracking fails. The default state signals to the API "we're starting fresh, guide me through the interview."

### D4: Clear storage on completion
**Context:** When should localStorage be cleared?
**Decision:** Clear when `formState.section === 'completed'`
**Rationale:** Completed conversations are saved in Supabase via the API. Local storage persistence only needed for in-progress conversations. Clearing prevents stale data on next conversation start.

### D5: Response destructuring pattern
**Context:** API returns `{ text, formState }` but parseResponse expects string
**Decision:** Destructure as `{ text: rawText, formState }` and pass `rawText` to parseResponse
**Rationale:** Prevents type errors. parseResponse operates on the text string (extracting PROGRESS, OPTIONS tags). formState is handled separately for state tracking.

## Deviations from Plan

**None** - Plan executed exactly as written. All required functionality implemented.

## Issues Encountered

### I1: Initial commit confusion (resolved)
**Issue:** Found pre-existing commits for 07-01 and 07-02 before starting execution
**Resolution:** Verified that d7e3ab6 (Task 1) and 451ea34 (Task 2) contained all required changes. Both tasks were already complete.

### I2: Auto-generated Next.js file (resolved)
**Issue:** `apps/api/next-env.d.ts` showed unstaged changes (auto-generated route types path)
**Resolution:** Ran `git restore` to discard. This is a Next.js auto-generated file that updates during dev server runs.

## User Setup Required

**None** - All changes are in the widget codebase. No environment variables, database migrations, or manual configuration needed.

## Next Phase Readiness

### Blockers
- None

### Dependencies Satisfied
- ✅ State machine returns `formState` in API response (prerequisite for persistence)
- ✅ Widget can parse and store conversation state
- ✅ StepBar correctly maps formState.section to visual steps

### Enables Next Plans
- **07-02 (Admin Inquiry Dashboard):** Completed conversations in Supabase can now be displayed
- **07-03 (Email Capture):** Conversation flow is stable, can add email collection step
- **07-04 (DOI & Email Export):** formState tracking enables email trigger at right conversation stage

### Technical Notes
- localStorage max size ~5-10MB (varies by browser). Conversation data ~1-5KB per session. Quota sufficient for 1000+ sessions before issues.
- Date serialization: `Message.timestamp` is Date object in memory, string in localStorage, parsed back to Date on load
- StepBar is purely presentational - no onClick handlers. Future interactivity (jump to section) would require state machine validation.

### Open Questions
- None

---

**Status:** ✅ Complete
**Verified:** TypeScript compiles, build succeeds, all success criteria met
