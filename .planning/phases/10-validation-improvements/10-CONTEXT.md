# Phase 10: Validation Improvements - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Improve data extraction reliability with two-phase validation (LLM extracts → Zod validates) and user-friendly German error messages. When validation fails, the AI re-prompts with specific correction requests. This does NOT add new fields, new tariff systems, or change the state machine flow.

</domain>

<decisions>
## Implementation Decisions

### German error messages
- Casual/friendly tone ("Hmm, Steuerklasse 7 gibt es nicht — bitte wähle 1-6")
- Always suggest valid options in the error message
- Quote the user's invalid input ("Du hast '7' eingegeben, aber...")
- Include brief explanation when helpful (e.g., "...gibt es im deutschen Steuersystem nicht")

### Validation timing
- Validate immediately after extraction — each field validated right when AI extracts it
- Block progress until valid — don't accept the field, ask user to correct before moving on
- 3 validation attempts before escalating — after 3 failures, offer chips/examples to help
- Reset failure count on session return — fresh start when user comes back

### Re-prompting behavior
- Structure: Error message + specific question ("Steuerklasse 7 gibt es nicht. Welche Steuerklasse hast du? (1-6)")
- Include 2-3 examples in re-prompts ("...zum Beispiel 1 (ledig), 3 (verheiratet, Alleinverdiener), oder 4")
- After 3 failures: Show chips with explanation ("Lass mich dir helfen — tippe einfach auf eine Option:")
- Brief empathy acknowledgment ("Kein Problem, das ist manchmal verwirrend — hier sind die Optionen:")

### Edge case handling
- Suggest closest valid option for near-misses ("Steuerklasse 7 gibt es nicht — meintest du vielleicht 6?")
- Interpret German number words ("drei" → 3, "sechs" → 6, etc.)
- Accept partial tariff input and ask follow-up ("TVöD, gut! Welche Entgeltgruppe?")
- Accept all reasonable format variations ('0', 'keine', 'null', 'nein' all mean no children)

### Claude's Discretion
- Exact wording of error messages (within friendly tone guidelines)
- Which fields get which example formats
- How to detect "close" invalid values for suggestions

</decisions>

<specifics>
## Specific Ideas

- Error messages should feel conversational, like a helpful colleague, not a form validation popup
- The escalation to chips after 3 attempts should feel like "let me help you" not "you're doing it wrong"
- German number words (eins, zwei, drei...) are common in conversation — treat them as valid input

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 10-validation-improvements*
*Context gathered: 2026-02-03*
