# Technology Stack

**Analysis Date:** 2026-01-23

## Languages

**Primary:**
- TypeScript 5.x - Used across all application code
- JavaScript/JSX - UI components and configuration

**Secondary:**
- SQL - Supabase database queries and migrations
- Deno TypeScript - Edge functions for document processing

## Runtime

**Environment:**
- Node.js 20+ (inferred from Next.js 16.1.2 requirements)
- Deno - Edge function runtime for Supabase Functions

**Package Manager:**
- npm 10+ with workspace support for monorepo structure
- Lockfile: package-lock.json (present)

## Frameworks

**Core:**
- Next.js 16.1.2 - Backend API and admin dashboard (`apps/api`)
- React 19.2.3 - UI components across all applications
- Vite 6.2.0 - Build tool and dev server for embeddable widget (`apps/web`)

**UI Components:**
- Radix UI - Accessible component primitives
- shadcn/ui - Pre-built component library
- Tailwind CSS 4.x - Utility-first CSS framework
- Lucide React 0.56+ - Icon library

**State Management:**
- TanStack React Query v5.90+ - Server state and caching
- TanStack React Query Devtools v5.91+ - Development utilities
- next-themes 0.4.6 - Theme management

**Testing:**
- No test framework detected in package.json (not applicable)

**Build/Dev:**
- Tailwind CSS 4.x with PostCSS 8.5.6 - CSS processing
- Autoprefixer 10.4.22 - CSS vendor prefix handling
- ESLint 9.x - Code linting
- tsx 4.21.0 - TypeScript execution for scripts
- Vite plugins (@vitejs/plugin-react 5.0.0) - React support in Vite

## Key Dependencies

**Critical:**
- @google/genai 1.35.0 (api), 1.33.0 (web) - Gemini AI SDK for chat and embeddings
- @supabase/supabase-js 2.87.1 - PostgreSQL database client
- @supabase/ssr 0.8.0 - Server-side session management for authentication

**Infrastructure:**
- class-variance-authority 0.7.1 - Type-safe component variant management
- clsx 2.1.1 - Utility for conditional classNames
- tailwind-merge 3.4.0 - Intelligent Tailwind class merging
- sonner 2.0.7 - Toast notification library
- tw-animate-css 1.4.0 - Animation utilities for Tailwind

**Development:**
- @types/node 20.x, 22.x - Node.js type definitions
- @types/react 19.x - React type definitions
- @types/react-dom 19.x - React DOM type definitions
- eslint-config-next 16.1.2 - Next.js ESLint configuration
- @tailwindcss/postcss 4.x - PostCSS integration for Tailwind

**Edge Functions Only:**
- @langchain/textsplitters - Text chunking for document processing (used in Deno edge function)
- RecursiveCharacterTextSplitter - Semantic text splitting

## Configuration

**Environment:**
- Supabase configuration via environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL` - Public Supabase endpoint
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY` - Anon key for client-side access
  - `SUPABASE_SERVICE_KEY` - Service role key for server-side operations

- Google Cloud/Vertex AI authentication:
  - `GOOGLE_CLOUD_PROJECT` - GCP project ID
  - `GOOGLE_CLOUD_LOCATION` - Region (default: europe-west3)
  - `GOOGLE_SERVICE_ACCOUNT_KEY` - Service account JSON (plain or Base64-encoded)
  - `GOOGLE_APPLICATION_CREDENTIALS` - Alternative: path to credentials file
  - Fallback to Application Default Credentials via `gcloud auth`

- Legacy Gemini API (fallback for demo):
  - `GEMINI_API_KEY` - Direct API key (used when service account unavailable)

- Vercel deployment:
  - `VERCEL_TOKEN` - For automated deployments

**Build:**
- `apps/api/tsconfig.json` - TypeScript configuration with path aliases (`@/*`)
- `apps/api/next.config.ts` - CORS headers for API routes
- `apps/web/vite.config.ts` - Vite configuration for widget bundling
- `apps/web/tailwind.config.js` - Tailwind CSS customization
- `apps/api/postcss.config.mjs` - PostCSS configuration
- `apps/web/postcss.config.js` - PostCSS configuration
- `.eslintrc.mjs` - ESLint rules configuration

## Platform Requirements

**Development:**
- Node.js 20+ with npm workspaces
- TypeScript 5.x compiler
- Supabase CLI 2.72.7 for local development and edge function management

**Production:**
- Vercel - Primary hosting platform for Next.js API and dashboard
- Supabase - PostgreSQL database, authentication, file storage, and edge functions
- Google Cloud Platform - Vertex AI for Gemini model inference (europe-west1 region)
- Deno - Runtime for Supabase edge functions

## Deployment & CI/CD

**Hosting Platforms:**
- Vercel - Next.js application deployment
- Supabase - Database, auth, storage, edge functions
- Google Cloud - Vertex AI model inference

**Build Commands:**
- `npm run build` - Build all workspaces (Next.js and Vite)
- `npm run dev:api` - Start API development server on port 3000
- `npm run dev:web` - Start Vite widget on port 5173
- `npm run deploy:api` - Deploy to Vercel via CLI
- `npm run deploy:widget` - Build widget and upload to Supabase Storage

---

*Stack analysis: 2026-01-23*
