-- Run this in your Supabase SQL Editor to create the missing table

create table if not exists salary_inquiries (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  public_key text,
  gruppe text,
  stufe integer,
  tarif text,
  jahr text,
  brutto numeric,
  netto numeric,
  details jsonb
);

create index if not exists salary_inquiries_created_at_idx on salary_inquiries(created_at);
create index if not exists salary_inquiries_public_key_idx on salary_inquiries(public_key);

alter table salary_inquiries enable row level security;

-- Policy: Users can view inquiries for their own projects
create policy "Users can view inquiries for their projects"
  on salary_inquiries
  for select
  using (
    public_key in (
      select public_key from projects where user_id = auth.uid()
    )
  );
