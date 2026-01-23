# External Integrations

**Analysis Date:** 2026-01-23

## APIs & External Services

**Google Gemini (LLM):**
- Service: Google Gemini 2.5 Flash
- What it's used for: Conversational AI for salary interview chatbot, streaming responses
- SDK/Client: @google/genai 1.35.0
- Auth method: Vertex AI service account credentials
- Configuration: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`, `GOOGLE_SERVICE_ACCOUNT_KEY`
- Location: `apps/api/lib/gemini.ts` (client initialization)
- Implementation: `apps/api/utils/agent/GeminiAgent.ts` (orchestration)

**Google Text Embedding (Vector Database):**
- Service: Google Gemini text-embedding-004
- What it's used for: Generate vector embeddings for document chunks in RAG pipeline
- SDK/Client: @google/genai (same SDK)
- Implementation: `supabase/functions/process-embeddings/index.ts` (edge function)
- Purpose: Semantic search over uploaded documents for context injection

## Data Storage

**Databases:**
- Provider: Supabase (managed PostgreSQL)
  - Connection: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (client), `SUPABASE_SERVICE_KEY` (server)
  - Client: @supabase/supabase-js 2.87.1
  - Server client creation: `apps/api/utils/supabase/server.ts`

**Database Tables:**
- `projects` - Multi-tenant project configuration with allowed origins and gemini API keys
- `documents` - Uploaded documents with 768-dim embeddings, file metadata, processing status
- `salary_inquiries` - Calculation results and user inquiry history
- `request_logs` - Rate limiting per IP address
- All tables use Row-Level Security (RLS) policies

**File Storage:**
- Provider: Supabase Storage
  - Bucket: `project-files`
  - Used for: Uploading and storing PDF/document files
  - Access: Via Supabase SDK at `apps/api/app/actions/documents.ts`

**Caching:**
- In-memory cache: VectorstoreService maintains Map cache for embedding results
  - Location: `apps/api/lib/vectorstore/VectorstoreService.ts`
  - Purpose: Avoid re-querying Gemini embeddings for same documents
  - TTL: Session-based (no expiration mechanism detected)

## Authentication & Identity

**Auth Provider:**
- Service: Supabase Auth (built on GoTrue)
- Implementation: OAuth2 code exchange flow
- Auth callback: `apps/api/app/auth/callback/route.ts`
- Session management: @supabase/ssr 0.8.0 with cookie-based persistence
- Client creation: `apps/api/utils/supabase/client.ts` (client-side), `apps/api/utils/supabase/server.ts` (server-side)

**Session Handling:**
- Mechanism: HTTP cookies managed by Next.js Cookie API
- Server-side: Uses createServerClient with cookie getter/setter
- Client-side: Uses createBrowserClient pattern (if implemented)

**Project API Keys:**
- Multi-tenant public keys stored in `projects` table
- Origin whitelisting: Each project has `allowed_origins` array
- Request validation: `apps/api/app/api/chat/route.ts` checks API key and origin on line 76-96

## Monitoring & Observability

**Error Tracking:**
- Method: Not detected (no Sentry, DataDog, or similar)
- Logging: Console logging via `console.log()` for debugging
- Implementation: Manual logs in `apps/api/utils/agent/GeminiAgent.ts` for tool execution

**Logs:**
- Approach: Standard console output to stdout
- Captured by: Vercel deployment logs and Supabase edge function logs
- Request logging: `request_logs` table in Supabase for rate limiting audit

**Rate Limiting:**
- Mechanism: SQL-based IP tracking in `request_logs` table
- Limit: 20 requests per 60 seconds per IP
- Implementation: `apps/api/app/api/chat/route.ts` lines 51-63
- Log endpoint: Records IP and project key for each request

## CI/CD & Deployment

**Hosting:**
- Primary: Vercel (Next.js API and admin dashboard)
- Database/Auth: Supabase (managed cloud platform)
- Models: Google Cloud Vertex AI (europe-west1 region)
- Edge Functions: Supabase Functions (Deno runtime)

**CI Pipeline:**
- Not detected (no GitHub Actions, GitLab CI, or similar config found)
- Manual deployment via:
  - `npm run deploy:api` - Vercel CLI deployment
  - `npm run deploy:widget` - Custom script to upload to Supabase Storage

**Widget Deployment:**
- Script: `scripts/upload-to-supabase.js`
- Purpose: Upload built Vite widget to Supabase Storage for CDN distribution
- Trigger: `npm run deploy:widget` calls build + upload

## Environment Configuration

**Required environment variables:**

Server-side (backend):
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase PostgreSQL endpoint
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public auth key
- `SUPABASE_SERVICE_KEY` - Service role for admin operations
- `GOOGLE_CLOUD_PROJECT` - GCP project ID for Vertex AI
- `GOOGLE_CLOUD_LOCATION` - Region (default: europe-west3)
- `GOOGLE_SERVICE_ACCOUNT_KEY` - Service account credentials (JSON string or Base64)
- `GEMINI_API_KEY` - Fallback direct API key for demo mode

Client-side (frontend):
- `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Public auth key

Edge Functions (Deno):
- `SUPABASE_URL` - Supabase endpoint
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key
- `GEMINI_API_KEY` - Direct Gemini API key for file uploads

**Secrets location:**
- Development: `.env.local` file (not committed)
- Production: Vercel environment variables dashboard
- Edge Functions: Supabase secrets management
- Service account: Base64-encoded JSON in `GOOGLE_SERVICE_ACCOUNT_KEY` or file path in `GOOGLE_APPLICATION_CREDENTIALS`

## Webhooks & Callbacks

**Incoming Webhooks:**
- `POST /api/chat` - Main chat endpoint
  - Client request: `{ message, history, projectId, apiKey }`
  - Server response: `{ text, formState }`
  - Location: `apps/api/app/api/chat/route.ts`

- `GET /auth/callback` - OAuth2 callback from Supabase Auth
  - Query params: `code`, `next`
  - Exchanges auth code for user session
  - Location: `apps/api/app/auth/callback/route.ts`

- Supabase webhook → Edge Function
  - Trigger: Document INSERT/UPDATE in `documents` table
  - Function: `process-embeddings` edge function
  - Purpose: Auto-generate embeddings when documents are uploaded
  - Location: `supabase/functions/process-embeddings/index.ts`

**Outgoing Webhooks:**
- Not detected (no outgoing webhook implementations found)

**Asynchronous Processing:**
- Document processing pipeline:
  1. User uploads file via `apps/api/app/actions/documents.ts`
  2. Supabase webhook triggers `process-embeddings` function
  3. Edge function downloads file, uploads to Gemini, extracts text
  4. Text is split via RecursiveCharacterTextSplitter (chunks: 1000 chars, 200 overlap)
  5. Gemini embedding-004 generates vectors
  6. Vectors stored in `documents` table (pgvector field)

**Rate Limiting Webhook:**
- Supabase webhook on insert to `request_logs` table
- Purpose: Track API usage per IP and project
- Implementation: `apps/api/app/api/chat/route.ts` inserts and queries this table

## CORS Configuration

**CORS Headers:**
- All API routes allow wildcard origin: `Access-Control-Allow-Origin: *`
- Location: `apps/api/next.config.ts`
- Methods allowed: GET, DELETE, PATCH, POST, PUT, OPTIONS
- Custom header: `x-gemini-api-key` (project API key pass-through)

**Per-Project Origin Whitelisting:**
- Fallback validation in `apps/api/app/api/chat/route.ts` when projectId is provided
- Checks `projects.allowed_origins` array against request origin header
- Returns 403 if origin not whitelisted

## Database Schema Integration

**Vector Search:**
- Documents table has pgvector field for 768-dimensional embeddings
- Query via semantic similarity: Used in RAG pipeline
- Vector search not directly exposed (manual embedding generation in edge function)

**Authentication Tables:**
- Managed by Supabase Auth - users, sessions, refresh_tokens tables auto-created
- No custom user table detected

**Multi-tenancy:**
- Model: Project-based isolation
- Each document, salary inquiry belongs to a project
- RLS policies enforce project_id isolation

---

*Integration audit: 2026-01-23*
