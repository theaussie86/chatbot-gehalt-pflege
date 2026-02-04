---
created: 2026-02-04T09:30
title: Save salary inquiry data progressively during chat
area: api
files:
  - apps/api/app/api/chat/route.ts:139-710
  - apps/api/app/actions/inquiries.ts
---

## Problem

Currently, salary inquiry data is only saved to the database at the very end of the conversation when the user confirms in the `summary` state and the calculation completes (route.ts:390-408).

If a user provides information (tarif, experience, hours, state, tax details) but abandons the chat before completing the calculation, all collected data is lost. This means:

1. No analytics on partial conversations
2. Can't resume abandoned chats
3. No visibility into where users drop off
4. Wasted user effort if they need to start over

The formState data flows through the chat but only lives in client-side memory (localStorage via conversation persistence) and is never persisted server-side until final calculation.

## Solution

Implement progressive saving of salary inquiry data as users provide information:

**Option A: Save/update on each chat turn**
- Create/update a draft `salary_inquiry` row when first data field is extracted
- Add a `status` column (draft/completed) to distinguish partial from final entries
- Update the row as more fields come in
- Mark as `completed` when calculation finalizes

**Option B: Save on section transitions**
- Save when transitioning from `job_details` → `tax_details`
- Save again when transitioning to `summary`
- Final save on completion

**Considerations:**
- Need to track session/conversation ID to update same row
- May need new `session_id` column in salary_inquiries
- RLS implications for anonymous users
- Storage costs for abandoned drafts (cleanup job?)
