-- ============================================
-- RLS RESET MIGRATION
-- Drops ALL existing policies and recreates them cleanly
-- ============================================

-- ============================================
-- PHASE 1: DROP ALL EXISTING POLICIES
-- ============================================

-- profiles
DROP POLICY IF EXISTS "Users can read their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON profiles;
DROP POLICY IF EXISTS "Global Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can read all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;

-- projects
DROP POLICY IF EXISTS "Users can view projects" ON projects;
DROP POLICY IF EXISTS "Users can view their projects" ON projects;
DROP POLICY IF EXISTS "Members can view projects" ON projects;
DROP POLICY IF EXISTS "Users can create projects" ON projects;
DROP POLICY IF EXISTS "Anyone can create projects" ON projects;
DROP POLICY IF EXISTS "Admins can update projects" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;

-- project_users
DROP POLICY IF EXISTS "Users can view their own project memberships" ON project_users;
DROP POLICY IF EXISTS "Users can view own memberships" ON project_users;
DROP POLICY IF EXISTS "Users can add themselves as owner" ON project_users;
DROP POLICY IF EXISTS "Users can add self as admin on new project" ON project_users;
DROP POLICY IF EXISTS "Admins can view project members" ON project_users;
DROP POLICY IF EXISTS "Admins can add project members" ON project_users;
DROP POLICY IF EXISTS "Admins can update project members" ON project_users;
DROP POLICY IF EXISTS "Admins can update members" ON project_users;
DROP POLICY IF EXISTS "Admins can delete project members" ON project_users;
DROP POLICY IF EXISTS "Admins can remove members" ON project_users;

-- documents
DROP POLICY IF EXISTS "Users can read documents" ON documents;
DROP POLICY IF EXISTS "Enable read access for all users" ON documents;
DROP POLICY IF EXISTS "Users can view documents" ON documents;
DROP POLICY IF EXISTS "Users can insert documents" ON documents;
DROP POLICY IF EXISTS "Users can delete documents" ON documents;
DROP POLICY IF EXISTS "Users can update documents" ON documents;

-- document_chunks
DROP POLICY IF EXISTS "Users can read document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can view chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can view chunks of accessible documents" ON document_chunks;
DROP POLICY IF EXISTS "Users can insert document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can insert chunks for accessible documents" ON document_chunks;
DROP POLICY IF EXISTS "Admins can insert chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete document chunks" ON document_chunks;
DROP POLICY IF EXISTS "Users can delete chunks of accessible documents" ON document_chunks;
DROP POLICY IF EXISTS "Admins can delete chunks" ON document_chunks;

-- request_logs
DROP POLICY IF EXISTS "Users can view logs for their projects" ON request_logs;
DROP POLICY IF EXISTS "Users can view own project logs" ON request_logs;

-- salary_inquiries
DROP POLICY IF EXISTS "Users can view inquiries for their projects" ON salary_inquiries;
DROP POLICY IF EXISTS "Users can view own project inquiries" ON salary_inquiries;

-- storage.objects (project-files bucket)
DROP POLICY IF EXISTS "Upload files" ON storage.objects;
DROP POLICY IF EXISTS "View files" ON storage.objects;
DROP POLICY IF EXISTS "Delete files" ON storage.objects;


-- ============================================
-- PHASE 2: RECREATE HELPER FUNCTIONS
-- ============================================

-- Drop existing functions to allow parameter name changes
DROP FUNCTION IF EXISTS is_global_admin() CASCADE;
DROP FUNCTION IF EXISTS has_project_role(uuid, text[]) CASCADE;
DROP FUNCTION IF EXISTS is_project_member(uuid) CASCADE;

-- DROP first to allow parameter name changes
DROP FUNCTION IF EXISTS has_project_role(uuid, text[]) CASCADE;
DROP FUNCTION IF EXISTS is_project_member(uuid) CASCADE;
DROP FUNCTION IF EXISTS is_global_admin() CASCADE;

-- is_global_admin: Check if current user is a global admin
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_admin = true
  )
$$;

-- has_project_role: Check if user has specific role(s) in a project
CREATE OR REPLACE FUNCTION has_project_role(p_project_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
    AND role = ANY(p_roles)
  )
$$;

-- is_project_member: Check if user is any member of project
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
  )
$$;

-- ============================================
-- PHASE 3: CREATE NEW POLICIES
-- ============================================

-- ----------------------------------------
-- 3.1 profiles
-- ----------------------------------------
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Admins can read all profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (is_global_admin());

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- ----------------------------------------
-- 3.2 projects
-- ----------------------------------------
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view projects"
  ON projects FOR SELECT
  TO authenticated
  USING (
    is_project_member(id)
    OR is_global_admin()
  );

CREATE POLICY "Anyone can create projects"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admins can update projects"
  ON projects FOR UPDATE
  TO authenticated
  USING (
    has_project_role(id, ARRAY['admin'])
    OR is_global_admin()
  )
  WITH CHECK (
    has_project_role(id, ARRAY['admin'])
    OR is_global_admin()
  );

CREATE POLICY "Admins can delete projects"
  ON projects FOR DELETE
  TO authenticated
  USING (
    has_project_role(id, ARRAY['admin'])
    OR is_global_admin()
  );

-- ----------------------------------------
-- 3.3 project_users
-- ----------------------------------------
ALTER TABLE project_users ENABLE ROW LEVEL SECURITY;

-- Users see their own memberships
CREATE POLICY "Users can view own memberships"
  ON project_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins see all members of their projects
CREATE POLICY "Admins can view project members"
  ON project_users FOR SELECT
  TO authenticated
  USING (
    has_project_role(project_id, ARRAY['admin'])
    OR is_global_admin()
  );

-- Project creator becomes admin (via trigger, but policy allows)
CREATE POLICY "Users can add self as admin on new project"
  ON project_users FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR has_project_role(project_id, ARRAY['admin'])
    OR is_global_admin()
  );

-- Only admins can change roles
CREATE POLICY "Admins can update members"
  ON project_users FOR UPDATE
  TO authenticated
  USING (
    has_project_role(project_id, ARRAY['admin'])
    OR is_global_admin()
  )
  WITH CHECK (
    has_project_role(project_id, ARRAY['admin'])
    OR is_global_admin()
  );

-- Only admins can remove members
CREATE POLICY "Admins can remove members"
  ON project_users FOR DELETE
  TO authenticated
  USING (
    has_project_role(project_id, ARRAY['admin'])
    OR is_global_admin()
  );

-- ----------------------------------------
-- 3.4 documents
-- ----------------------------------------
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Global docs visible to all, project docs to members
CREATE POLICY "Users can view documents"
  ON documents FOR SELECT
  TO authenticated
  USING (
    project_id IS NULL  -- global docs
    OR is_project_member(project_id)
    OR is_global_admin()
  );

-- Global docs: only admins. Project docs: admin/editor
CREATE POLICY "Users can insert documents"
  ON documents FOR INSERT
  TO authenticated
  WITH CHECK (
    (project_id IS NULL AND is_global_admin())
    OR (project_id IS NOT NULL AND has_project_role(project_id, ARRAY['admin', 'editor']))
    OR is_global_admin()
  );

-- Allow status updates (for edge function via service role, and admins)
CREATE POLICY "Users can update documents"
  ON documents FOR UPDATE
  TO authenticated
  USING (
    (project_id IS NULL AND is_global_admin())
    OR (project_id IS NOT NULL AND has_project_role(project_id, ARRAY['admin', 'editor']))
    OR is_global_admin()
  )
  WITH CHECK (
    (project_id IS NULL AND is_global_admin())
    OR (project_id IS NOT NULL AND has_project_role(project_id, ARRAY['admin', 'editor']))
    OR is_global_admin()
  );

-- Global docs: only admins. Project docs: admin/editor
CREATE POLICY "Users can delete documents"
  ON documents FOR DELETE
  TO authenticated
  USING (
    (project_id IS NULL AND is_global_admin())
    OR (project_id IS NOT NULL AND has_project_role(project_id, ARRAY['admin', 'editor']))
    OR is_global_admin()
  );

-- ----------------------------------------
-- 3.5 document_chunks
-- ----------------------------------------
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Chunks readable if parent document is readable
CREATE POLICY "Users can view chunks"
  ON document_chunks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM documents
      WHERE documents.id = document_chunks.document_id
      AND (
        documents.project_id IS NULL
        OR is_project_member(documents.project_id)
        OR is_global_admin()
      )
    )
  );

-- Chunks inserted by service role (edge function), but allow admins too
CREATE POLICY "Admins can insert chunks"
  ON document_chunks FOR INSERT
  TO authenticated
  WITH CHECK (
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

-- Chunks deleted via CASCADE from documents, but explicit policy for safety
CREATE POLICY "Admins can delete chunks"
  ON document_chunks FOR DELETE
  TO authenticated
  USING (
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

-- ----------------------------------------
-- 3.6 request_logs
-- ----------------------------------------
ALTER TABLE request_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project logs"
  ON request_logs FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.public_key = request_logs.public_key
      AND is_project_member(projects.id)
    )
    OR is_global_admin()
  );

-- ----------------------------------------
-- 3.7 salary_inquiries
-- ----------------------------------------
ALTER TABLE salary_inquiries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own project inquiries"
  ON salary_inquiries FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM projects
      WHERE projects.public_key = salary_inquiries.public_key
      AND is_project_member(projects.id)
    )
    OR is_global_admin()
  );

-- ----------------------------------------
-- 3.8 storage.objects (project-files bucket)
-- ----------------------------------------

-- VIEW: Global folder for all, project folders for members
CREATE POLICY "View files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      -- Global folder readable by all authenticated users
      (storage.foldername(name))[1] = 'global'
      -- Project folder readable by members
      OR (
        (storage.foldername(name))[1] != 'global'
        AND is_project_member(((storage.foldername(name))[1])::uuid)
      )
      -- Global admin sees all
      OR is_global_admin()
    )
  );

-- INSERT: Global folder only for admins, project folders for admin/editor
CREATE POLICY "Upload files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'project-files'
    AND (
      -- Global folder: only global admins
      ((storage.foldername(name))[1] = 'global' AND is_global_admin())
      -- Project folder: admin/editor
      OR (
        (storage.foldername(name))[1] != 'global'
        AND has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['admin', 'editor'])
      )
      -- Global admin can upload anywhere
      OR is_global_admin()
    )
  );

-- DELETE: Global folder only for admins, project folders for admin/editor
-- FIXED: Check for 'global' BEFORE attempting uuid cast
CREATE POLICY "Delete files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'project-files'
    AND (
      -- Global admin can delete anything
      is_global_admin()
      -- Global folder: only global admins (redundant but explicit)
      OR ((storage.foldername(name))[1] = 'global' AND is_global_admin())
      -- Project folder: admin/editor (only when NOT global to avoid uuid cast error)
      OR (
        (storage.foldername(name))[1] != 'global'
        AND has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['admin', 'editor'])
      )
    )
  );

-- ============================================
-- PHASE 4: GRANT PERMISSIONS
-- ============================================

-- Ensure authenticated users can use the helper functions
GRANT EXECUTE ON FUNCTION is_global_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION has_project_role(UUID, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION is_project_member(UUID) TO authenticated;
