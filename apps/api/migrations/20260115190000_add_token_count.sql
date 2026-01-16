-- Add token_count column to document_chunks table
alter table document_chunks 
add column if not exists token_count integer;

comment on column document_chunks.token_count is 'Approximate token count of the chunk content';
