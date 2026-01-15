---
description: Create and apply a new Supabase migration
---

1. Create a new SQL migration file in `apps/api/migrations` with a descriptive name (e.g., `YYYYMMDDHHMMSS_description.sql` or just `description.sql`).
2. Write the SQL code to perform the schema changes. Ensure it is idempotent (using `if not exists`, etc.) where possible.
3. Apply the migration using the `mcp_supabase-mcp-server_apply_migration` tool.
   - **name**: Use the filename (without extension) or a snake_case version of the description.
   - **project_id**: Use the active project ID (e.g., `xjbkpfbiajcjkamvlrhw`).
   - **query**: Pass the content of the SQL file.
4. Verify the migration results using `mcp_supabase-mcp-server_execute_sql` or by checking the Supabase Dashboard.
