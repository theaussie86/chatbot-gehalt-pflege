-- Fix infinite recursion in profiles policy
-- The previous policy "Global Admins can read all profiles" was checking the profiles table directly
-- inside the policy definition, causing an infinite loop.
-- We fix this by using the security definer function is_global_admin() which bypasses RLS.

-- Drop the problematic policy
drop policy if exists "Global Admins can read all profiles" on profiles;

-- Re-create properly using the helper function
create policy "Global Admins can read all profiles" on profiles
  for select using (
    is_global_admin()
  );
