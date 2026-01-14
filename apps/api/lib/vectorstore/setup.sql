-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create embeddings table for semantic search
CREATE TABLE IF NOT EXISTS document_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(768), -- Gemini text-embedding-004 dimension
  metadata jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create index for similarity search using IVFFlat
-- Note: You may want to tune lists parameter based on your dataset size
-- Rule of thumb: lists = rows / 1000 for datasets < 1M rows
CREATE INDEX IF NOT EXISTS document_embeddings_embedding_idx
ON document_embeddings
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create index on document_id for faster joins
CREATE INDEX IF NOT EXISTS idx_document_embeddings_document_id
ON document_embeddings(document_id);

-- Create index on created_at for time-based queries
CREATE INDEX IF NOT EXISTS idx_document_embeddings_created_at
ON document_embeddings(created_at DESC);
