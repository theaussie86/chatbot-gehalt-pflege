-- Enhanced search function that returns document metadata for citation attribution
-- This allows the chatbot to cite which document provided the answer

CREATE OR REPLACE FUNCTION match_documents_with_metadata(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  filename text,
  chunk_index integer
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity,
    dc.document_id,
    d.filename,
    dc.chunk_index
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND d.project_id = filter_project_id
    AND d.status = 'embedded'
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
