-- Enable Realtime for documents table
-- Run this in Supabase SQL Editor to enable live status updates

-- Add documents table to the realtime publication
ALTER PUBLICATION supabase_realtime ADD TABLE documents;

-- Verify it was added
SELECT * FROM pg_publication_tables WHERE pubname = 'supabase_realtime';
