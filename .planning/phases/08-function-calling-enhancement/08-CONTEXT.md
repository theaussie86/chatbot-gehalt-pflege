# Phase 8: Function Calling Enhancement - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

AI reliably executes tax calculations and tariff lookups via structured tool calls. Includes tool schema design, validation with retry logic, and multi-tool orchestration. Suggested response chips are Phase 9, validation UX improvements are Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Tool Schema Design
- Zod schemas defined in shared types/ directory — single source of truth for validation AND Gemini tool definitions
- German-language field descriptions in schemas (e.g., "Steuerklasse: 1-6") to help AI understand context
- Exhaustive literal unions for enum values (taxClass: 1 | 2 | 3 | 4 | 5 | 6) — strict, catches invalid early
- One unified `tariff_lookup` tool with tarif as parameter (not separate per-tariff tools)

### Retry Behavior
- Auto-retry with error context injected — AI automatically retries when validation fails
- Maximum 3 retries before giving up
- Graceful message to user after max retries ("Ich konnte das nicht berechnen. Bitte überprüfen Sie Ihre Eingaben.")
- Loading indicator shown during retries (no retry count visible to user)

### Multi-tool Orchestration
- Explicit chain required: tariff_lookup must complete before tax_calculate can use gross salary
- Multiple turns (not single-turn chaining) — each tool call is a separate turn for clarity and debugging
- Transparent flow to user:
  1. Tariff lookup completes → Show gross salary to user with context
  2. Explain next step → "Jetzt berechnen wir Ihr Nettogehalt"
  3. Collect tax info → Prompt for Steuerklasse, Kirchensteuer, etc.
- Gross salary display: total only (no breakdown of base + Zulagen)

### Error Feedback Loop
- Structured error objects for AI retry context: `{ field: 'taxClass', error: 'Must be 1-6', received: 7 }`
- Include suggested corrections in errors: `{ error: 'Invalid taxClass', suggestion: 'Use 1, 2, 3, 4, 5, or 6' }`
- Use Supabase observability for error tracking
- Store error details with salary_inquiries record for admin visibility

### Claude's Discretion
- Exact Zod schema structure and type exports
- How to convert Zod schemas to Gemini function calling format
- Supabase observability implementation details (table vs Logflare)
- Error message wording for user-facing graceful failures

</decisions>

<specifics>
## Specific Ideas

- User should see gross salary before tax calculation starts — keeps them informed and in control
- "Jetzt berechnen wir Ihr Nettogehalt" transition message between tariff lookup and tax calculation
- Error tracking should leverage existing Supabase infrastructure

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 08-function-calling-enhancement*
*Context gathered: 2026-02-03*
