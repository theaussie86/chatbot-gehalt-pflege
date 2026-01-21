-- Enable the pg_net extension to make HTTP requests
create extension if not exists pg_net;

-- Create the function that triggers the Edge Function
-- REPLACE <PROJECT_REF> and <ANON_KEY> with your actual project values
create or replace function public.trigger_process_embeddings()
returns trigger as $$
declare
  -- You can find your Project Ref in the Supabase Dashboard URL: app.supabase.com/project/<PROJECT_REF>
  project_url text := 'https://xjbkpfbiajcjkamvlrhw.supabase.co/functions/v1/process-embeddings';
  service_role_key text := 'sb_secret_9Gvdl8v5ABeJ8a2EIqfYiQ_jQ5jAHxH'; -- Use Service Role key to bypass RLS if needed, or Anon key
begin
  perform net.http_post(
    url := project_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || service_role_key
    ),
    body := jsonb_build_object(
      'type', TG_OP,
      'table', TG_TABLE_NAME,
      'schema', TG_TABLE_SCHEMA,
      'record', row_to_json(NEW)
    )
  );
  return NEW;
end;
$$ language plpgsql security definer;

-- Create the trigger
drop trigger if exists on_document_created_process_embeddings on public.documents;

create trigger on_document_created_process_embeddings
after insert on public.documents
for each row
when (NEW.status = 'pending')
execute function public.trigger_process_embeddings();
