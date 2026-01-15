-- 1. Create project_users table
create table if not exists project_users (
  id uuid default gen_random_uuid() primary key,
  project_id uuid references projects(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  role text not null check (role in ('owner', 'member')),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(project_id, user_id)
);

-- 2. Migrate existing project owners
insert into project_users (project_id, user_id, role)
select id, user_id, 'owner' from projects where user_id is not null
on conflict do nothing;

-- 3. Drop dependent policies first
drop policy if exists "Users can manage their own projects" on projects;
drop policy if exists "Users can view logs for their projects" on request_logs;
drop policy if exists "Users can view inquiries for their projects" on salary_inquiries;
drop policy if exists "Users can manage their own documents" on documents;

-- 4. Update Projects Table
-- Remove user_id as it's now in project_users
alter table projects drop column if exists user_id;

-- 5. Update Documents Table
-- Make project_id required
alter table documents alter column project_id set not null;

-- Remove user_id
alter table documents drop column if exists user_id;

-- Add storage_object_id
alter table documents add column if not exists storage_object_id uuid references storage.objects(id);

-- 6. RLS Policies

-- Enable RLS on project_users
alter table project_users enable row level security;

create policy "Users can view their own project memberships"
  on project_users for select
  using (auth.uid() = user_id);

create policy "Users can add themselves as owner"
  on project_users for insert
  with check (auth.uid() = user_id AND role = 'owner');

-- Projects Policies

create policy "Users can view projects they belong to"
  on projects for select
  using (exists (
    select 1 from project_users
    where project_users.project_id = projects.id
    and project_users.user_id = auth.uid()
  ));

create policy "Project owners can update their projects"
  on projects for update
  using (exists (
    select 1 from project_users
    where project_users.project_id = projects.id
    and project_users.user_id = auth.uid()
    and project_users.role = 'owner'
  ));

create policy "Users can create projects"
  on projects for insert
  with check (true);

create policy "Project owners can delete their projects"
  on projects for delete
  using (exists (
    select 1 from project_users
    where project_users.project_id = projects.id
    and project_users.user_id = auth.uid()
    and project_users.role = 'owner'
  ));

-- Trigger to automatically add creator as owner
create or replace function public.handle_new_project() 
returns trigger as $$
begin
  insert into public.project_users (project_id, user_id, role)
  values (new.id, auth.uid(), 'owner');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_project_created on projects;
create trigger on_project_created
  after insert on public.projects
  for each row execute procedure public.handle_new_project();


-- Documents Policies

create policy "Users can view documents in their projects"
  on documents for select
  using (exists (
    select 1 from project_users
    where project_users.project_id = documents.project_id
    and project_users.user_id = auth.uid()
  ));

create policy "Project members can insert documents"
  on documents for insert
  with check (exists (
    select 1 from project_users
    where project_users.project_id = documents.project_id
    and project_users.user_id = auth.uid()
  ));
  
create policy "Project members can delete documents"
  on documents for delete
  using (exists (
    select 1 from project_users
    where project_users.project_id = documents.project_id
    and project_users.user_id = auth.uid()
  ));

-- Request Logs Policies

create policy "Users can view logs for their projects"
  on request_logs for select
  using (
    public_key in (
      select p.public_key 
      from projects p
      join project_users pu on p.id = pu.project_id
      where pu.user_id = auth.uid()
    )
  );

-- Salary Inquiries Policies

create policy "Users can view inquiries for their projects"
  on salary_inquiries for select
  using (
    public_key in (
      select p.public_key 
      from projects p
      join project_users pu on p.id = pu.project_id
      where pu.user_id = auth.uid()
    )
  );
  
-- Storage Policies
drop policy if exists "Users can upload their own project files" on storage.objects;
drop policy if exists "Users can view their own project files" on storage.objects;
drop policy if exists "Users can delete their own project files" on storage.objects;

create policy "Project members can upload files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-files' AND
  exists (
    select 1 from project_users
    where project_users.project_id = (storage.foldername(name))[1]::uuid
    and project_users.user_id = auth.uid()
  )
);

create policy "Project members can view files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'project-files' AND
  exists (
    select 1 from project_users
    where project_users.project_id = (storage.foldername(name))[1]::uuid
    and project_users.user_id = auth.uid()
  )
);

create policy "Project members can delete files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-files' AND
  exists (
    select 1 from project_users
    where project_users.project_id = (storage.foldername(name))[1]::uuid
    and project_users.user_id = auth.uid()
  )
);
