# CLAUDE.md - Project Overview

## What is this project?

**Gehalt-Pflege Chatbot** is an AI-powered conversational salary calculator for German nursing/care professionals (Pflege). It guides users through a structured interview to collect job and tax information, then calculates net income based on German public service tariff systems (TVöD, TV-L, AVR).

## Tech Stack

| Category | Technology |
|----------|------------|
| Framework | Next.js 16.1.2, React 19.2.3 |
| Language | TypeScript 5.x |
| AI/LLM | Google Gemini 2.0 Flash, Text Embedding 004 |
| Database | Supabase (PostgreSQL with RLS, Auth, Storage) |
| State | TanStack React Query v5 |
| UI | Tailwind CSS 4, Radix UI, shadcn/ui, Sonner |
| Widget | Vite 6.2.0 (embeddable chatbot) |

## Monorepo Structure

```
chatbot-gehalt-pflege/
├── apps/
│   ├── api/                    # Next.js backend + dashboard
│   │   ├── app/                # App Router pages
│   │   │   ├── (admin)/        # Protected routes (projects, documents, embed)
│   │   │   ├── api/chat/       # Main chat endpoint
│   │   │   └── actions/        # Server actions
│   │   ├── lib/
│   │   │   ├── gemini.ts       # Gemini client setup
│   │   │   ├── salary-flow.ts  # State machine implementation
│   │   │   └── vectorstore/    # RAG service
│   │   └── utils/
│   │       ├── agent/          # AI agents (GeminiAgent, ConversationAnalyzer)
│   │       ├── tax/            # German tax calculation engine
│   │       └── supabase/       # DB client wrappers
│   │
│   └── web/                    # Vite embeddable widget
│       ├── src/
│       ├── App.tsx             # Main chatbot component
│       └── widget.tsx          # Widget wrapper
│
├── supabase/functions/         # Edge functions (embeddings)
└── tasks/prd.json              # Product requirements
```

## Key Concepts

### State Machine Flow

The chat follows a finite state machine with these stages:

```
job_details → tax_details → summary → completed
```

Each state collects required fields before transitioning:
- **job_details**: tarif, experience (Stufe), hours, state (Bundesland)
- **tax_details**: taxClass, churchTax, numberOfChildren
- **summary**: User confirmation
- **completed**: Display calculated results

### Core Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `GeminiAgent` | `utils/agent/GeminiAgent.ts` | Orchestrates AI responses with tools |
| `ConversationAnalyzer` | `utils/agent/ConversationAnalyzer.ts` | Detects user intent |
| `ResponseValidator` | `utils/agent/ResponseValidator.ts` | Validates extracted fields |
| `TaxWrapper` | `utils/tax/TaxWrapper.ts` | Main tax calculation orchestrator |
| `VectorstoreService` | `lib/vectorstore/VectorstoreService.ts` | RAG document search |
| `salary-flow.ts` | `lib/salary-flow.ts` | State machine implementation |

### User Intent Types

The system classifies user messages into intents:
- `data_provision` - User providing information
- `question` - User asking something
- `modification` - User wants to change previous data
- `confirmation` - User confirming/proceeding
- `unclear` - Ambiguous input

## Database Schema

**Main Tables:**
- `projects` - Multi-tenant project configuration
- `documents` - Uploaded documents with embeddings (768-dim vectors)
- `salary_inquiries` - Calculation results
- `request_logs` - Rate limiting

**Key RLS Pattern:** Users can only access their own projects/documents.

## API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/chat` | POST | Main chat with state machine |
| `/api/documents/*` | Various | Document CRUD via server actions |

**Chat Request:**
```typescript
{ message: string, history: Message[], projectId: string, currentFormState: FormState }
```

**Chat Response:**
```typescript
{ text: string, formState: FormState }
```

## Development Commands

```bash
npm run dev:api      # Start API on :3000
npm run dev:web      # Start widget on :5173
npm run build        # Build both apps
npm run deploy:api   # Deploy to Vercel
npm run deploy:widget # Upload widget to Supabase
```

## Environment Variables

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
```

## Current Branch Context

**Branch:** `ralph/ai-guided-salary-interview-state-machine`

**Recent Work:**
- State machine for guided salary interview
- RAG pipeline with document embeddings
- TanStack React Query integration
- Document management system

## Important Files to Know

| File | Purpose |
|------|---------|
| `apps/api/app/api/chat/route.ts` | Main chat endpoint - entry point for all conversations |
| `apps/api/lib/salary-flow.ts` | State machine logic - controls interview flow |
| `apps/api/utils/agent/GeminiAgent.ts` | AI orchestration - manages Gemini interactions |
| `apps/api/utils/tax/TaxWrapper.ts` | Tax calculations - German income tax logic |
| `apps/api/types/form.ts` | FormState type definitions |

## Coding Conventions

- **Database:** snake_case
- **JavaScript:** camelCase
- **User-facing text:** German language
- **Progress tracking:** `[PROGRESS: N]` markers in responses
- **Validation:** Two-phase (extraction → validation)

## Security Features

- Rate limiting: 20 req/60s per IP
- Origin whitelisting per project
- Row-Level Security on all tables
- Per-project API key management

## Tax Calculation Notes

The tax engine follows BMF (Bundeszentralamt für Steuern) specifications:
- Supports 2025 and 2026 tax years
- Handles regional variations (Sachsen, East/West)
- Calculates: Lohnsteuer, Soli, Kirchensteuer, social contributions
- Tariff systems: TVöD, TV-L, AVR with experience levels (Stufe 1-6)
