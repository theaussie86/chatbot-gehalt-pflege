-- Drop redundant columns from documents
alter table documents drop column if exists google_file_uri;
alter table documents drop column if exists google_file_name;
alter table documents drop column if exists content;
alter table documents drop column if exists embedding;

-- Enable RLS on document_chunks
alter table document_chunks enable row level security;

-- Policies for document_chunks (Validating via parent document)

-- SELECT: Same as documents (Global OR Member OR Admin)
create policy "Users can read document chunks"
  on document_chunks for select
  using (
    exists (
      select 1 from documents
      where documents.id = document_chunks.document_id
      and (
        documents.project_id is null
        or exists (select 1 from project_users where project_users.project_id = documents.project_id and project_users.user_id = auth.uid())
        or is_global_admin()
      )
    )
  );

-- INSERT: Same as documents (Global OR Admin/Editor OR Admin)
create policy "Users can insert document chunks"
  on document_chunks for insert
  with check (
    exists (
      select 1 from documents
      where documents.id = document_id
      and (
        documents.project_id is null
        or exists (select 1 from project_users where project_users.project_id = documents.project_id and project_users.user_id = auth.uid() and role in ('admin', 'editor'))
        or is_global_admin()
      )
    )
  );

-- DELETE: Same as documents (Global Admin Only for Global, else Admin/Editor or Global Admin)
create policy "Users can delete document chunks"
  on document_chunks for delete
  using (
    exists (
      select 1 from documents
      where documents.id = document_chunks.document_id
      and (
        (documents.project_id is null and is_global_admin())
        or exists (select 1 from project_users where project_users.project_id = documents.project_id and project_users.user_id = auth.uid() and role in ('admin', 'editor'))
        or is_global_admin()
      )
    )
  );
