-- Fix RLS policies to Ensure Global Admins and Project Admins can delete documents and files

-- Helper function to check project permissions SECURELY (bypassing RLS on project_users)
create or replace function has_project_role(project_id uuid, required_roles text[])
returns boolean
security definer
language plpgsql
as $$
begin
  return exists (
    select 1 from project_users
    where project_users.project_id = has_project_role.project_id
    and project_users.user_id = auth.uid()
    and project_users.role = any(required_roles)
  );
end;
$$;

-- 1. Documents Table Policies

drop policy if exists "Users can delete documents" on documents;

create policy "Users can delete documents"
  on documents for delete
  using (
    -- Global Admin can delete ANY document
    is_global_admin()
    OR
    (
        -- Project Docs: Project Admin or Editor
        project_id is not null AND
        has_project_role(project_id, ARRAY['admin', 'editor'])
    )
  );

-- 2. Storage Objects Policies

drop policy if exists "Delete files" on storage.objects;

create policy "Delete files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'project-files' AND (
    -- Global Admin can delete ANY file in this bucket
    is_global_admin()
    OR
    (
        -- Project Files: Check if the path starts with a project ID the user is admin/editor of
        -- Path format: "{projectId}/{filename}"
        exists (
             -- We have to manually parse because we can't easily call our function with a dynamic project_id derived from path in a clean way without casting
             -- So we use the function approach inside a select? No, just use the function.
             select 1
             where has_project_role((storage.foldername(name))[1]::uuid, ARRAY['admin', 'editor'])
        )
    )
  )
);
