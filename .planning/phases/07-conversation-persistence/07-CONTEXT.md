# Phase 7: Conversation Persistence - Context

**Gathered:** 2026-01-27
**Status:** Ready for planning

<domain>
## Phase Boundary

Users can resume conversations across sessions. Admins gain visibility into structured salary inquiry data. Includes client-side persistence, admin inquiry dashboard, visual progress indicator, and email export with DOI consent. Does NOT include suggested response chips (Phase 9) or new function calling capabilities (Phase 8).

</domain>

<decisions>
## Implementation Decisions

### Client storage strategy
- Single conversation at a time — no multi-thread support
- On completion, delete local conversation data; completed inquiry persists in Supabase only
- Auto-resume silently when user returns to an incomplete conversation (no prompt)
- Visible "New conversation" button in chat header to manually reset mid-flow

### Admin inquiry dashboard
- Summary row per inquiry with expandable detail view
- Summary shows: tariff, Stufe, gross, net, tax class, date, user email
- Expanded view shows all collected fields plus full tax breakdown (Lohnsteuer, Soli, Kirchensteuer, SV-Beitrage) and conversation excerpts
- Manual refresh (no realtime subscription)
- Basic filters: date range and tariff type (TVoD, TV-L, AVR), sort by date

### Email capture
- AI asks for email as part of the conversation flow (not a separate UI field)
- Email is collected before/after showing results — tied to DOI consent

### Progress indicator
- Horizontal step bar fixed at top of widget
- 4 labeled steps matching state machine: Jobdaten → Steuerdaten → Ubersicht → Ergebnis
- Display only — not interactive/clickable
- Current step highlighted, completed steps marked

### Email export with DOI
- Export triggered after user provides email and completes DOI consent
- DOI consent captured via inline form in chat: email input field + marketing consent checkbox
- User must check consent box to receive the summary email
- Formatted HTML email containing: user inputs (Tarif, Stufe, Steuerklasse, etc.) + full salary result breakdown (Brutto, Netto, Steuer, SV-Beitrage)
- Email serves dual purpose: result delivery + marketing opt-in

### Claude's Discretion
- Step bar visual styling and animations
- Email template design and branding details
- DOI confirmation email wording
- Local storage implementation details (Dexie.js vs localStorage)
- Dashboard table component choice
- Error state handling for storage quota exceeded

</decisions>

<specifics>
## Specific Ideas

- Step bar labels must be German: Jobdaten → Steuerdaten → Ubersicht → Ergebnis
- DOI is a hard requirement — no email sending without explicit consent
- Email contains both what the user entered AND the calculated result (not just the result)
- "New conversation" button should be clearly visible, not hidden in a menu
- Auto-resume should be seamless — user sees their conversation history as if they never left

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 07-conversation-persistence*
*Context gathered: 2026-01-27*
