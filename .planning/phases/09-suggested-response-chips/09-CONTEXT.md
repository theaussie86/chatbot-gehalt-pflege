# Phase 9: Suggested Response Chips - Context

**Gathered:** 2026-02-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Provide quick-tap reply options below bot messages so mobile users don't need to type. Chips display contextual suggestions based on current conversation state. Users tap to fill input, then optionally edit before sending.

</domain>

<decisions>
## Implementation Decisions

### Chip Content Strategy
- Hybrid approach: predefined chips for known fields (tariff systems, Steuerklasse 1-6), AI-generated for open questions
- Variable 2-4 chips per message — only show when meaningful options exist
- Skip chips entirely for open text input (names, specific numbers, freeform)
- Short labels only: "TVöD", "Steuerklasse 3", "Ja" — not full sentences

### Visual Design & Layout
- Chips appear above the input field, floating separate from message bubbles
- Horizontal row layout, wrap to next line on small screens
- Animated transition: tapped chip transforms into sent message bubble
- Same touch-friendly sizing everywhere (min 44x44px), no desktop/mobile difference

### Stage-Specific Behavior
- Chips dynamically match current question context (e.g., tariff chips when asking about tariff, Stufe chips when asking about experience)
- job_details: Show relevant options for whatever field is being asked (TVöD/TV-L/AVR for tariff, Stufe 1-6 for experience, etc.)
- tax_details: Show all Steuerklasse 1-6 when asking about tax class
- summary: "Ja" / "Etwas ändern" chips for confirmation
- completed: No chips after results shown

### Selection Mechanics
- Tap fills input field — user can edit before sending (not instant submit)
- Chips fade but remain accessible when user types manually
- Chips clear immediately after message sends, new chips appear with bot response
- Single chip selection only — tapping another chip replaces input text

### Claude's Discretion
- Exact animation timing and easing
- Chip color/styling within design system
- AI prompt engineering for contextual suggestions
- Loading state while waiting for bot response

</decisions>

<specifics>
## Specific Ideas

- Chips should feel helpful, not pushy — they're shortcuts, not forced choices
- The conversation flow determines what chips appear, not rigid rules per stage

</specifics>

<deferred>
## Deferred Ideas

- Marketing email consent collection: User mentioned wanting to collect email with marketing consent (confirm they can send marketing emails, with unsubscribe link). This extends beyond the existing Phase 7 DOI email export and is its own capability — add to backlog or future phase.

</deferred>

---

*Phase: 09-suggested-response-chips*
*Context gathered: 2026-02-03*
