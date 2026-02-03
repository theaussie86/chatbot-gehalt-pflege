---
phase: 08
plan: 01
subsystem: function-calling
tags: [zod, gemini, schema, typescript, validation]

dependency_graph:
  requires: []
  provides:
    - "Zod schemas as single source of truth for tool validation"
    - "TypeScript types inferred from Zod schemas"
    - "Zod-to-Gemini converter for function declarations"
  affects:
    - "Phase 08 Plan 02 (tool execution handlers)"
    - "Phase 08 Plan 03 (multi-tool orchestration)"

tech_stack:
  added:
    - "zod@3.24.0"
  patterns:
    - "z.infer<typeof schema> for TypeScript type inference"
    - "Literal union for constrained numeric enums (taxClass: 1|2|3|4|5|6)"
    - "German .describe() annotations for AI context"

key_files:
  created:
    - apps/api/utils/agent/toolSchemas.ts
    - apps/api/utils/agent/schemaConverter.ts
    - apps/api/types/tools.ts
  modified:
    - apps/api/package.json

decisions:
  - decision: "Use Zod schemas as single source of truth"
    rationale: "Eliminates schema drift between TypeScript types and Gemini tool definitions"
    link: "toolSchemas.ts"
  - decision: "Literal unions for taxClass (1-6) instead of z.number().min(1).max(6)"
    rationale: "Strict validation - catches invalid values at parse time, not runtime"
    link: "taxCalculateSchema"
  - decision: "German descriptions in .describe() annotations"
    rationale: "Helps Gemini AI understand field context in German language conversations"
    link: "toolSchemas.ts"

metrics:
  duration: "~5 minutes"
  completed: "2026-02-03"
---

# Phase 8 Plan 01: Zod Tool Schemas Summary

Zod schemas as single source of truth for tariff_lookup and tax_calculate tools, with automatic TypeScript type inference and Gemini function declaration generation.

## Completed Tasks

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Create Zod tool schemas with German descriptions | 41c68c1 | toolSchemas.ts, tools.ts, package.json |
| 2 | Create Zod-to-Gemini schema converter | 3b601d0 | schemaConverter.ts |

## What Was Built

### Tool Schemas (`apps/api/utils/agent/toolSchemas.ts`)

Two Zod schemas defining the parameter shapes for function calling tools:

**tariffLookupSchema:**
- `tarif`: enum `['tvoed', 'tv-l', 'avr']` - Tarifvertrag type
- `group`: string - Entgeltgruppe (P5-P15, E5-E15)
- `stufe`: enum `['1', '2', '3', '4', '5', '6']` - Experience level
- `hours`: optional number - Weekly work hours
- `state`: optional string - Bundesland

**taxCalculateSchema:**
- `yearlySalary`: positive number - Gross annual salary
- `taxClass`: literal union `1|2|3|4|5|6` - Tax class (strict, not generic number)
- `year`: literal union `2025|2026` - Tax year
- `churchTax`: enum with default `'none'`
- `hasChildren`, `childCount`: Boolean and integer with defaults
- `state`: enum `['west', 'east', 'sachsen']` with default
- `birthYear`: optional integer for age calculations
- `healthInsuranceAddOn`: number with default 1.6%

### TypeScript Types (`apps/api/types/tools.ts`)

Types inferred directly from Zod schemas using `z.infer<typeof>`:

```typescript
export type TariffLookupInput = z.infer<typeof tariffLookupSchema>;
export type TaxCalculateInput = z.infer<typeof taxCalculateSchema>;
```

Plus result interfaces (`TariffLookupResult`, `TaxCalculateResult`) and structured error type (`ToolError`) for AI retry context.

### Schema Converter (`apps/api/utils/agent/schemaConverter.ts`)

Utility functions to convert Zod schemas to Gemini function calling format:

- `zodToGeminiTool(name, description, schema)` - Converts single schema
- `mergeTools(...tools)` - Combines multiple tool declarations

The converter handles:
- `z.enum()` as STRING with enum values
- `z.union([z.literal()])` as NUMBER/STRING with enum values
- `z.number().int()` as INTEGER type
- `z.optional()` excluded from required array
- German `.describe()` text preserved as parameter descriptions

### Example Output

```json
{
  "functionDeclarations": [
    {
      "name": "tariff_lookup",
      "description": "Schlagt das Bruttogehalt basierend auf Tarifvertrag...",
      "parameters": {
        "type": "OBJECT",
        "properties": {
          "tarif": {
            "type": "STRING",
            "description": "Tarifvertrag: TVoD (offentlicher Dienst)...",
            "enum": ["tvoed", "tv-l", "avr"]
          }
        },
        "required": ["tarif", "group", "stufe"]
      }
    }
  ]
}
```

## Decisions Made

1. **Literal unions over constrained numbers**: Using `z.union([z.literal(1), ...z.literal(6)])` for taxClass instead of `z.number().min(1).max(6)` ensures only exact values 1-6 are valid, catching invalid values at parse time.

2. **German descriptions**: All `.describe()` annotations use German to help the AI understand context in German-language conversations (e.g., "Steuerklasse: 1 (ledig), 2 (alleinerziehend)...").

3. **Stufe as string enum**: Using `['1', '2', '3', '4', '5', '6']` strings rather than numbers for stufe to match existing form data handling patterns.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Zod not installed**
- **Found during:** Task 1 preparation
- **Issue:** `zod` package was not installed in apps/api
- **Fix:** Installed `zod@^3.24.0` via npm
- **Files modified:** apps/api/package.json, package-lock.json
- **Commit:** 41c68c1

## Technical Notes

- Zod `_def` internals are used for schema introspection (descriptions, checks, inner types)
- ESLint disable comments added for `@typescript-eslint/no-explicit-any` where Zod internals require it
- Fields with `.default()` are included in required array since defaults are applied on Zod parse, not Gemini call

## Next Phase Readiness

Ready for Phase 08 Plan 02 (Tool Execution Handlers):
- Schemas can validate incoming function call parameters via `schema.safeParse()`
- Types ensure handler implementations match expected shapes
- ToolError interface ready for structured error responses to AI

## Verification

All checks passed:
- TypeScript compiles without errors: `npx tsc --noEmit` clean
- Schema files exist with correct exports
- Generated Gemini tool definitions contain German descriptions
- Enum values correctly mapped (taxClass as NUMBER, tarif as STRING)

---

*Phase: 08-function-calling-enhancement*
*Plan: 01*
*Completed: 2026-02-03*
