-- Function for semantic search with project-based filtering
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  metadata jsonb
)
LANGUAGE sql STABLE
AS $$
  SELECT
    de.id,
    de.content,
    1 - (de.embedding <=> query_embedding) as similarity,
    de.metadata
  FROM document_embeddings de
  JOIN documents d ON de.document_id = d.id
  WHERE
    -- Cosine similarity threshold check
    1 - (de.embedding <=> query_embedding) > match_threshold
    -- Project-based filtering: match documents for this project or user's shared documents
    AND (
      d.project_id = filter_project_id
      OR d.user_id IN (
        SELECT user_id FROM projects WHERE id = filter_project_id
      )
    )
  ORDER BY de.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Helper function to get embedding statistics (useful for monitoring)
CREATE OR REPLACE FUNCTION get_embedding_stats()
RETURNS TABLE (
  total_embeddings bigint,
  unique_documents bigint,
  avg_content_length numeric,
  oldest_embedding timestamptz,
  newest_embedding timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT
    COUNT(*) as total_embeddings,
    COUNT(DISTINCT document_id) as unique_documents,
    AVG(LENGTH(content)) as avg_content_length,
    MIN(created_at) as oldest_embedding,
    MAX(created_at) as newest_embedding
  FROM document_embeddings;
$$;
