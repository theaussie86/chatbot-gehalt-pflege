-- Migration: Add page number tracking to document chunks
-- Purpose: Enable citation quality by storing page boundaries during text extraction
-- Phase: 11-citation-quality-enhancement

-- ================================================================
-- 1. Add page columns to document_chunks table
-- ================================================================

-- page_start: Starting page number (nullable, null means page data unknown)
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS page_start INTEGER;

COMMENT ON COLUMN document_chunks.page_start IS 'Starting page number of this chunk (null if page extraction failed or not applicable)';

-- page_end: Ending page number (nullable, null or same as page_start for single page chunks)
ALTER TABLE document_chunks
ADD COLUMN IF NOT EXISTS page_end INTEGER;

COMMENT ON COLUMN document_chunks.page_end IS 'Ending page number if chunk spans multiple pages (null or same as page_start for single page)';

-- ================================================================
-- 2. Add page data flag to documents table
-- ================================================================

-- has_page_data: Flag indicating if page extraction succeeded
-- NULL = not yet processed with page extraction
-- TRUE = page data successfully extracted
-- FALSE = page extraction failed (fallback to chunk-only mode)
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS has_page_data BOOLEAN DEFAULT NULL;

COMMENT ON COLUMN documents.has_page_data IS 'Page extraction status: NULL=not processed, TRUE=success, FALSE=failed';

-- ================================================================
-- 3. Update match_documents_with_metadata function to return page data
-- ================================================================

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
  chunk_index integer,
  page_start integer,
  page_end integer
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
    dc.chunk_index,
    dc.page_start,
    dc.page_end
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND d.project_id = filter_project_id
    AND d.status = 'embedded'
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- ================================================================
-- 4. Update match_documents_global function to return page data
-- ================================================================

CREATE OR REPLACE FUNCTION match_documents_global(
  query_embedding vector(768),
  match_threshold float,
  match_count int
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float,
  document_id uuid,
  filename text,
  chunk_index integer,
  page_start integer,
  page_end integer
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
    dc.chunk_index,
    dc.page_start,
    dc.page_end
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    AND d.status = 'embedded'
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
