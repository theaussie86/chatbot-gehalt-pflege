# Database Schema & RLS Documentation

This document describes the complete database schema, Row Level Security (RLS) policies, and helper functions for the Gehalt-Pflege Chatbot application.

## Table of Contents

1. [Overview](#overview)
2. [Tables](#tables)
3. [Helper Functions](#helper-functions)
4. [RLS Policies](#rls-policies)
5. [Storage Configuration](#storage-configuration)
6. [Triggers & Automation](#triggers--automation)
7. [Access Matrix](#access-matrix)

---

## Overview

The application uses Supabase (PostgreSQL) with Row Level Security enabled on all tables. The security model is based on:

- **Global Admins** - Users with `is_admin = true` in their profile, can access everything
- **Project Roles** - Users can have `admin`, `editor`, or `viewer` roles per project
- **Global Documents** - Documents with `project_id = NULL`, visible to all authenticated users

### Extensions

| Extension | Purpose |
|-----------|---------|
| `vector` (pgvector) | Vector similarity search for RAG |
| `pg_net` | HTTP requests from database (webhooks) |

---

## Tables

### profiles

Stores user profile information and global admin status.

```sql
CREATE TABLE profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  is_admin    BOOLEAN DEFAULT false,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key, references auth.users |
| `email` | TEXT | User's email address |
| `is_admin` | BOOLEAN | Global admin flag |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### projects

Multi-tenant project configuration.

```sql
CREATE TABLE projects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  public_key      TEXT UNIQUE NOT NULL,
  allowed_origins TEXT[] DEFAULT '{}',
  gemini_api_key  TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `name` | TEXT | Project display name |
| `public_key` | TEXT | Unique API key for widget embedding |
| `allowed_origins` | TEXT[] | CORS whitelist for widget |
| `gemini_api_key` | TEXT | Optional project-specific Gemini API key |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### project_users

Project membership and role assignments.

```sql
CREATE TABLE project_users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')) DEFAULT 'viewer',
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, user_id)
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Foreign key to projects |
| `user_id` | UUID | Foreign key to auth.users |
| `role` | TEXT | One of: `admin`, `editor`, `viewer` |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Roles:**
- `admin` - Full access: manage project settings, members, documents
- `editor` - Can upload/delete documents, but cannot manage members
- `viewer` - Read-only access to documents

---

### documents

Uploaded documents for RAG pipeline.

```sql
CREATE TABLE documents (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id        UUID REFERENCES projects(id) ON DELETE CASCADE,
  filename          TEXT NOT NULL,
  mime_type         TEXT,
  storage_path      TEXT NOT NULL,
  storage_object_id UUID,
  status            TEXT CHECK (status IN ('pending', 'processing', 'embedded', 'error')) DEFAULT 'pending',
  created_at        TIMESTAMPTZ DEFAULT now()
);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `project_id` | UUID | Foreign key to projects, NULL = global document |
| `filename` | TEXT | Original filename |
| `mime_type` | TEXT | MIME type (e.g., `application/pdf`) |
| `storage_path` | TEXT | Path in Supabase Storage |
| `storage_object_id` | UUID | Reference to storage.objects |
| `status` | TEXT | Processing status |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

**Status Values:**
- `pending` - Uploaded, waiting for embedding
- `processing` - Embedding generation in progress
- `embedded` - Ready for RAG queries
- `error` - Embedding failed

---

### document_chunks

Vector embeddings for semantic search.

```sql
CREATE TABLE document_chunks (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  content     TEXT NOT NULL,
  embedding   VECTOR(768) NOT NULL,
  token_count INTEGER,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- HNSW index for fast vector search
CREATE INDEX document_chunks_embedding_idx
  ON document_chunks USING hnsw (embedding vector_cosine_ops);
```

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `document_id` | UUID | Foreign key to documents |
| `chunk_index` | INTEGER | Position in document |
| `content` | TEXT | Chunk text content |
| `embedding` | VECTOR(768) | Gemini text-embedding-004 vector |
| `token_count` | INTEGER | Token count for chunk |
| `created_at` | TIMESTAMPTZ | Creation timestamp |

---

### request_logs

Rate limiting tracking.

```sql
CREATE TABLE request_logs (
  id          BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  ip_address  TEXT,
  public_key  TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

### salary_inquiries

Calculation history for analytics.

```sql
CREATE TABLE salary_inquiries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key  TEXT,
  gruppe      TEXT,
  stufe       INTEGER,
  tarif       TEXT,
  jahr        TEXT,
  brutto      NUMERIC,
  netto       NUMERIC,
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);
```

---

## Helper Functions

These functions are used in RLS policies and are defined with `SECURITY DEFINER` to bypass RLS when checking permissions.

### is_global_admin()

Returns `true` if the current user is a global admin.

```sql
CREATE OR REPLACE FUNCTION is_global_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
    AND is_admin = true
  )
$$;
```

### has_project_role(project_id, roles[])

Returns `true` if the current user has any of the specified roles in the project.

```sql
CREATE OR REPLACE FUNCTION has_project_role(p_project_id UUID, p_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
    AND role = ANY(p_roles)
  )
$$;
```

**Example usage:**
```sql
-- Check if user is admin or editor
has_project_role('project-uuid', ARRAY['admin', 'editor'])
```

### is_project_member(project_id)

Returns `true` if the current user is any member of the project.

```sql
CREATE OR REPLACE FUNCTION is_project_member(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM project_users
    WHERE project_id = p_project_id
    AND user_id = auth.uid()
  )
$$;
```

---

## RLS Policies

All tables have RLS enabled. Below are the policies for each table.

### profiles

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Users can read own profile | `id = auth.uid()` |
| SELECT | Admins can read all profiles | `is_global_admin()` |
| UPDATE | Users can update own profile | `id = auth.uid()` |

### projects

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Members can view projects | `is_project_member(id) OR is_global_admin()` |
| INSERT | Anyone can create projects | `true` (any authenticated user) |
| UPDATE | Admins can update projects | `has_project_role(id, ['admin']) OR is_global_admin()` |
| DELETE | Admins can delete projects | `has_project_role(id, ['admin']) OR is_global_admin()` |

### project_users

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Users can view own memberships | `user_id = auth.uid()` |
| SELECT | Admins can view project members | `has_project_role(project_id, ['admin']) OR is_global_admin()` |
| INSERT | Users can add self as admin on new project | `user_id = auth.uid() OR has_project_role(project_id, ['admin']) OR is_global_admin()` |
| UPDATE | Admins can update members | `has_project_role(project_id, ['admin']) OR is_global_admin()` |
| DELETE | Admins can remove members | `has_project_role(project_id, ['admin']) OR is_global_admin()` |

### documents

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Users can view documents | `project_id IS NULL OR is_project_member(project_id) OR is_global_admin()` |
| INSERT | Users can insert documents | `(project_id IS NULL AND is_global_admin()) OR (project_id IS NOT NULL AND has_project_role(project_id, ['admin', 'editor'])) OR is_global_admin()` |
| UPDATE | Users can update documents | Same as INSERT |
| DELETE | Users can delete documents | Same as INSERT |

**Key Points:**
- Global documents (`project_id IS NULL`) are **readable by all** authenticated users
- Global documents can only be **created/modified/deleted by global admins**
- Project documents require `admin` or `editor` role for write operations

### document_chunks

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Users can view chunks | Parent document is readable |
| INSERT | Admins can insert chunks | Parent document is writable |
| DELETE | Admins can delete chunks | Parent document is deletable |

Note: Chunks are typically inserted by the Edge Function using the Service Role Key, which bypasses RLS.

### request_logs & salary_inquiries

| Operation | Policy Name | Rule |
|-----------|-------------|------|
| SELECT | Users can view own project data | `public_key` matches a project where user is member, OR `is_global_admin()` |

---

## Storage Configuration

### Bucket: project-files

| Setting | Value |
|---------|-------|
| Public | `false` (private) |
| Max File Size | 52 MB |
| Allowed MIME Types | `application/pdf` |

### Path Structure

```
project-files/
├── global/                    # Global documents (visible to all)
│   └── {filename}.pdf
└── {project-uuid}/            # Project-specific documents
    └── {filename}.pdf
```

### Storage Policies

| Operation | Rule |
|-----------|------|
| SELECT (View files) | Global folder: all authenticated users. Project folder: project members. Or global admin. |
| INSERT (Upload files) | Global folder: **only global admins**. Project folder: admin/editor. |
| DELETE (Delete files) | Global folder: **only global admins**. Project folder: admin/editor. |

**Important:** The DELETE policy explicitly checks for `'global'` path before attempting UUID cast to avoid errors:

```sql
-- CORRECT: Check 'global' first
(storage.foldername(name))[1] != 'global'
AND has_project_role(((storage.foldername(name))[1])::uuid, ARRAY['admin', 'editor'])
```

---

## Triggers & Automation

### on_auth_user_created

Automatically creates a profile when a new user signs up.

```sql
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

### on_project_created

Automatically adds the project creator as admin.

```sql
CREATE TRIGGER on_project_created
  AFTER INSERT ON projects
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_project();
```

### on_document_created_process_embeddings

Triggers Edge Function to generate embeddings when a document is uploaded.

```sql
CREATE TRIGGER on_document_created_process_embeddings
  AFTER INSERT ON documents
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION trigger_process_embeddings();
```

---

## Access Matrix

Summary of who can do what:

| Action | Global Admin | Project Admin | Project Editor | Project Viewer | Unauthenticated |
|--------|:------------:|:-------------:|:--------------:|:--------------:|:---------------:|
| **Projects** |
| View all projects | Yes | - | - | - | - |
| View own projects | Yes | Yes | Yes | Yes | - |
| Create project | Yes | Yes | Yes | Yes | - |
| Update project | Yes | Yes | - | - | - |
| Delete project | Yes | Yes | - | - | - |
| **Documents** |
| View global docs | Yes | Yes | Yes | Yes | - |
| View project docs | Yes | Yes | Yes | Yes | - |
| Upload global docs | Yes | - | - | - | - |
| Upload project docs | Yes | Yes | Yes | - | - |
| Delete global docs | Yes | - | - | - | - |
| Delete project docs | Yes | Yes | Yes | - | - |
| **Members** |
| View members | Yes | Yes | - | - | - |
| Add members | Yes | Yes | - | - | - |
| Update roles | Yes | Yes | - | - | - |
| Remove members | Yes | Yes | - | - | - |

---

## Migration History

| Version | Name | Description |
|---------|------|-------------|
| 20260101000000 | baseline_schema | Initial tables: projects, request_logs, salary_inquiries |
| 20260115120000 | init_rag_pipeline | pgvector, documents, document_chunks, storage bucket |
| 20260115124600 | schema_refactor | project_users table, ownership migration |
| 20260115160000 | global_documents | profiles table, is_global_admin(), global docs support |
| 20260115163000 | cleanup_documents | Remove obsolete columns, document_chunks RLS |
| 20260115170000 | add_document_status | Document status enum |
| 20260115174500 | fix_profiles_recursion | Fix infinite recursion in is_global_admin() |
| 20260115190000 | add_token_count | token_count column |
| 20260116000000 | setup_embedding_webhook | pg_net extension, embedding trigger |
| 20260116090000 | fix_deletion_rls | has_project_role() function, fix delete policies |
| 20260121000000 | rls_reset | Complete RLS reset and cleanup |

---

## Troubleshooting

### "permission denied for table X"

1. Check if user is authenticated
2. Verify project membership with: `SELECT * FROM project_users WHERE user_id = auth.uid()`
3. Check if RLS is enabled: `SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'X'`

### Storage upload/delete fails

1. Verify the path format: `{project-id}/{filename}` or `global/{filename}`
2. Check project role: must be `admin` or `editor`
3. For global folder: user must be global admin (`profiles.is_admin = true`)

### Document embeddings not generated

1. Check document status in `documents` table
2. Review Edge Function logs in Supabase Dashboard
3. Verify `pg_net` extension is enabled
4. Check webhook URL in `trigger_process_embeddings()` function

---

## Related Documentation

- [CLAUDE.md](../CLAUDE.md) - Project overview and architecture
- [Supabase RLS Docs](https://supabase.com/docs/guides/auth/row-level-security)
- [pgvector Docs](https://github.com/pgvector/pgvector)
