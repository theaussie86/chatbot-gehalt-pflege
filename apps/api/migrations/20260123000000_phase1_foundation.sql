-- ============================================
-- PHASE 1 FOUNDATION MIGRATION
-- Fixes P0-blocking issues identified in research
-- ============================================
--
-- Purpose: Fix RLS policies and schema to unblock edge function
--
-- Fixes:
-- - DB-02: Service role INSERT blocked by auth.uid() checks in RLS policies
-- - DB-03: Missing error_details JSONB column for structured error storage
-- - DB-01: Cascade delete verified (already configured in 20260115120000)
--
-- Context: Edge function uses service role key but has NULL auth.uid(),
-- causing INSERT policies with auth.uid() checks to fail silently.
-- ============================================

-- ============================================
-- FIX DB-02: Service Role INSERT Policy
-- ============================================

-- Drop the existing restrictive INSERT policy
DROP POLICY IF EXISTS "Admins can insert chunks" ON document_chunks;

-- Create new policy that explicitly allows service role
-- Service role is used by edge function to insert chunks after processing
CREATE POLICY "Service role and admins can insert chunks"
  ON document_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
    -- Service role always allowed (edge function uses service role key)
    auth.jwt()->>'role' = 'service_role'
    OR
    -- User permission checks (existing logic for admin/editor roles)
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND (
        (documents.project_id IS NULL AND is_global_admin())
        OR (documents.project_id IS NOT NULL AND has_project_role(documents.project_id, ARRAY['admin', 'editor']))
        OR is_global_admin()
      )
    )
  );

-- ============================================
-- FIX DB-03: Add error_details Column
-- ============================================

-- Add JSONB column for structured error information
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS error_details JSONB;

-- Document the expected structure
COMMENT ON COLUMN documents.error_details IS
  'Structured error information: {code: string, message: string, timestamp: string, details?: any}';

-- ============================================
-- VERIFY DB-01: Cascade Delete Configuration
-- ============================================

-- DB-01: Cascade delete verified - defined in 20260115120000_init_rag_pipeline.sql line 59
-- The foreign key constraint:
--   document_chunks.document_id references documents(id) ON DELETE CASCADE
--
-- This ensures that when a document is deleted, all associated chunks are
-- automatically removed. No schema change needed.
--
-- Verification: See apps/api/migrations/phase1_verification.sql
