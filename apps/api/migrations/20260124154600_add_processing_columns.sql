-- Add processing_stage column to track where processing is
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS processing_stage text;

-- Add chunk_count column to store number of chunks created
ALTER TABLE documents
ADD COLUMN IF NOT EXISTS chunk_count integer;

-- Comment for documentation
COMMENT ON COLUMN documents.processing_stage IS 'Current processing stage: extracting_text, embedding, inserting, or null when complete';
COMMENT ON COLUMN documents.chunk_count IS 'Number of chunks created after successful embedding';
