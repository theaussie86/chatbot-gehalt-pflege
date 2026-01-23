# Codebase Structure

**Analysis Date:** 2026-01-23

## Directory Layout

```
chatbot-gehalt-pflege/
├── apps/
│   ├── api/                              # Next.js backend + admin dashboard
│   │   ├── app/
│   │   │   ├── api/chat/route.ts         # Main chat endpoint (POST)
│   │   │   ├── api/documents/            # Document CRUD endpoints
│   │   │   ├── (admin)/                  # Protected admin routes
│   │   │   │   ├── page.tsx              # Dashboard landing
│   │   │   │   ├── projects/             # Project management UI
│   │   │   │   ├── documents/            # Document upload/list UI
│   │   │   │   ├── embed/                # Widget embedding guide
│   │   │   │   └── test-widget/          # Interactive widget test
│   │   │   ├── auth/                     # OAuth callbacks
│   │   │   ├── login/                    # Auth page
│   │   │   ├── actions/                  # Server actions
│   │   │   │   ├── auth.ts               # Sign in/out
│   │   │   │   ├── projects.ts           # Project CRUD actions
│   │   │   │   └── documents.ts          # Document CRUD actions
│   │   │   ├── providers/                # React providers
│   │   │   ├── layout.tsx                # Root layout
│   │   │   └── globals.css               # Global styles
│   │   ├── lib/
│   │   │   ├── gemini.ts                 # Gemini client setup (Vertex AI auth)
│   │   │   ├── salary-flow.ts            # State machine implementation
│   │   │   ├── utils.ts                  # Shared utilities
│   │   │   └── vectorstore/
│   │   │       └── VectorstoreService.ts # RAG service with embedding & search
│   │   ├── utils/
│   │   │   ├── agent/                    # AI agent orchestration
│   │   │   │   ├── GeminiAgent.ts        # Gemini API client with tools
│   │   │   │   ├── ConversationAnalyzer.ts  # Intent detection
│   │   │   │   ├── ResponseValidator.ts     # Field validation + enrichment
│   │   │   │   ├── config.ts             # System instructions & tool definitions
│   │   │   │   └── types.ts              # Agent type definitions
│   │   │   ├── tax/                      # German tax calculation engine
│   │   │   │   ├── TaxWrapper.ts         # Orchestration layer
│   │   │   │   ├── Lohnsteuer2025.ts     # 2025 tax algorithm (BMF)
│   │   │   │   ├── Lohnsteuer2026.ts     # 2026 tax algorithm (BMF)
│   │   │   │   ├── TaxUtils.ts           # BigDecimal helper functions
│   │   │   │   ├── types.ts              # Tax input/output types
│   │   │   │   └── index.ts              # Exports
│   │   │   ├── supabase/                 # Database utilities
│   │   │   │   ├── client.ts             # Browser client
│   │   │   │   ├── server.ts             # Server client
│   │   │   │   └── middleware.ts         # Auth middleware
│   │   │   └── documents.ts              # Document processing helpers
│   │   ├── types/
│   │   │   └── form.ts                   # FormState & UserIntent types
│   │   ├── test/
│   │   │   ├── fixtures/                 # Test data
│   │   │   └── helpers/                  # Test utilities
│   │   ├── migrations/                   # Database schema migrations
│   │   └── package.json                  # Dependencies: @google/genai, supabase-js, etc.
│   │
│   └── web/                              # Vite embeddable widget
│       ├── src/
│       │   ├── App.tsx                   # Main chatbot component
│       │   ├── widget.tsx                # Widget entry point
│       │   ├── index.tsx                 # Bootstrap
│       │   ├── types/                    # Message, Sender, SalaryResultData types
│       │   ├── services/
│       │   │   └── gemini.ts             # API communication wrapper
│       │   ├── components/
│       │   │   ├── MessageBubble.tsx      # Message rendering
│       │   │   ├── ProgressBar.tsx        # Progress visualization
│       │   │   └── SalaryResult.tsx       # Result display component
│       │   └── styles/                   # CSS modules (if used)
│       ├── dist/                         # Built widget (generated)
│       ├── vite.config.ts                # Vite configuration
│       └── package.json                  # Dependencies: React, Tailwind, Lucide icons
│
├── supabase/
│   ├── functions/
│   │   └── process-embeddings/           # Edge function for document processing
│   └── migrations/                       # Database schema versions
│
├── docs/                                 # Project documentation
├── scripts/                              # Build/deploy helpers
│   └── upload-to-supabase.js             # Widget deployment script
├── tasks/                                # GSD workflow definitions
│   └── prd.json                          # Product requirements
├── package.json                          # Workspace root
├── tsconfig.json                         # TypeScript config
└── CLAUDE.md                             # Project instructions
```

## Directory Purposes

**apps/api/app/api/:**
- Purpose: HTTP API endpoints
- Contains: Route handlers (`route.ts` files) for REST endpoints
- Key files: `chat/route.ts` (main entry point for all chat requests)

**apps/api/app/(admin)/:**
- Purpose: Protected admin dashboard
- Contains: UI pages and forms for project/document management
- Protected by: Supabase Auth (Google OAuth flow)
- Key files: `projects/page.tsx`, `documents/page.tsx`, `embed/page.tsx`

**apps/api/lib/:**
- Purpose: Reusable core logic and third-party integrations
- Contains: Client initialization, state machines, RAG services
- Key files: `gemini.ts` (Vertex AI setup), `salary-flow.ts` (state machine)

**apps/api/utils/agent/:**
- Purpose: AI agent components and orchestration
- Contains: Gemini interaction, intent detection, validation logic
- Pattern: Each file is a single agent/analyzer responsibility

**apps/api/utils/tax/:**
- Purpose: German tax calculation
- Contains: BMF algorithm implementations, mapping logic
- Isolation: Self-contained tax domain—no dependencies on other utils

**apps/api/utils/supabase/:**
- Purpose: Database client wrappers
- Contains: Preconfigured Supabase clients for different contexts
- Pattern: Server actions import `server.ts`, browser components import `client.ts`

**apps/api/types/:**
- Purpose: Shared TypeScript interfaces
- Contains: FormState, UserIntent, validation types
- Pattern: Imported across layers to ensure type consistency

**apps/web/src/:**
- Purpose: Frontend chatbot widget code
- Contains: React components, message handling, API communication
- Entry: `widget.tsx` (embeddable) or `index.tsx` (standalone)

## Key File Locations

**Entry Points:**

- `apps/api/app/api/chat/route.ts` - Main chat endpoint (POST /api/chat)
- `apps/api/app/(admin)/page.tsx` - Admin dashboard landing
- `apps/web/src/widget.tsx` - Embeddable widget bootstrap
- `apps/api/app/layout.tsx` - Next.js root layout

**Configuration:**

- `apps/api/lib/gemini.ts` - Gemini/Vertex AI client setup
- `apps/api/utils/agent/config.ts` - System instructions and tool definitions
- `apps/web/vite.config.ts` - Widget build configuration
- `apps/api/next.config.js` (if present) - Next.js build config

**Core Logic:**

- `apps/api/lib/salary-flow.ts` - Finite state machine (120+ lines)
- `apps/api/utils/tax/TaxWrapper.ts` - Tax calculation orchestration (280+ lines)
- `apps/api/utils/agent/GeminiAgent.ts` - Gemini API client with tools
- `apps/api/lib/vectorstore/VectorstoreService.ts` - RAG implementation

**Testing:**

- `apps/api/test/fixtures/` - Mock data for tests
- `apps/api/test/helpers/` - Test utility functions

## Naming Conventions

**Files:**

- API routes: `route.ts` (Next.js convention)
- Server actions: `*.ts` with `'use server'` directive at top
- Page components: `page.tsx` in route directories
- Layout components: `layout.tsx`
- Service classes: `[ServiceName]Service.ts` or `[ServiceName].ts`
- Types: `*.ts` files in `types/` directory, exported as interfaces/types
- Configuration: lowercase, descriptive names (e.g., `gemini.ts`, `config.ts`)

**Directories:**

- Feature/domain folders: `kebab-case` (e.g., `salary-flow`, `vector-store`)
- Protected routes: parentheses prefix `(admin)`, `(auth)`
- Dynamic segments: square brackets `[id]`, `[slug]`

**Variables & Functions:**

- camelCase for JavaScript variables and functions
- PascalCase for classes and React components
- UPPERCASE_SNAKE_CASE for constants (sparingly used)
- snake_case for database columns (Supabase convention)
- Prefixed prefixes for debugging: `[StateMachine]`, `[GeminiAgent]`, `[ResponseValidator]`

## Where to Add New Code

**New Feature (e.g., new field to collect):**
- Add field to `FormState` in `apps/api/types/form.ts`
- Add field to state machine requirements in `apps/api/lib/salary-flow.ts`
- Add validation rules in `apps/api/utils/agent/ResponseValidator.ts`
- Add user-friendly question in `apps/api/app/api/chat/route.ts` buildUserFriendlyPrompt()
- Add field label to `SalaryStateMachine.FIELD_LABELS`

**New API Endpoint:**
- Create directory under `apps/api/app/api/[resource]/`
- Create `route.ts` with handler functions (GET, POST, etc.)
- Extract business logic to `apps/api/utils/` if complex
- Add security checks (rate limiting, origin, authentication)

**New Component/Widget UI:**
- Create `.tsx` file under `apps/web/src/components/`
- Import in `apps/web/src/App.tsx` or relevant parent component
- Use existing color system via CSS custom properties (--primary-color)

**New Service/Utility:**
- Create file under `apps/api/utils/[domain]/[ServiceName].ts`
- Organize by domain (agent, tax, supabase, etc.)
- Export class or named functions from same file
- Add comprehensive JSDoc comments

**Server Actions (form submissions, mutations):**
- Create under `apps/api/app/actions/[domain].ts`
- Start with `'use server'` directive
- Import Supabase server client: `import { createClient } from '@/utils/supabase/server'`
- Use error boundaries for try-catch

**Tests:**
- Create `*.test.ts` or `*.spec.ts` in `apps/api/test/`
- Follow pattern: one test file per source file
- Store fixtures in `apps/api/test/fixtures/`
- Import helpers from `apps/api/test/helpers/`

## Special Directories

**apps/api/.next/:**
- Purpose: Generated Next.js build output
- Generated: Yes (by Next.js build)
- Committed: No (in .gitignore)
- Action: Never manually edit—runs `npm run build` to regenerate

**apps/web/dist/:**
- Purpose: Built Vite widget bundle
- Generated: Yes (by `npm run build --workspace=@pflege/web`)
- Committed: No (in .gitignore)
- Action: Upload to Supabase via `scripts/upload-to-supabase.js`

**supabase/.temp/:**
- Purpose: Local Supabase emulation data
- Generated: Yes (by Supabase CLI)
- Committed: No (in .gitignore)
- Action: Local development only

**apps/api/migrations/:**
- Purpose: Database schema version history
- Generated: No (manually created via Supabase CLI)
- Committed: Yes
- Action: Run with `supabase db push` or `supabase db pull`

## Route & Permission Structure

**Public Routes (no auth required):**
- `POST /api/chat` - Chat endpoint (project ID based, not user auth)
- `POST /api/documents/[id]/upload` - Document processing (if enabled)

**Admin Routes (auth required, protected by middleware):**
- `GET / (admin)` - Dashboard landing
- `GET / (admin)/projects` - Project list/create
- `GET / (admin)/projects/[id]` - Project detail/edit
- `GET / (admin)/documents` - Document management
- `GET / (admin)/embed` - Widget embedding guide
- `GET / (admin)/test-widget` - Interactive test page

**Auth Routes:**
- `GET /login` - Auth page
- `GET /auth/callback` - OAuth callback handler

## Import Patterns

**Absolute imports via aliases:**
- `@/` maps to `apps/api/` root
- `@/utils/supabase/server` - Database utilities
- `@/lib/gemini` - AI client
- `@/types/form` - Type definitions
- `@/app/actions/projects` - Server actions

**Relative imports (when crossing boundaries):**
- From `apps/web/` components: relative paths work fine (flat structure)
- From `apps/api/` route to utils: use absolute `@/` imports

---

*Structure analysis: 2026-01-23*
