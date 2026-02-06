-- Migration: Add session tracking for progressive salary inquiry persistence
-- This allows saving draft inquiries during the conversation so abandoned chats aren't lost

-- Add session_id column for linking multiple requests from same conversation
ALTER TABLE salary_inquiries ADD COLUMN IF NOT EXISTS session_id uuid;

-- Add status column for distinguishing drafts from completed inquiries
ALTER TABLE salary_inquiries ADD COLUMN IF NOT EXISTS status text DEFAULT 'draft';

-- Add last_section column to track where user dropped off
ALTER TABLE salary_inquiries ADD COLUMN IF NOT EXISTS last_section text;

-- Add index for efficient session lookups during upsert operations
CREATE INDEX IF NOT EXISTS salary_inquiries_session_id_idx ON salary_inquiries (session_id);

-- Add constraint to ensure status is valid
ALTER TABLE salary_inquiries DROP CONSTRAINT IF EXISTS salary_inquiries_status_check;
ALTER TABLE salary_inquiries ADD CONSTRAINT salary_inquiries_status_check
  CHECK (status IN ('draft', 'completed'));

-- Comment on columns for documentation
COMMENT ON COLUMN salary_inquiries.session_id IS 'UUID linking requests from same conversation session';
COMMENT ON COLUMN salary_inquiries.status IS 'draft = in-progress conversation, completed = calculation finished';
COMMENT ON COLUMN salary_inquiries.last_section IS 'Last interview section reached (job_details, tax_details, summary)';
