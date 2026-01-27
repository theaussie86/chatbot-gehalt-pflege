# User Setup Required: Phase 07 (Plans 02 & 03)

This file contains all required user setup tasks for Phase 7 (Conversation Persistence).

---

## Plan 07-02: Admin Inquiry Dashboard

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

- The email column will be NULL for existing records (populated by Plan 03)
- The RLS policy allows any authenticated user to read inquiries (adjust if stricter access control is needed)
- The chat route currently uses service role (bypasses RLS) when inserting inquiries

---

## Plan 07-03: Email Export with DOI Consent

**Service:** Resend (Email Provider)
**Why:** Sending formatted result emails to users after DOI consent

### Required Tasks

#### Task 1: Create Resend account and API key

**Location:** https://resend.com

**Steps:**
1. Create account at resend.com
2. Navigate to: Dashboard → API Keys
3. Click "Create API Key"
4. Copy the API key (starts with `re_`)

**Add to environment:**
```bash
# In your .env.local file (apps/api/.env.local)
RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**Purpose:** Enable the `/api/email-export` endpoint to send emails via Resend.

---

#### Task 2: Configure sender domain (for production)

**Location:** Resend Dashboard → Domains

**For Testing:**
- The code is already configured to use `onboarding@resend.dev`
- This works immediately without domain verification
- Limited to 100 emails per day

**For Production:**
1. Add your domain in Resend Dashboard → Domains
2. Add the DNS records Resend provides to your domain's DNS settings
3. Wait for verification (usually 5-15 minutes)
4. Update the "from" address in `apps/api/app/api/email-export/route.ts`:
   ```typescript
   from: 'Pflege Gehalt Chatbot <noreply@yourdomain.com>',
   ```

**Purpose:** Send emails from your own domain for better deliverability and branding.

---

### Verification

After configuring Resend:

1. Restart the API server: `npm run dev:api`
2. Complete a salary calculation in the widget
3. Enter your email in the DOI consent form
4. Check the consent checkbox
5. Click "Ergebnis per E-Mail senden"
6. Check your email inbox for the formatted salary calculation

**If email doesn't arrive:**
- Check Resend Dashboard → Logs to see if the email was sent
- Check your spam folder
- Verify `RESEND_API_KEY` is set correctly in `.env.local`
- Check the API server logs for any errors

---

### Notes

- Free tier: 3,000 emails per month, 100 emails per day
- Email template is in `apps/api/lib/emailTemplate.ts`
- Rate limit: 5 email exports per IP per 60 seconds (prevents spam)
- If `RESEND_API_KEY` is not set, the endpoint returns a 503 error with "Email service not configured"
