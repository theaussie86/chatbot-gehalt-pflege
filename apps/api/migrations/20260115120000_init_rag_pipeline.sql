-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Create Storage Bucket and Policies
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-files', 'project-files', false, 52428800, '{"application/pdf"}')
on conflict (id) do nothing;

create policy "Users can upload their own project files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can view their own project files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Users can delete their own project files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-files' AND
  (storage.foldername(name))[1] = auth.uid()::text
);

-- 3. Create Documents Table
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  project_id uuid references projects(id) on delete cascade,
  user_id uuid references auth.users(id),
  filename text not null,
  mime_type text,
  storage_path text, -- Path in Supabase Storage
  google_file_uri text not null, -- Kept for compatibility/ephemeral tracking
  google_file_name text not null
);

create index if not exists documents_project_id_idx on documents(project_id);
create index if not exists documents_user_id_idx on documents(user_id);

alter table documents enable row level security;

create policy "Users can manage their own documents"
  on documents
  for all
  using (auth.uid() = user_id);

-- 4. Create Document Chunks Table
create table if not exists document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  chunk_index integer not null,
  content text not null,
  embedding vector(768) not null
);

create index if not exists document_chunks_embedding_idx on document_chunks using hnsw (embedding vector_cosine_ops);
create index if not exists document_chunks_document_id_idx on document_chunks(document_id);

-- 5. Create Search Function
create or replace function match_documents (
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
returns table (
  id uuid,
  content text,
  similarity float,
  document_id uuid
)
language plpgsql
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity,
    document_chunks.document_id
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  and documents.project_id = filter_project_id
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
