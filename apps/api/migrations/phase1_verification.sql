-- ============================================
-- PHASE 1 VERIFICATION SCRIPT
-- Manual testing queries to verify migration success
-- ============================================
--
-- IMPORTANT: This is NOT a migration file!
-- This contains manual verification queries to run AFTER applying
-- the 20260123000000_phase1_foundation.sql migration.
--
-- Run these queries in the Supabase SQL Editor to confirm all fixes work.
-- ============================================

-- ============================================
-- TEST DB-02: Service Role Can INSERT Chunks
-- ============================================

-- Verify you're connected with service role
-- (Run this with service role connection in SQL Editor)
SELECT
  current_user as postgres_user,
  session_user,
  auth.jwt()->>'role' as jwt_role,
  auth.uid() as auth_uid;
-- Expected when connected with service role key:
--   jwt_role = 'service_role'
--   auth_uid = NULL (this is the key issue we're fixing!)

-- Verify the new policy exists
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'document_chunks'
  AND policyname = 'Service role and admins can insert chunks';
-- Expected: 1 row showing the policy with service_role check

-- Test actual INSERT (requires a test document to exist)
-- First, create a test document as a global admin user:
-- (Run with authenticated user connection, not service role)
-- INSERT INTO documents (id, filename, storage_path, status, project_id)
-- VALUES ('00000000-0000-0000-0000-000000000099', 'test-service-role.pdf', 'test/path', 'processing', NULL)
-- ON CONFLICT (id) DO NOTHING;

-- Then, as service role, try to insert a chunk:
-- (Switch back to service role connection)
-- INSERT INTO document_chunks (document_id, chunk_index, content, embedding)
-- VALUES (
--   '00000000-0000-0000-0000-000000000099',
--   1,
--   'Test chunk content',
--   ARRAY[0.1, 0.2, ... ] -- 768 dimensions required
-- );
-- Expected: INSERT succeeds without RLS error

-- Clean up test data:
-- DELETE FROM documents WHERE id = '00000000-0000-0000-0000-000000000099';

-- ============================================
-- TEST DB-01: Cascade Delete Works
-- ============================================

-- Create test document with a unique ID
DO $$
DECLARE
  test_doc_id UUID := '00000000-0000-0000-0000-000000000001';
  test_chunk_id UUID;
BEGIN
  -- Step 1: Create test document (as admin or service role)
  INSERT INTO documents (id, filename, storage_path, status, project_id)
  VALUES (test_doc_id, 'cascade-test.pdf', 'test/cascade', 'pending', NULL)
  ON CONFLICT (id) DO NOTHING;

  -- Step 2: Create test chunk (as service role or admin)
  INSERT INTO document_chunks (id, document_id, chunk_index, content, embedding)
  VALUES (
    gen_random_uuid(),
    test_doc_id,
    1,
    'Test cascade delete content',
    array_fill(0, ARRAY[768])::vector(768)
  )
  RETURNING id INTO test_chunk_id;

  RAISE NOTICE 'Created test document % and chunk %', test_doc_id, test_chunk_id;
END $$;

-- Verify chunk exists
SELECT count(*) as chunks_before_delete
FROM document_chunks
WHERE document_id = '00000000-0000-0000-0000-000000000001';
-- Expected: 1

-- Delete the document
DELETE FROM documents
WHERE id = '00000000-0000-0000-0000-000000000001';

-- Verify chunk was automatically deleted (cascade worked)
SELECT count(*) as orphaned_chunks_after_delete
FROM document_chunks
WHERE document_id = '00000000-0000-0000-0000-000000000001';
-- Expected: 0 (no orphaned chunks)

-- Verify foreign key constraint configuration
SELECT
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name,
  rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
JOIN information_schema.referential_constraints AS rc
  ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
  AND tc.table_name = 'document_chunks'
  AND kcu.column_name = 'document_id';
-- Expected: delete_rule = 'CASCADE'

-- ============================================
-- TEST DB-03: error_details Column Exists
-- ============================================

-- Verify column exists and has correct type
SELECT
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'documents'
  AND column_name = 'error_details';
-- Expected: 1 row with data_type = 'jsonb', is_nullable = 'YES'

-- Test: Store structured error (requires existing document)
UPDATE documents
SET error_details = jsonb_build_object(
  'code', 'TEST_ERROR',
  'message', 'Test error message for verification',
  'timestamp', now()::text,
  'details', jsonb_build_object('test', true, 'line', 42)
)
WHERE id = (SELECT id FROM documents LIMIT 1);

-- Verify JSON structure can be queried
SELECT
  id,
  filename,
  error_details->>'code' as error_code,
  error_details->>'message' as error_message,
  error_details->>'timestamp' as error_timestamp,
  error_details->'details'->>'test' as detail_test
FROM documents
WHERE error_details IS NOT NULL
LIMIT 5;
-- Expected: Rows showing structured error data

-- Test: Clear error_details
UPDATE documents
SET error_details = NULL
WHERE error_details->>'code' = 'TEST_ERROR';

-- ============================================
-- SUMMARY CHECKS
-- ============================================

-- Verify all three fixes are in place
SELECT
  'DB-01: Cascade Delete' as requirement,
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.referential_constraints rc
      JOIN information_schema.table_constraints tc
        ON rc.constraint_name = tc.constraint_name
      WHERE tc.table_name = 'document_chunks'
        AND rc.delete_rule = 'CASCADE'
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END as status
UNION ALL
SELECT
  'DB-02: Service Role INSERT Policy',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'document_chunks'
        AND policyname = 'Service role and admins can insert chunks'
        AND with_check LIKE '%service_role%'
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END
UNION ALL
SELECT
  'DB-03: error_details Column',
  CASE
    WHEN EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents'
        AND column_name = 'error_details'
        AND data_type = 'jsonb'
    ) THEN '✓ PASS'
    ELSE '✗ FAIL'
  END;
-- Expected: All three show '✓ PASS'
