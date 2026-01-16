-- 1. Create document_status enum
create type document_status as enum ('pending', 'processing', 'embedded', 'error');

-- 2. Add status column to documents
alter table documents 
add column if not exists status document_status default 'pending' not null;

-- 3. Backfill existing documents
-- User requested backfill to 'pending'
update documents set status = 'pending';

-- 4. Enable RLS on document_chunks (if not already enabled)
alter table document_chunks enable row level security;

-- 5. Add RLS policies for document_chunks

-- Helper: Check if user has access to the parent document
-- Since we don't have direct project_id or user_id on chunks (only document_id),
-- we need to join with documents table.

-- Policy: Users can view chunks if they can view the parent document
drop policy if exists "Users can view chunks of accessible documents" on document_chunks;
create policy "Users can view chunks of accessible documents"
  on document_chunks for select
  using (
    exists (
      select 1 from documents
      where documents.id = document_chunks.document_id
      -- The 'documents' table RLS will handle the check implicitly if we select from it?
      -- No, we need to replicate the logic or rely on the fact that if we can SELECT the document, we can see chunks.
      -- Replicating the logic from 'Users can read documents':
      and (
        documents.project_id is null -- Global
        or exists (
            select 1 from project_users 
            where project_users.project_id = documents.project_id 
            and project_users.user_id = auth.uid()
        ) -- Project Member
        or exists (select 1 from profiles where id = auth.uid() and is_admin = true) -- Global Admin
      )
    )
  );

-- Policy: Users can insert chunks if they can insert/update the parent document
-- Effectively whoever can reprocess/upload the document
drop policy if exists "Users can insert chunks for accessible documents" on document_chunks;
create policy "Users can insert chunks for accessible documents"
  on document_chunks for insert
  with check (
    exists (
      select 1 from documents
      where documents.id = document_chunks.document_id
      and (
        documents.project_id is null -- Global uploads allowed by anyone (or restricted by doc policy)
        or exists (
            select 1 from project_users 
            where project_users.project_id = documents.project_id 
            and project_users.user_id = auth.uid()
            and role in ('admin', 'editor')
        ) -- Project Admin/Editor
        or exists (select 1 from profiles where id = auth.uid() and is_admin = true) -- Global Admin
      )
    )
  );

-- Policy: Users can delete chunks if they can delete/update the parent document
drop policy if exists "Users can delete chunks of accessible documents" on document_chunks;
create policy "Users can delete chunks of accessible documents"
  on document_chunks for delete
  using (
    exists (
      select 1 from documents
      where documents.id = document_chunks.document_id
      and (
        (documents.project_id is null and exists (select 1 from profiles where id = auth.uid() and is_admin = true)) -- Global Doc deletion restricted
        or exists (
            select 1 from project_users 
            where project_users.project_id = documents.project_id 
            and project_users.user_id = auth.uid()
            and role in ('admin', 'editor')
        ) -- Project Admin/Editor
        or exists (select 1 from profiles where id = auth.uid() and is_admin = true) -- Global Admin
      )
    )
  );
