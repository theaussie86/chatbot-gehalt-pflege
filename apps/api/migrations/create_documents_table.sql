
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  project_id uuid references projects(id) on delete cascade, -- Nullable for global docs. on delete cascade ensures cleanup.
  user_id uuid references auth.users(id), -- For RLS ownership
  filename text not null,
  mime_type text,
  google_file_uri text not null, -- content_uri from Google File API
  google_file_name text not null -- name from Google File API (e.g. files/xxxxx)
);

create index if not exists documents_project_id_idx on documents(project_id);
create index if not exists documents_user_id_idx on documents(user_id);

alter table documents enable row level security;

-- Policy: Users can manage their own documents
create policy "Users can manage their own documents"
  on documents
  for all
  using (auth.uid() = user_id);
