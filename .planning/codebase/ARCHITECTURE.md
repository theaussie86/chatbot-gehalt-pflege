# Architecture

**Analysis Date:** 2026-01-23

## Pattern Overview

**Overall:** Event-driven state machine with multi-layer AI orchestration

**Key Characteristics:**
- Hybrid state machine + agent pattern for guided salary calculation interviews
- Three-phase form collection (job details → tax details → summary) with validation guardrails
- RAG (Retrieval-Augmented Generation) pipeline for document context injection
- Separate concern layers: state management, AI orchestration, tax calculation, data validation
- Multi-tenant architecture with per-project API keys and domain whitelisting

## Layers

**Presentation Layer (Frontend):**
- Purpose: Interactive chatbot UI with progress tracking and real-time message display
- Location: `apps/web/`
- Contains: React components, message rendering, user input handling
- Depends on: Gemini API via `sendMessageToGemini` service
- Used by: End users embedding the widget

**API Route Layer (Request Handler):**
- Purpose: HTTP endpoint orchestration, security checks, state persistence
- Location: `apps/api/app/api/chat/route.ts`
- Contains: Rate limiting, origin validation, project authentication, request/response routing
- Depends on: State machine, AI agents, tax calculator, Supabase
- Used by: Frontend chatbot, external embeddings

**State Machine Layer:**
- Purpose: Finite state automation with field validation and phase transitions
- Location: `apps/api/lib/salary-flow.ts`
- Contains: `SalaryStateMachine` class with state definitions, transition logic, field requirement tracking
- Depends on: FormState type definitions
- Used by: Chat endpoint for determining next required fields and progress

**AI Orchestration Layer:**
- Purpose: LLM interaction, intent analysis, data extraction, validation
- Location: `apps/api/utils/agent/`
- Contains:
  - `GeminiAgent.ts` - Main Gemini API client with tool execution
  - `ConversationAnalyzer.ts` - Intent detection (keyword + LLM fallback)
  - `ResponseValidator.ts` - Field validation with vectorstore enrichment + LLM normalization
- Depends on: Gemini 2.5 Flash, Vectorstore service
- Used by: Chat endpoint for response generation and data extraction

**Tax Calculation Layer:**
- Purpose: German income tax computation per BMF specifications
- Location: `apps/api/utils/tax/`
- Contains:
  - `TaxWrapper.ts` - Orchestration layer mapping FormState to calculations
  - `Lohnsteuer2025.ts` / `Lohnsteuer2026.ts` - Year-specific BMF algorithm implementations
  - `TaxUtils.ts` - Helper functions for BigDecimal math
- Depends on: FormState data
- Used by: Chat endpoint when transitioning to completed state

**Data Validation & Enrichment Layer:**
- Purpose: Field normalization, RAG-based context enrichment, LLM validation
- Location: `apps/api/lib/vectorstore/` and `apps/api/utils/agent/ResponseValidator.ts`
- Contains:
  - `VectorstoreService.ts` - Document embedding search, text chunking, caching
  - Validation rules per field (tarif, group, state, taxClass, etc.)
- Depends on: Supabase (document storage + embeddings), Gemini Text Embedding
- Used by: ResponseValidator for enriching user input

**Database Layer:**
- Purpose: User data, project configuration, document storage, audit logs
- Location: Supabase (PostgreSQL with RLS)
- Contains: Projects, documents, salary_inquiries, request_logs tables
- Depends on: Supabase SDK client
- Used by: All services requiring persistence

**Admin Dashboard Layer:**
- Purpose: Project management, document uploads, widget testing
- Location: `apps/api/app/(admin)/`
- Contains: Protected routes for projects, documents, embed configuration
- Depends on: Supabase Auth, server actions
- Used by: Administrators managing chatbot instances

## Data Flow

**Guided Interview Flow:**

1. **User sends message** → `POST /api/chat` with `{ message, history, projectId, currentFormState }`
2. **Security validation** → Rate limiting (20 req/60s), origin whitelisting, project lookup
3. **Intent analysis** → `ConversationAnalyzer.analyzeIntent()` classifies as: data, question, modification, confirmation, unclear
4. **Conditional routing** based on intent:
   - **data_provision** → Extract fields via Gemini JSON, validate each with `ResponseValidator`
   - **question** → Query vectorstore, generate answer, return to interview
   - **modification** (in summary) → Detect which field to change, re-validate, show updated summary
   - **confirmation** (in summary) → Trigger tax calculation, save results, transition to completed
5. **State machine advance** → `SalaryStateMachine.getNextStep()` determines next phase
6. **Response generation** → Build user-friendly prompt, call Gemini 2.5 Flash
7. **Return** → `{ text: responseText, formState: nextFormState }`

**State Transitions:**

```
job_details (tarif, experience, hours, state)
    ↓ [all fields collected]
tax_details (taxClass, churchTax, numberOfChildren)
    ↓ [all fields collected]
summary (user reviews data)
    ↓ [user confirms]
completed (calculation displayed)
    ↓ [user can ask follow-up questions]
```

**State Management:**

- `FormState` object maintained in frontend, sent with each request
- Backend validates and mutates only on valid transitions
- `missingFields` array acts as guardrail—responses only proceed if satisfied
- `conversationContext` keeps last 10 messages for coherence
- `validationErrors` collected and returned for user clarification

## Key Abstractions

**FormState:**
- Purpose: Single source of truth for interview progress and collected data
- Location: `apps/api/types/form.ts`
- Structure: `{ section, data: { job_details, tax_details, calculation_result }, missingFields, conversationContext, userIntent, validationErrors }`
- Pattern: Immutable JSON serialization for reliable state transmission

**SalaryStateMachine:**
- Purpose: Declarative state definition and transition logic
- Location: `apps/api/lib/salary-flow.ts`
- Methods: `isPhaseComplete()`, `canTransition()`, `getNextStep()`, `getProgress()`, `formatSummary()`
- Pattern: Static class with pure functions (no side effects on input)

**GeminiAgent:**
- Purpose: Encapsulate Gemini API interaction, tool execution, history management
- Location: `apps/api/utils/agent/GeminiAgent.ts`
- Methods: `sendMessage(message, history, contextDocuments)` with built-in tool calling for salary calculations
- Pattern: Single responsibility—only handles AI communication

**TaxWrapper:**
- Purpose: Adapter between FormState data and BMF tax algorithm inputs
- Location: `apps/api/utils/tax/TaxWrapper.ts`
- Methods: `calculate(salaryInput)` returns `{ netto, taxes, socialSecurity }`
- Pattern: Year-agnostic orchestration delegating to year-specific calculators

**VectorstoreService:**
- Purpose: RAG pipeline for document-based knowledge enrichment
- Location: `apps/api/lib/vectorstore/VectorstoreService.ts`
- Methods: `query(message, projectId)`, `enrichValue(field, value, projectId)`, `splitTextIntoChunks()`
- Pattern: Lazy caching with timestamp-based invalidation

## Entry Points

**Chat API Endpoint:**
- Location: `apps/api/app/api/chat/route.ts`
- Triggers: POST requests from web widget or external systems
- Responsibilities:
  - HTTP request parsing and validation
  - Rate limiting and security checks
  - Orchestrating state machine + AI workflow
  - Response formatting with [PROGRESS: N] and [JSON_RESULT: {...}] markers

**Web Widget:**
- Location: `apps/web/src/App.tsx`
- Triggers: Browser page load with embeddable script
- Responsibilities:
  - Render chatbot UI with message history
  - Handle user input and send to `/api/chat`
  - Parse response markers ([PROGRESS], [OPTIONS], [JSON_RESULT])
  - Manage local message state and progress display

**Admin Dashboard:**
- Location: `apps/api/app/(admin)/`
- Triggers: Authenticated user navigation
- Responsibilities:
  - Project CRUD and API key management
  - Document upload and embedding processing
  - Widget configuration and testing

## Error Handling

**Strategy:** Layered with graceful degradation and user-friendly messaging

**Patterns:**

- **Validation errors:** Stored in `FormState.validationErrors`, returned to LLM for clarification prompts
- **API errors:** Try-catch at endpoint, return 500 with error message
- **LLM failures:** Fallback prompts instruct user to retry or provides alternatives
- **Rate limiting:** Return 429 status, client-side backoff
- **Authentication failures:** Return 401/403, client redirects to login
- **Missing fields:** State machine guards prevent transition; reprompt user for missing data
- **Calculation errors:** Wrapped in try-catch, user receives apology message and data review request

**Logging:** Console logs with `[StateMachine]`, `[GeminiAgent]`, `[ResponseValidator]` prefixes for debugging

## Cross-Cutting Concerns

**Logging:** Console.log with contextual prefixes (no structured logging framework configured)

**Validation:** Two-phase approach:
- Phase 1 (extraction): Gemini JSON mode to structure user input
- Phase 2 (enrichment + validation): LLM normalization + vectorstore context + rule checking

**Authentication:**
- Admin routes: Supabase Auth (Google OAuth)
- Chat endpoint: Project ID + optional API key (no user auth required for widget embeds)

**Security:**
- Rate limiting: IP-based 20 requests per 60 seconds
- Origin whitelisting: Per-project allowed origins list
- API keys: Project public keys (client-safe), service role key (server-only)
- RLS: Supabase enforces per-project data isolation

**Caching:**
- Vectorstore uses `Map<string, { answer, timestamp }>` for query results
- No other caching layer (consider adding Redis for production scale)

---

*Architecture analysis: 2026-01-23*
