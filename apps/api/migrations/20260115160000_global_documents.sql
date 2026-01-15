-- 1. Create Profiles Table
create table if not exists profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  email text,
  is_admin boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

alter table profiles enable row level security;

create policy "Users can read their own profile" on profiles
  for select using (auth.uid() = id);

create policy "Global Admins can read all profiles" on profiles
  for select using (exists (select 1 from profiles where id = auth.uid() and is_admin = true));

-- Trigger to create profile on signup
create or replace function public.handle_new_user() 
returns trigger as $$
begin
  insert into public.profiles (id, email, is_admin)
  values (new.id, new.email, false);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Backfill profiles for existing users
insert into profiles (id, email)
select id, email from auth.users
on conflict (id) do nothing;

-- 2. Update Project Users Roles
-- Drop check constraint first
alter table project_users drop constraint if exists project_users_role_check;

-- Migrate old roles to new ones
update project_users set role = 'admin' where role = 'owner';
update project_users set role = 'viewer' where role = 'member';

-- Add new check constraint
alter table project_users add constraint project_users_role_check 
  check (role in ('admin', 'editor', 'viewer'));

-- Set default role
alter table project_users alter column role set default 'viewer';

-- 3. Update Documents (Nullable project_id)
alter table documents alter column project_id drop not null;

-- 4. RLS Policies

-- Helper function to check if user is Global Admin
create or replace function is_global_admin() returns boolean as $$
  select exists (select 1 from profiles where id = auth.uid() and is_admin = true);
$$ language sql security definer;

-- Project Policies Update
-- View projects: Member OR Global Admin
drop policy if exists "Users can view projects they belong to" on projects;
create policy "Users can view projects"
  on projects for select
  using (
    exists (select 1 from project_users where project_users.project_id = projects.id and project_users.user_id = auth.uid()) 
    OR is_global_admin()
  );

-- Update/Delete projects: Project Admin OR Global Admin
drop policy if exists "Project owners can update their projects" on projects;
create policy "Admins can update projects"
  on projects for update
  using (
    exists (select 1 from project_users where project_users.project_id = projects.id and project_users.user_id = auth.uid() and role = 'admin') 
    OR is_global_admin()
  );

drop policy if exists "Project owners can delete their projects" on projects;
create policy "Admins can delete projects"
  on projects for delete
  using (
    exists (select 1 from project_users where project_users.project_id = projects.id and project_users.user_id = auth.uid() and role = 'admin') 
    OR is_global_admin()
  );


-- Documents Policies Update
drop policy if exists "Users can view documents in their projects" on documents;
drop policy if exists "Project members can insert documents" on documents;
drop policy if exists "Project members can delete documents" on documents;

-- SELECT: Global Docs (project_id is null) OR Project Member OR Global Admin
create policy "Users can read documents"
  on documents for select
  using (
    project_id is null -- Global Document
    OR exists (select 1 from project_users where project_users.project_id = documents.project_id and project_users.user_id = auth.uid()) -- Project Member
    OR is_global_admin() -- Global Admin
  );

-- INSERT: Global Docs (All Authenticated) OR Project Admin/Editor OR Global Admin
create policy "Users can insert documents"
  on documents for insert
  with check (
    project_id is null -- Allow Global Uploads by anyone
    OR exists (select 1 from project_users where project_users.project_id = project_id and project_users.user_id = auth.uid() and role in ('admin', 'editor')) -- Project Editor/Admin
    OR is_global_admin()
  );

-- DELETE: Global Docs (Global Admin Only) OR Project Admin/Editor OR Global Admin
create policy "Users can delete documents"
  on documents for delete
  using (
    (project_id is null AND is_global_admin()) -- Global Doc deletion only by Global Admin
    OR exists (select 1 from project_users where project_users.project_id = documents.project_id and project_users.user_id = auth.uid() and role in ('admin', 'editor')) -- Project Doc
    OR is_global_admin()
  );

-- Update Storage Policies
drop policy if exists "Project members can upload files" on storage.objects;
drop policy if exists "Project members can view files" on storage.objects;
drop policy if exists "Project members can delete files" on storage.objects;

-- Storage INSERT
create policy "Upload files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'project-files' AND (
    -- Global files: path starts with "global/"
    (storage.foldername(name))[1] = 'global'
    OR
    -- Project files: path starts with projectId, user must be admin/editor
    exists (
      select 1 from project_users
      where project_users.project_id::text = (storage.foldername(name))[1]
      and project_users.user_id = auth.uid()
      and role in ('admin', 'editor')
    )
    OR is_global_admin()
  )
);

-- Storage SELECT
create policy "View files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'project-files' AND (
    (storage.foldername(name))[1] = 'global'
    OR
    exists (
      select 1 from project_users
      where project_users.project_id::text = (storage.foldername(name))[1]
      and project_users.user_id = auth.uid()
    )
    OR is_global_admin()
  )
);

-- Storage DELETE
create policy "Delete files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-files' AND (
    -- Only Global Admin can delete global files
    ((storage.foldername(name))[1] = 'global' AND is_global_admin())
    OR
    exists (
      select 1 from project_users
      where project_users.project_id::text = (storage.foldername(name))[1]
      and project_users.user_id = auth.uid()
      and role in ('admin', 'editor')
    )
    OR is_global_admin()
  )
);
