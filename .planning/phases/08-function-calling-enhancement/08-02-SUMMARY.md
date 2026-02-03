---
phase: 08-function-calling-enhancement
plan: 02
subsystem: api
tags: [gemini, function-calling, zod, tools, tariff, tax-calculation]

# Dependency graph
requires:
  - phase: 08-01
    provides: Zod tool schemas with German descriptions, schemaConverter, TypeScript types
provides:
  - tariff_lookup tool with real TVoD/TV-L/AVR salary tables
  - tax_calculate tool wrapping TaxWrapper
  - ToolExecutor with Zod validation and retry logic (max 3 attempts)
  - Updated GeminiAgent using new tool infrastructure
  - Two-step workflow (tariff lookup -> tax calculation)
affects: [08-03, chat-api, widget]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod-validated tool execution with retry tracking"
    - "Session-based retry context for AI self-correction"
    - "Structured ToolError with field, error, suggestion for AI retry"

key-files:
  created:
    - apps/api/utils/agent/tools/tariffLookup.ts
    - apps/api/utils/agent/tools/taxCalculate.ts
    - apps/api/utils/agent/tools/index.ts
    - apps/api/utils/agent/ToolExecutor.ts
  modified:
    - apps/api/utils/agent/config.ts
    - apps/api/utils/agent/GeminiAgent.ts
    - apps/api/utils/agent/schemaConverter.ts

key-decisions:
  - "Use Gemini SDK Type enum in schemaConverter for proper type compatibility"
  - "Max 6 tool iterations in GeminiAgent to allow tariff + tax + potential retries"
  - "Singleton ToolExecutor for shared session state across requests"
  - "German error suggestions in ToolExecutor for AI context"

patterns-established:
  - "Zod validation before tool execution: toolExecutor.execute() validates inputs with Zod schemas"
  - "Structured error feedback: ToolError includes field, error, received, suggestion for AI retry"
  - "Session-based retry tracking: Context key format {sessionId}:{toolName} for per-tool retry counts"
  - "Two-step salary workflow: tariff_lookup first, then tax_calculate with yearly gross"

# Metrics
duration: 5min
completed: 2026-02-03
---

# Phase 8 Plan 2: Tool Execution Handlers Summary

**Implemented tariff_lookup and tax_calculate tools with ToolExecutor validation, max 3 retries, and structured German error feedback for AI self-correction**

## Performance

- **Duration:** 5 min
- **Started:** 2026-02-03T07:15:24Z
- **Completed:** 2026-02-03T07:20:06Z
- **Tasks:** 3
- **Files modified:** 7

## Accomplishments
- Implemented tariff_lookup with real TVoD/TV-L/AVR salary tables (P5-P15, E5-E15)
- Implemented tax_calculate wrapping existing TaxWrapper with church tax mapping
- Created ToolExecutor with Zod validation and session-based retry tracking
- Updated GeminiAgent to use ToolExecutor with sequential tool call support
- Fixed schemaConverter to use Gemini SDK Type enum for proper type compatibility

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement tariff_lookup and tax_calculate tools** - `f6dfe12` (feat)
2. **Task 2: Create ToolExecutor with validation and retry logic** - `6f4b7b1` (feat)
3. **Task 3: Update config.ts and GeminiAgent with new tool infrastructure** - `b904277` (feat)

## Files Created/Modified
- `apps/api/utils/agent/tools/tariffLookup.ts` - Tariff lookup with real salary data for 3 tariff systems
- `apps/api/utils/agent/tools/taxCalculate.ts` - Tax calculation wrapper around TaxWrapper
- `apps/api/utils/agent/tools/index.ts` - Tool exports
- `apps/api/utils/agent/ToolExecutor.ts` - Unified tool execution with Zod validation and retry logic
- `apps/api/utils/agent/config.ts` - Zod-generated SALARY_TOOLS and updated SYSTEM_INSTRUCTION
- `apps/api/utils/agent/GeminiAgent.ts` - Uses ToolExecutor with sequential tool call loop
- `apps/api/utils/agent/schemaConverter.ts` - Updated to use Gemini SDK Type enum

## Decisions Made
- **Gemini SDK Type enum:** Changed schemaConverter from string literals ('STRING', 'NUMBER') to Gemini SDK Type enum (Type.STRING, Type.NUMBER) for proper TypeScript compatibility
- **Singleton ToolExecutor:** Used singleton pattern for shared retry context across requests within a session
- **Max 6 iterations:** Allows tariff lookup + tax calculation + potential retries in a single conversation turn
- **Session-based context key:** Format `{sessionId}:{toolName}` enables independent retry tracking per tool

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed schemaConverter type compatibility with Gemini SDK**
- **Found during:** Task 3 (TypeScript compilation)
- **Issue:** schemaConverter used string literals but Gemini SDK expects Type enum values
- **Fix:** Imported Type enum from @google/genai and used Type.STRING, Type.NUMBER etc.
- **Files modified:** apps/api/utils/agent/schemaConverter.ts
- **Verification:** TypeScript compilation passes, tools generate correctly
- **Committed in:** b904277 (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (blocking)
**Impact on plan:** Required fix for TypeScript compatibility. No scope creep.

## Issues Encountered
None - plan executed with one blocking issue auto-fixed.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Tool infrastructure complete and tested
- tariff_lookup returns gross salary for TVoD P7 Stufe 3 (~3447 EUR/month)
- tax_calculate returns net salary with full breakdown
- Ready for Phase 08-03: Integration tests and response formatting
- Backwards compatible via SALARY_TOOL export alias

---
*Phase: 08-function-calling-enhancement*
*Completed: 2026-02-03*
