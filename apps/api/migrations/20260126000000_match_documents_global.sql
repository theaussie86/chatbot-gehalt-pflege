-- Global document search function (no project filter)
-- Searches across ALL documents in the database

create or replace function match_documents_global (
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
returns table (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  chunk_index int,
  filename text,
  project_id uuid,
  project_name text
)
language plpgsql
as $$
begin
  return query
  select
    document_chunks.id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity,
    document_chunks.document_id,
    document_chunks.chunk_index,
    documents.filename,
    documents.project_id,
    projects.name as project_name
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  left join projects on projects.id = documents.project_id
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;
