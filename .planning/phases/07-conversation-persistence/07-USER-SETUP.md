# User Setup Required: Plan 07-02

**Service:** Supabase Database
**Why:** Admin inquiry dashboard requires DB schema changes and RLS policy

## Required Tasks

### Task 1: Add email column to salary_inquiries table

**Location:** Supabase Dashboard → SQL Editor

**Command:**
```sql
ALTER TABLE salary_inquiries ADD COLUMN IF NOT EXISTS email TEXT;
```

**Purpose:** Store user email addresses associated with salary inquiries (populated by Plan 03).

---

### Task 2: Add RLS policy for authenticated admin read access

**Location:** Supabase Dashboard → SQL Editor

**Command:**
```sql
CREATE POLICY "allow_authenticated_read" ON salary_inquiries FOR SELECT TO authenticated USING (true);
```

**Purpose:** Enable authenticated admins to view salary inquiries through the dashboard without using service role bypass.

---

## Verification

After applying these changes:

1. Log into the admin dashboard at `/inquiries`
2. Verify that the page loads without errors
3. If existing inquiries exist in the database, they should appear in the table
4. If the table is empty, this is expected (no inquiries submitted yet)

## Notes

- The email column will be NULL for existing records (populated by future Plan 03)
- The RLS policy allows any authenticated user to read inquiries (adjust if stricter access control is needed)
- The chat route currently uses service role (bypasses RLS) when inserting inquiries
