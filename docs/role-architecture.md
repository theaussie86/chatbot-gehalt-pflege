# Role Architecture

This document describes the two-layer role system used for authorization across the application.

## Overview

Authorization is split into two levels:

1. **Global Role** — a boolean flag on the `profiles` table (`is_admin`)
2. **Project Role** — a per-project role on the `project_users` table (`role`)

Global admin status always takes precedence: a global admin is treated as a project admin on every project, regardless of their actual project membership.

## Global Role

Stored in `profiles.is_admin` (boolean, default `false`).

| Value   | Meaning                                                                 |
|---------|-------------------------------------------------------------------------|
| `true`  | **Global Admin** — full access to all projects, can manage members everywhere, can read all user profiles |
| `false` | **Regular User** — access restricted to projects they are a member of   |

There is no UI for toggling this flag. It must be set directly in the database:

```sql
-- Grant global admin
UPDATE profiles SET is_admin = true WHERE email = 'user@example.com';

-- Revoke global admin
UPDATE profiles SET is_admin = false WHERE email = 'user@example.com';
```

## Project Roles

Stored in `project_users.role` (text). One row per user per project.

| Role     | View project | Manage documents | Manage members | Delete project |
|----------|:------------:|:----------------:|:--------------:|:--------------:|
| `viewer` | yes          | no               | no             | no             |
| `editor` | yes          | yes              | no             | no             |
| `admin`  | yes          | yes              | yes            | yes            |

A user with no row in `project_users` for a given project has no access to that project (unless they are a global admin).

## Access Resolution

```
User makes request for a project
       |
       v
+----------------+     YES
| is_global_     |-----------> FULL ACCESS (treated as project admin)
| admin?         |
+-------+--------+
        | NO
        v
+----------------+     NO
| Has row in     |-----------> ACCESS DENIED (cannot see project)
| project_users  |
| for this       |
| project?       |
+-------+--------+
        | YES
        v
   Use role from
   project_users
   (admin / editor / viewer)
```

## Database Functions (RLS helpers)

These `SECURITY DEFINER` functions are used in Row-Level Security policies:

| Function                                      | Purpose                                                  |
|-----------------------------------------------|----------------------------------------------------------|
| `is_global_admin()`                           | Returns `true` if the current user has `profiles.is_admin = true` |
| `has_project_role(project_id, roles[])`       | Returns `true` if the current user has one of the specified roles on the project |
| `is_project_member(project_id)`               | Returns `true` if the current user has any role on the project |

## RLS Policies

### projects

| Operation | Policy                                                        |
|-----------|---------------------------------------------------------------|
| SELECT    | `is_project_member(id) OR is_global_admin()`                  |
| INSERT    | `true` (anyone can create a project)                          |
| UPDATE    | `has_project_role(id, ['admin']) OR is_global_admin()`        |
| DELETE    | `has_project_role(id, ['admin']) OR is_global_admin()`        |

### project_users

| Operation | Policy                                                                                      |
|-----------|---------------------------------------------------------------------------------------------|
| SELECT    | `user_id = auth.uid()` OR `has_project_role(project_id, ['admin']) OR is_global_admin()`    |
| INSERT    | `user_id = auth.uid() OR has_project_role(project_id, ['admin']) OR is_global_admin()`      |
| UPDATE    | `has_project_role(project_id, ['admin']) OR is_global_admin()`                               |
| DELETE    | `has_project_role(project_id, ['admin']) OR is_global_admin()`                               |

### profiles

| Operation | Policy                                       |
|-----------|----------------------------------------------|
| SELECT    | `id = auth.uid()` OR `is_global_admin()`     |
| UPDATE    | `id = auth.uid()`                             |

## Application-Level Authorization

Server actions in `app/actions/project-members.ts` use a `getEffectiveRole()` helper that mirrors the RLS logic:

- Checks `profiles.is_admin` for the authenticated user
- If `true`, returns `'admin'` regardless of project membership
- Otherwise returns the user's actual `project_users.role` for the project

This ensures global admins can manage members on any project through the UI, even if they are not explicitly listed as a project member.

## Notes

- When a project is created, a database trigger automatically adds the creator as `admin` in `project_users`.
- The last remaining project admin cannot be demoted or removed (enforced in application code).
- The admin client (service role key) is used server-side for member and profile queries to bypass the restrictive `profiles` RLS. Authentication is always verified first via the regular client.
