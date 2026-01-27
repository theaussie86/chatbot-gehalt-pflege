---
phase: 07
plan: 03
name: "Email Export with DOI Consent"
subsystem: user-engagement
tags: [email, doi, consent, resend, export]
dependencies:
  requires: [07-01, 07-02]
  provides: [email-export-flow, doi-consent-form, inquiry-email-association]
  affects: [admin-dashboard]
tech:
  added: [resend]
  patterns: [inline-form-in-chat, id-based-db-update, graceful-degradation]
files:
  created:
    - apps/web/components/DoiConsentForm.tsx
    - apps/api/lib/emailTemplate.ts
    - apps/api/app/api/email-export/route.ts
  modified:
    - apps/api/app/api/chat/route.ts
    - apps/web/services/gemini.ts
    - apps/web/App.tsx
    - apps/web/types.ts
    - apps/web/components/MessageBubble.tsx
    - apps/api/package.json
decisions:
  - decision: "Inquiry ID flow: chat API returns ID on insert, widget stores in state, passes to email export"
    rationale: "Enables precise single-row DB update (.eq('id', inquiryId)) instead of unreliable .order().limit() pattern"
  - decision: "Resend for email sending"
    rationale: "Simple API, generous free tier, great DX for transactional emails"
  - decision: "Inline DOI form in chat (not modal or popup)"
    rationale: "Feels native to conversational flow, matches chat UI pattern"
  - decision: "Email export endpoint rate limit: 5 per IP per 60 seconds"
    rationale: "Stricter than chat (20/min) to prevent email spam abuse"
  - decision: "Graceful degradation if inquiryId is null"
    rationale: "Email delivery is primary purpose; DB association is secondary benefit"
metrics:
  duration: "5 minutes"
  tasks: 4
  commits: 4
  files_created: 3
  files_modified: 6
completed: 2026-01-27
---

# Phase 7 Plan 03: Email Export with DOI Consent Summary

**One-liner:** Email export with DOI consent form inline in chat, Resend-powered HTML emails, and inquiry ID flow for precise DB updates

## Performance

- **Total duration:** 5 minutes
- **Tasks completed:** 4/4 (100%)
- **Build status:** ✅ Both apps compile successfully

## Accomplishments

### Task 1: Chat API returns inquiry id and widget stores it
- ✅ Chat route insert now includes `.select('id').single()` to return inserted row ID
- ✅ Chat route returns `inquiryId` in JSON response when section is 'completed'
- ✅ gemini.ts updated to return `inquiryId` from API response
- ✅ App.tsx stores `inquiryId` in state when received
- ✅ App.tsx clears `inquiryId` on reset
- ✅ ID flow established: DB insert → API response → widget state → ready for email export

### Task 2: DOI consent form component and chat integration
- ✅ Created `DoiConsentForm.tsx` with email input, consent checkbox, validation
- ✅ Form validates email format (regex) and requires consent checkbox (client-side)
- ✅ Success/error states with visual feedback (checkmark, retry button)
- ✅ Touch-friendly design (44px min tap targets for input and button)
- ✅ Message type updated to include `showDoiForm` flag
- ✅ MessageBubble renders DoiConsentForm when `showDoiForm` is true
- ✅ `sendEmailExport` function added to gemini.ts
- ✅ App.tsx shows DOI form after calculation completes (section = 'completed')
- ✅ App.tsx handles email submission via `handleEmailSubmit`
- ✅ DOI loading and submitted states managed in App state

### Task 3: HTML email template
- ✅ Created `emailTemplate.ts` with `buildSalaryEmail` function
- ✅ German locale EUR formatting (1.234,56 EUR via Intl.NumberFormat)
- ✅ Inline CSS for email client compatibility
- ✅ Three sections: Deine Angaben, Berechnungsergebnis, Abzüge im Detail
- ✅ Professional layout with gradient header and color-coded result sections
- ✅ Max-width 600px centered responsive design
- ✅ Includes disclaimer about estimate accuracy
- ✅ All user inputs displayed: tarif, gruppe, stufe, hours, state, taxClass, churchTax, numberOfChildren
- ✅ All calculation results: brutto, netto, taxes breakdown (Lohnsteuer, Soli, Kirchensteuer), social security breakdown (KV, RV, AV, PV)

### Task 4: Email export API endpoint with id-based DB update
- ✅ Created POST `/api/email-export` endpoint
- ✅ Installed `resend` package for email sending
- ✅ Server-side validation: email format (regex) and consent checkbox (must be true)
- ✅ Rate limiting: 5 requests per IP per 60 seconds (stricter than chat)
- ✅ Sends HTML email via Resend (using `onboarding@resend.dev` for development)
- ✅ Updates `salary_inquiries` record using `.update({ email }).eq('id', inquiryId)` for precise single-row update
- ✅ Graceful degradation if `RESEND_API_KEY` not configured (503 response)
- ✅ Graceful handling if `inquiryId` is null (email still sent, just not saved to DB)
- ✅ CORS OPTIONS handler for widget requests
- ✅ Logs all email export attempts to `request_logs` table

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `c269000` | Chat API returns inquiry id and widget stores it |
| 2 | `1205ebf` | DOI consent form component and chat integration |
| 3 | `1ef14c6` | HTML email template for salary results |
| 4 | `a5be463` | Email export API endpoint with id-based DB update |

## Files Created

1. **apps/web/components/DoiConsentForm.tsx**
   - Inline DOI consent form component
   - Email input + consent checkbox + submit button
   - Client-side validation (email format, consent required)
   - Success/error states with visual feedback
   - Touch-friendly (44px min tap targets)

2. **apps/api/lib/emailTemplate.ts**
   - `buildSalaryEmail` function for HTML email generation
   - German locale EUR formatting
   - Inline CSS for email client compatibility
   - Three-section layout (Angaben, Ergebnis, Abzüge)
   - Professional gradient design

3. **apps/api/app/api/email-export/route.ts**
   - POST endpoint for email export
   - Server-side validation (email format, consent)
   - Resend integration for email sending
   - Rate limiting (5 per IP per 60s)
   - ID-based DB update (`.eq('id', inquiryId)`)
   - CORS handling

## Files Modified

1. **apps/api/app/api/chat/route.ts**
   - Insert now includes `.select('id').single()` to return inquiry ID
   - Response includes `inquiryId` field when section is 'completed'

2. **apps/web/services/gemini.ts**
   - `sendMessageToGemini` return type includes `inquiryId`
   - `sendEmailExport` function added for email export requests

3. **apps/web/App.tsx**
   - `inquiryId` state added to store inquiry ID from API
   - `doiLoading` and `doiSubmitted` states for form feedback
   - DOI form message added after calculation completes
   - `handleEmailSubmit` function for email export
   - Reset clears inquiry ID and DOI states

4. **apps/web/types.ts**
   - `Message` interface includes `showDoiForm` flag

5. **apps/web/components/MessageBubble.tsx**
   - Accepts `doiFormProps` for rendering DOI form
   - Renders `DoiConsentForm` when `message.showDoiForm` is true

6. **apps/api/package.json**
   - Added `resend` dependency

## Decisions Made

### 1. Inquiry ID Flow Architecture
**Decision:** Chat API returns inquiry ID on insert, widget stores in state, passes to email export for DB update.

**Context:** Need to associate user email with specific salary inquiry record in the database.

**Options considered:**
- Option A: Use `.order('created_at', { ascending: false }).limit(1)` to find "latest" inquiry
  - ❌ Unreliable in concurrent scenarios (multiple users submitting at same time)
  - ❌ Not a valid Supabase JS query chain (`.order().limit()` doesn't work with `.update()`)
- Option B: Return inquiry ID from chat API, store in widget, pass to email export
  - ✅ Precise single-row update using `.eq('id', inquiryId)`
  - ✅ No race conditions
  - ✅ Clear data flow

**Outcome:** Implemented Option B. ID flows: DB insert with `.select('id').single()` → API response → widget state → email export request → `.update().eq('id', inquiryId)`.

### 2. Email Service Provider
**Decision:** Use Resend for email sending.

**Rationale:**
- Simple REST API (single `POST /emails`)
- Generous free tier (3,000 emails/month)
- Excellent DX with TypeScript SDK
- Uses `onboarding@resend.dev` for development (no domain verification needed)

**Alternatives considered:**
- SendGrid: More complex API, lower free tier
- AWS SES: Requires AWS setup, more configuration

### 3. DOI Form Placement
**Decision:** Inline form in chat (not modal or popup).

**Rationale:**
- Feels native to conversational flow
- Matches existing chat UI patterns (options buttons, salary result cards)
- No disruptive modals breaking the conversation
- Better mobile UX (no modal overlay issues)

**Implementation:** Form rendered inside MessageBubble when `message.showDoiForm` flag is true.

### 4. Rate Limiting for Email Export
**Decision:** 5 requests per IP per 60 seconds (stricter than chat's 20/min).

**Rationale:**
- Prevent email spam abuse
- Email sending has real cost (unlike chat which is API calls)
- Still allows legitimate retries if user makes a typo

### 5. Graceful Degradation Strategy
**Decision:** If `inquiryId` is null, still send email (don't save to DB). If `RESEND_API_KEY` missing, return 503.

**Rationale:**
- Email delivery is the primary user-facing feature
- DB association is a secondary admin benefit
- User shouldn't be blocked if save failed during chat
- But email service being down is a genuine failure (503 appropriate)

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None - all tasks completed successfully on first attempt.

## User Setup Required

⚠️ **CRITICAL:** User must configure email service before this feature works.

See `.planning/phases/07-conversation-persistence/07-USER-SETUP.md` for detailed instructions.

**Quick summary:**
1. Create account at resend.com
2. Create API key: Resend Dashboard → API Keys → Create API Key
3. Add to environment: `RESEND_API_KEY=re_xxxxx`
4. For production: Verify sender domain in Resend Dashboard → Domains
5. For testing: Use `onboarding@resend.dev` (already configured in code)

**Also required from Plan 07-02:**
- Add `email` column to `salary_inquiries` table (see 07-USER-SETUP.md)
- Add RLS policy for authenticated read access

## Next Phase Readiness

✅ **Phase 7 Plan 03 complete.** This is the final plan in Phase 7.

### Phase 7 Status
- ✅ Plan 01: Conversation Persistence (localStorage, StepBar, reset)
- ✅ Plan 02: Admin Inquiry Dashboard (expandable table, server actions)
- ✅ Plan 03: Email Export with DOI Consent (this plan)

### What's Next
Phase 7 is complete. Next phase (Phase 8) will implement:
- Function calling capabilities
- Structured data extraction improvements
- Tool integration patterns

### Dependencies for Future Phases
This plan provides:
- **Email export flow:** Future phases can trigger email exports for other purposes
- **DOI consent pattern:** Reusable consent form component for other data collection
- **Inquiry-email association:** Admin can see which inquiries have associated emails

### Blockers/Concerns
None. All functionality working as designed.

---

**Phase:** 07-conversation-persistence
**Plan:** 03
**Completed:** 2026-01-27
**Duration:** 5 minutes
