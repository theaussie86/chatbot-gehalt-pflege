---
phase: 10
plan: 01
subsystem: validation
tags: [zod, validation, german-ux, error-handling, retry-logic]
requires: [08-02-function-calling-agent]
provides: [two-phase-validation, field-schemas, retry-tracking]
affects: [10-02-tool-extraction-integration]
tech-stack:
  added: []
  patterns: [two-phase-validation, ttl-based-reset, near-miss-suggestions]
decisions:
  - id: zod-schemas-single-source
    text: Zod schemas as single source of truth for field validation
    rationale: Ensures consistency between extraction and validation phases
  - id: german-number-word-preprocessing
    text: Pre-process German number words (eins, zwei, drei) before validation
    rationale: Natural language conversation expects spoken numbers to work
  - id: retry-ttl-reset
    text: 30-min TTL for retry context (fresh start when user returns)
    rationale: Accumulated retry counts feel punishing after long gaps
  - id: cross-field-group-validation
    text: Group field validation requires tarif context for P/E prefix
    rationale: P5-P15 for Pflege (TVöD/AVR), E5-E15 for general (TV-L)
key-files:
  created:
    - apps/api/utils/agent/formFieldSchemas.ts
    - apps/api/utils/agent/FieldValidator.ts
  modified: []
duration: 3min
completed: 2026-02-03
---

# Phase 10 Plan 01: Form Field Schemas & Validation Service Summary

**One-liner:** Zod schemas with German number word pre-processing and retry-tracked validation service for friendly error feedback

## What Was Built

Two-phase validation foundation enabling LLM extraction → Zod validation with user-friendly German error messages.

### 1. Form Field Schemas (formFieldSchemas.ts)

Created 8 Zod schemas for all form fields collected during the salary interview:

**Field Schemas:**

| Field             | Type          | Pre-processors                                              | Example Inputs                          |
| ----------------- | ------------- | ----------------------------------------------------------- | --------------------------------------- |
| tarif             | enum          | TVöD/TVÖD/öffentlich → tvoed, TV-L/Länder → tv-l, AVR/kirchlich → avr | 'TVöD', 'öffentlicher Dienst', 'AVR'    |
| group             | string        | P7/E7/7 → normalized, German words → numbers                | '7', 'P7', 'sieben'                     |
| experience        | enum 1-6      | Stufe/Jahre → Stufe, German words → numbers                 | 'Stufe 3', '5 Jahre', 'drei'            |
| hours             | number 1-48   | Vollzeit → 38.5, Teilzeit → 20, 38,5 → 38.5                 | '38,5', 'Vollzeit', 40                  |
| state             | enum (16)     | Abbreviations → full names (NRW → Nordrhein-Westfalen)      | 'NRW', 'Bayern', 'BY'                   |
| taxClass          | literal 1-6   | Klasse/ledig → 1, German words → numbers                    | 'Klasse 1', 'eins', 'ledig'             |
| churchTax         | boolean       | ja/evangelisch/katholisch → true, nein/konfessionslos → false | 'ja', 'evangelisch', 'ausgetreten'      |
| numberOfChildren  | number 0-10   | keine/null/nein → 0, German words → numbers                 | 'keine', 'zwei', '3'                    |

**German Number Word Map:**

```typescript
GERMAN_NUMBER_WORDS: {
  'null': 0, 'keine': 0, 'kein': 0, 'nein': 0,
  'eins': 1, 'ein': 1, 'eine': 1,
  'zwei': 2, 'zwo': 2,
  'drei': 3, 'vier': 4,
  'fuenf': 5, 'fünf': 5, 'sechs': 6,
  'sieben': 7, 'acht': 8, 'neun': 9, 'zehn': 10
}
```

**Error Message Examples:**

- `"Hmm, 'XYZ' kenne ich nicht als Tarifvertrag. Arbeitest du im öffentlichen Dienst (TVöD), bei den Ländern (TV-L), oder kirchlich (AVR)?"`
- `"Steuerklasse '7' gibt es nicht — bitte wähle 1-6. Zum Beispiel: 1 (ledig), 3 (verheiratet, höheres Einkommen), oder 4 (verheiratet, gleich)."`
- `"Die Erfahrungsstufe 'xyz' verstehe ich nicht. Wie lange bist du schon dabei? (z.B. '3 Jahre' oder 'Stufe 2')"`

**Features:**

- Casual/friendly tone ("Hmm, ...", "kenne ich nicht")
- Always quote user's invalid input
- Include valid options with examples
- Accept all reasonable format variations

### 2. Field Validator Service (FieldValidator.ts)

Validation service wrapping Zod schemas with retry tracking and German error formatting.

**Class Structure:**

```typescript
export class FieldValidator {
  validate(field: string, value: unknown, sessionId: string, formState?: FormState): FieldValidationResult
  resetContext(sessionId: string, field?: string): void
  getValidOptions(field: string): string[]
  private getContext(key: string): ValidationContext
  private formatGermanError(field: string, zodError: ZodError, received: unknown): string
  private findNearMiss(field: string, value: unknown): string | undefined
}
```

**Key Features:**

1. **Retry Tracking:**
   - Tracks retry counts per `{sessionId}:{field}` combination
   - Max 3 retries before escalation
   - After 3rd failure: `shouldEscalate: true` + `validOptions` array for chips

2. **TTL-Based Reset:**
   - 30-minute inactivity window
   - Fresh start when user returns after being away
   - Implements "forgive and forget" for better UX

3. **Cross-Field Validation:**
   - Group field requires tarif context for P/E prefix determination
   - TVöD/AVR → P prefix (Pflege: P5-P15)
   - TV-L → E prefix (general civil service: E5-E15)
   - If tarif missing, prompts: "Ich brauche erst deinen Tarifvertrag..."

4. **Near-Miss Suggestions:**
   - Levenshtein distance for enum fields (tarif, state)
   - Numeric boundary suggestions (7 → 6 for taxClass)
   - Partial match hints for boolean fields

5. **German Error Formatting:**
   - Conversational tone ("Du hast '7' eingegeben...")
   - Always includes valid options
   - Empathy acknowledgment on escalation ("Kein Problem, das ist manchmal verwirrend")

**Validation Flow:**

```
1. Get/create context (check TTL)
2. Check retry count (escalate if >= 3)
3. Parse with Zod schema
4. For group: apply tarif-based prefix logic
5. On success: reset context, return normalized value
6. On failure: increment retry, format error, find near-miss
```

**Example Results:**

```typescript
// Success
{ valid: true, normalizedValue: 'tvoed', retryCount: 0, shouldEscalate: false }

// Failure (attempt 1)
{
  valid: false,
  error: {
    message: "Steuerklasse '7' gibt es nicht — bitte wähle 1-6...",
    field: 'taxClass',
    received: '7',
    suggestion: '6'
  },
  retryCount: 1,
  shouldEscalate: false
}

// Escalation (attempt 3)
{
  valid: false,
  error: {
    message: 'Kein Problem, das ist manchmal verwirrend. Hier sind die Optionen:',
    field: 'taxClass',
    received: '7',
    validOptions: ['1 (ledig)', '2 (alleinerziehend)', '3 (verheiratet)', '4 (verheiratet)', '5', '6']
  },
  retryCount: 3,
  shouldEscalate: true
}
```

## Deviations from Plan

None — plan executed exactly as written.

## Next Phase Readiness

**Phase 10 Plan 02 (Tool Extraction Integration) can proceed:**

- ✅ Zod schemas available for all form fields
- ✅ FieldValidator service ready for integration
- ✅ Retry tracking implemented
- ✅ German error messages with examples
- ✅ Cross-field validation pattern established

**Integration points for 10-02:**

- Import `fieldValidator` singleton in `ToolExecutor.ts`
- After each tool extraction, call `fieldValidator.validate(field, value, sessionId, formState)`
- On validation failure, include error message in AI response for re-prompting
- On escalation, trigger chip generation with `validOptions`

## Decisions Made

### 1. Zod Schemas as Single Source of Truth

**Decision:** Use Zod schemas for both validation AND type inference.

**Rationale:** Eliminates schema drift between validation logic and TypeScript types. Single maintenance point.

**Impact:** All form field types now inferred from Zod schemas via `z.infer<typeof schema>`.

### 2. German Number Word Pre-processing

**Decision:** Pre-process German number words (eins, zwei, drei...) before Zod validation.

**Rationale:** Natural language conversation expects spoken numbers to work. Users shouldn't need to type digits.

**Impact:** `GERMAN_NUMBER_WORDS` map shared between schemas. Supports 0-10 in German.

### 3. 30-Minute TTL for Retry Context

**Decision:** Reset retry counts after 30 minutes of inactivity.

**Rationale:** Accumulated retry counts feel punishing after long gaps. Fresh start = better UX when user returns.

**Implementation:** `getContext()` checks `lastUpdated + CONTEXT_TTL_MS < Date.now()` to determine expiry.

**Alternative considered:** Never reset (rejected - feels too strict for casual users).

### 4. Cross-Field Group Validation

**Decision:** Group field validation requires tarif context to determine P vs E prefix.

**Rationale:**
- Pflege (nursing) uses P5-P15 groups in TVöD/AVR
- General civil service uses E5-E15 in TV-L
- Bare number input (e.g., "7") needs tarif context to add correct prefix

**Implementation:** `validateGroup()` method checks `formState.data.job_details.tarif` and applies prefix logic.

**Edge case:** If tarif not set, returns validation error prompting for tarif first.

## Testing Notes

**Manual testing needed for Phase 10-02 integration:**

1. Test retry tracking across multiple validation attempts
2. Test TTL reset after 30-minute gap (mock `Date.now()` in tests)
3. Test group field validation with different tarif contexts
4. Test near-miss suggestions for common invalid inputs
5. Test escalation behavior after 3rd failure
6. Test German number word conversions (eins, zwei, drei...)
7. Test format variations (38,5 vs 38.5, TVöD vs tvoed, etc.)

**Example test cases:**

```typescript
// Retry tracking
validate('taxClass', '7', 'session1') // Attempt 1
validate('taxClass', '7', 'session1') // Attempt 2
validate('taxClass', '7', 'session1') // Attempt 3 → shouldEscalate: true

// TTL reset
validate('taxClass', '7', 'session1') // Attempt 1
// Wait 31 minutes (mock Date.now())
validate('taxClass', '7', 'session1') // Fresh context → Attempt 1 again

// Cross-field validation
validate('group', '7', 'session1', { data: { job_details: { tarif: 'tvoed' } } }) // → 'P7'
validate('group', '7', 'session1', { data: { job_details: { tarif: 'tv-l' } } }) // → 'E7'
validate('group', '7', 'session1', { data: { job_details: {} } }) // → Error: need tarif first

// German number words
validate('numberOfChildren', 'zwei', 'session1') // → 2
validate('taxClass', 'drei', 'session1') // → 3
```

## Performance Metrics

**Execution time:** 3 minutes
**Start:** 2026-02-03T12:39:40Z
**End:** 2026-02-03T12:42:40Z

**Task breakdown:**

| Task | Duration | Files                        | Lines |
| ---- | -------- | ---------------------------- | ----- |
| 1    | ~2min    | formFieldSchemas.ts          | 400   |
| 2    | ~1min    | FieldValidator.ts            | 447   |

**Commits:**

| Commit  | Type | Description                                       |
| ------- | ---- | ------------------------------------------------- |
| dcec667 | feat | Create Zod form field schemas with pre-processors |
| 7141ed4 | feat | Create FieldValidator service with retry tracking |

---

**Status:** ✅ Complete
**Next:** Phase 10 Plan 02 - Tool Extraction Integration
