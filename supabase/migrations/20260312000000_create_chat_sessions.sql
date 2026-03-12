-- Migration: Create chat_sessions table for server-side session state management
-- Replaces client-side formState passing with persistent server-side storage

-- =============================================================================
-- 1. Create chat_sessions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id text UNIQUE NOT NULL,
  project_id text NOT NULL,
  form_state jsonb NOT NULL DEFAULT '{
    "section": "job_details",
    "data": {"job_details": {}, "tax_details": {}},
    "missingFields": ["tarif", "group", "experience", "hours", "state"]
  }'::jsonb,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '7 days'
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS chat_sessions_session_id_idx ON chat_sessions (session_id);
CREATE INDEX IF NOT EXISTS chat_sessions_expires_at_idx ON chat_sessions (expires_at);
CREATE INDEX IF NOT EXISTS chat_sessions_project_id_idx ON chat_sessions (project_id);

-- =============================================================================
-- 3. Comments on table and columns
-- =============================================================================
COMMENT ON TABLE chat_sessions IS
  'Server-side storage for chat session state. Replaces client-side formState passing. Sessions expire after 7 days of inactivity.';

COMMENT ON COLUMN chat_sessions.session_id IS
  'Client-provided unique identifier for the session (e.g. UUID generated in the browser widget).';

COMMENT ON COLUMN chat_sessions.project_id IS
  'References the project this session belongs to. Used for per-project configuration and analytics.';

COMMENT ON COLUMN chat_sessions.form_state IS
  'Current state of the salary interview form as a JSON object, including section, collected data, and remaining missing fields.';

COMMENT ON COLUMN chat_sessions.messages IS
  'Ordered array of chat messages (role + content) representing the full conversation history for this session.';

COMMENT ON COLUMN chat_sessions.expires_at IS
  'Timestamp after which the session is eligible for automated cleanup. Extended by 7 days on each update.';

-- =============================================================================
-- 4. Enable pg_cron extension
-- =============================================================================
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- =============================================================================
-- 5. Schedule daily cleanup of expired sessions at 03:00 UTC
-- =============================================================================
SELECT cron.schedule(
  'cleanup-expired-chat-sessions',
  '0 3 * * *',
  $$DELETE FROM public.chat_sessions WHERE expires_at < now()$$
);

-- =============================================================================
-- 6. RPC function for atomic message append + form_state update
-- =============================================================================
CREATE OR REPLACE FUNCTION append_chat_messages(
  p_session_id text,
  p_form_state jsonb,
  p_new_messages jsonb
) RETURNS void AS $$
BEGIN
  UPDATE chat_sessions
  SET
    form_state = p_form_state,
    messages = messages || p_new_messages,
    updated_at = now(),
    expires_at = now() + interval '7 days'
  WHERE session_id = p_session_id;
END;
$$ LANGUAGE plpgsql;
