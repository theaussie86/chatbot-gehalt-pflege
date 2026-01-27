---
phase: 07-conversation-persistence
plan: 02
subsystem: admin-dashboard
tags: [admin-ui, salary-inquiries, dashboard, rag, supabase]

dependency_graph:
  requires: []
  provides:
    - Admin inquiry dashboard at /inquiries
    - Server action for fetching salary inquiries with filters
    - Expandable table rows showing full tax breakdown
  affects:
    - 07-03 (Email capture will populate the email column)
    - Future analytics/reporting features

tech_stack:
  added: []
  patterns:
    - Server action pattern for data fetching
    - Expandable table rows with detail views
    - Client-side filter state management

key_files:
  created:
    - apps/api/app/actions/inquiries.ts
    - apps/api/app/(admin)/inquiries/page.tsx
    - apps/api/app/(admin)/inquiries/InquiryTable.tsx
    - apps/api/app/(admin)/inquiries/InquiryDetail.tsx
    - .planning/phases/07-conversation-persistence/07-USER-SETUP.md
  modified:
    - apps/api/app/(admin)/layout.tsx

decisions:
  - decision: Use server actions instead of API routes for inquiry data fetching
    rationale: Consistent with existing admin patterns (documents.ts), simpler auth flow
    alternatives: API route with bearer token auth
    impact: Admin code follows established patterns

  - decision: Manual refresh button instead of realtime subscriptions
    rationale: Inquiries are historical data, realtime not needed for admin use case
    alternatives: Supabase realtime subscription
    impact: Simpler implementation, no WebSocket overhead

  - decision: Email column shows "-" when null
    rationale: Prepares UI for Plan 03 (email capture), shows field is expected but optional
    alternatives: Hide column when all null
    impact: Users see email will be captured in future

metrics:
  duration: 171 seconds (2.85 minutes)
  completed: 2026-01-27
---

# Phase 7 Plan 02: Admin Inquiry Dashboard Summary

**One-liner:** Admin inquiry dashboard with filterable table, expandable detail rows showing full tax breakdown (Lohnsteuer, Soli, Kirchensteuer, SV-Beiträge), and server action for fetching salary inquiries.

## Performance

**Duration:** 2.85 minutes

**Task breakdown:**
- Task 1 (Server action): 1 minute
- Task 2 (Dashboard UI): 1.85 minutes

**Efficiency:** Autonomous execution with one TypeScript fix iteration (optional chaining for taxes/socialSecurity fields).

## Accomplishments

**CONV-03 (Admin sees structured salary inquiry data):**
- Admin dashboard at `/inquiries` shows salary inquiries in filterable, sortable table
- Each row displays: date, tariff, Gruppe, Stufe, gross, net, email (shows "-" when null)
- Expandable rows reveal full detail view with:
  - Berufliche Daten (job details)
  - Steuerliche Daten (tax details)
  - Steuerabzüge (Lohnsteuer, Soli, Kirchensteuer)
  - Sozialabgaben (KV, RV, AV, PV)
  - E-Mail address (when available)

**CONV-04 (Email visibility):**
- Email column present in main table
- Email section in detail view
- Ready for Plan 03 to populate email field

**Filters:**
- Date range filter (Von/Bis)
- Tariff type filter (Alle, TVöD, TV-L, AVR)
- Manual refresh button
- Total count display

**German conventions:**
- All text in German (Gehaltsanfragen, Anfragen, etc.)
- Currency formatted as EUR
- Dates formatted as dd.MM.yyyy

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 2da340a | Server action for fetching salary inquiries |
| 2 | 451ea34 | Admin dashboard with expandable table |

## Files Created

**Server Action (78 lines):**
- `apps/api/app/actions/inquiries.ts` - `getInquiries()` with date range and tariff filters, returns typed `InquiryRow[]`

**Admin Dashboard (3 files, 503 lines):**
- `apps/api/app/(admin)/inquiries/page.tsx` - Server component page, fetches initial data
- `apps/api/app/(admin)/inquiries/InquiryTable.tsx` - Client component with filters, expandable rows
- `apps/api/app/(admin)/inquiries/InquiryDetail.tsx` - Detail view showing full tax breakdown in 2-column grid

**User Setup Documentation:**
- `.planning/phases/07-conversation-persistence/07-USER-SETUP.md` - SQL commands for email column and RLS policy

## Files Modified

- `apps/api/app/(admin)/layout.tsx` - Added "Anfragen" navigation link

## Decisions Made

**1. Server action pattern for data fetching**
- Decision: Use `getInquiries()` server action instead of `/api/inquiries` route
- Rationale: Consistent with existing `documents.ts` pattern, simpler auth (uses session cookie automatically)
- Impact: All admin data fetching follows same pattern

**2. Manual refresh instead of realtime**
- Decision: "Aktualisieren" button triggers manual refresh
- Rationale: Historical inquiry data doesn't need realtime updates
- Impact: Simpler code, no WebSocket overhead, adequate for admin use case

**3. Show email column even when null**
- Decision: Email column always visible, shows "-" for null values
- Rationale: Signals that email capture is coming (Plan 03), prepares UI in advance
- Impact: Users understand email field is expected

**4. Expandable rows instead of modal/drawer**
- Decision: Detail view renders inline below expanded row
- Rationale: Faster interaction (no modal open/close), multiple rows can be expanded simultaneously
- Impact: Better UX for comparing inquiries

## Deviations from Plan

**Auto-fixed Issues:**

**1. [Rule 1 - Bug] TypeScript optional chaining for taxes/socialSecurity**
- **Found during:** Task 2, initial build
- **Issue:** `taxes` and `socialSecurity` typed as `{}`, accessing properties caused TypeScript error
- **Fix:** Changed from `|| {}` to allowing `undefined`, added optional chaining (`taxes?.lohnsteuer`)
- **Files modified:** `InquiryDetail.tsx`
- **Commit:** 451ea34

## Issues Encountered

None. TypeScript error resolved immediately with optional chaining.

## User Setup Required

**DB Schema Changes (documented in 07-USER-SETUP.md):**

1. Add email column:
   ```sql
   ALTER TABLE salary_inquiries ADD COLUMN IF NOT EXISTS email TEXT;
   ```

2. Add RLS policy for authenticated read access:
   ```sql
   CREATE POLICY "allow_authenticated_read" ON salary_inquiries FOR SELECT TO authenticated USING (true);
   ```

**Why needed:**
- Email column: Plan 03 will populate this field when users provide email
- RLS policy: Dashboard uses authenticated Supabase client (not service role), requires SELECT policy

**Current state:**
- Chat route uses service role (bypasses RLS) when inserting inquiries
- Dashboard needs RLS policy to fetch with authenticated client
- Without policy, dashboard will return empty even if data exists

**Verification:**
- After applying SQL: Dashboard should load without errors at `/inquiries`
- Empty table is expected if no inquiries submitted yet

## Next Phase Readiness

**Blockers:** None

**Dependencies:**
- Plan 07-03 will populate email field via DOI consent flow
- Plan 07-04 will use similar patterns for export functionality

**Concerns:**
- Email column nullable by design (users may decline to provide email)
- RLS policy grants read access to all authenticated users (may need stricter policy if multiple admin roles exist)

**Recommended next steps:**
1. User applies DB changes (email column + RLS policy)
2. Execute Plan 07-03 to capture email during chat flow
3. Execute Plan 07-04 to add progress indicator
4. Execute Plan 07-05 for email export functionality

---

**Plan Status:** ✅ Complete
**Verification:** Build passed, routes render, TypeScript compiles
**Handoff:** USER-SETUP.md created for DB changes
