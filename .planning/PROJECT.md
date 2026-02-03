# Gehalt-Pflege Chatbot

## What This Is

An AI-powered conversational salary calculator for German nursing professionals. The chatbot guides users through a structured interview to collect job and tax information, then calculates net income based on German public service tariff systems (TVöD, TV-L, AVR). Admins upload context documents that become searchable RAG context, and can view structured inquiry data with source citations.

## Core Value

Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

## Current State (v1.1 shipped)

**Shipped:** 2026-02-03

**What v1.1 delivered:**
- Conversation persistence via localStorage with auto-resume across sessions
- StepBar visual progress indicator showing collected fields during interview
- Admin inquiry dashboard with expandable detail views and citation display
- Email export with DOI consent form and formatted HTML emails via Resend
- Function calling with Zod-validated tariff lookup and tax calculation tools
- Real salary tables for TVöD, TV-L, AVR (P5-P15, E5-E15 groups)
- Touch-friendly suggestion chips (44x44px) with tap-to-fill behavior
- Two-phase validation (LLM extraction → Zod schema) with German error messages
- Escalation chips after 3 validation failures with German field labels
- Admin-only RAG citations with document names and page numbers

**What v1.0 delivered:**
- Atomic file operations (upload/delete/download with rollback)
- Real-time status tracking (pending → processing → embedded/error)
- Durable document processing via Inngest with automatic retries
- Error recovery (reprocess without re-uploading, error history)
- RAG-augmented chat with source citations

**Tech stack:**
- Next.js + Supabase (PostgreSQL, Storage, Realtime)
- Inngest for durable background processing
- Gemini 2.0 Flash for chat + Gemini 2.5 Flash for text extraction
- text-embedding-004 for 768-dim embeddings
- Resend for transactional emails
- ~740,000 LOC TypeScript (full monorepo)

## Requirements

### Validated

**v1.0 — Document Pipeline:**
- FILE-01: Admin can upload documents (PDF, text, spreadsheets) with size/type validation — v1.0
- FILE-02: Admin can delete document atomically (storage + DB + chunks) — v1.0
- FILE-03: Admin can download document via time-limited signed URL — v1.0
- STAT-01: Document status reflects pipeline state — v1.0
- STAT-02: Failed documents store error message — v1.0
- STAT-03: Admin UI displays document status with visual indicators — v1.0
- ERR-01: Admin can reprocess failed documents — v1.0
- ERR-02: Upload failure rolls back storage file — v1.0
- ERR-03: Delete failure is atomic — v1.0
- EDGE-01: Defensive embedding parsing — v1.0
- EDGE-02: Promise.allSettled for batch tolerance — v1.0
- EDGE-03: Durable steps with automatic retries — v1.0
- EDGE-04: Chunks inserted with correct embeddings — v1.0
- DB-01: Cascade delete for chunks — v1.0
- DB-02: Service role RLS for chunk insertion — v1.0
- DB-03: error_details JSONB column — v1.0

**v1.1 — Chat Intelligence:**
- CONV-01: User conversation persists in browser storage across page refreshes — v1.1
- CONV-02: User can resume previous conversation session automatically — v1.1
- CONV-03: Admin can view structured salary inquiry data — v1.1
- CONV-04: Admin can see user email associated with salary inquiry — v1.1
- CONV-05: User sees visual progress of collected data during conversation — v1.1
- CONV-06: User can export conversation/result to email — v1.1
- FUNC-01: AI calls tax calculation tool with structured parameters — v1.1
- FUNC-02: AI calls tariff lookup tool to retrieve salary grades — v1.1
- FUNC-03: Validation errors from tools returned to AI for retry — v1.1
- FUNC-04: AI can execute multiple tools in single turn — v1.1
- FUNC-05: Tool results inform suggested response generation — v1.1
- CHIP-01: AI generates 2-4 quick reply chip options dynamically — v1.1
- CHIP-02: Chips clickable and send selected text as user message — v1.1
- CHIP-03: Chips have touch-friendly sizing for mobile devices — v1.1
- CHIP-04: Suggestions context-aware based on state machine stage — v1.1
- CHIP-05: Chips show common values for known fields — v1.1
- VALD-01: Data extraction uses two-phase validation — v1.1
- VALD-02: Validation errors display user-friendly German messages — v1.1
- VALD-03: RAG citations include document name — v1.1
- VALD-04: RAG citations include page number when available — v1.1
- VALD-05: Validation errors guide AI to re-prompt user — v1.1

### Active

**Milestone v1.2 — Advanced Analytics (planned)**

- [ ] Admin dashboard shows conversation completion rates (ANLY-01)
- [ ] Admin can filter salary inquiries by date range, tariff system (ANLY-02)
- [ ] Aggregate statistics (avg salary by region, common tax classes) (ANLY-03)
- [ ] Multi-device sync via server-side storage (CONV-07)
- [ ] Conversation summarization for long sessions (CONV-08)

### Out of Scope

- User authentication — chatbot is anonymous, email collected optionally
- Real-time chat (websockets) — polling/request-response sufficient
- Voice input — text-based interface meets user needs
- Multi-language support — German-only for German nursing salary calculator
- Conversation branching — linear flow sufficient for salary interview
- Custom embedding models — text-embedding-004 meets quality requirements
- File versioning — users can delete and re-upload
- Format conversion — Gemini handles PDF, DOCX, TXT natively

## Context

**Current codebase:**
- v1.0 Document Pipeline + v1.1 Chat Intelligence complete
- 37/37 total requirements satisfied (16 v1.0 + 21 v1.1)
- Zero tech debt from v1.0 or v1.1
- ~740,000 LOC TypeScript (full monorepo)

**Known issues:** None — all P0/P1 concerns addressed in v1.1

**Technical environment:**
- Inngest for durable background processing
- 768-dim embeddings via text-embedding-004
- 2000 char chunks with 100 char overlap
- 0.75 similarity threshold for RAG quality
- localStorage for conversation persistence
- Zod schemas as single source of truth for validation
- Session-based retry tracking with 30-min TTL

## Constraints

- **Platform**: Next.js + Supabase (PostgreSQL, Storage, Realtime, RLS)
- **LLM Provider**: Vertex AI / Google Gemini
- **Storage**: Supabase Storage bucket `project-files`
- **Sync**: Compensating actions for atomicity (no distributed transactions)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Inngest over Edge Functions | Better durability, retries, observability | Good |
| DB-first delete pattern | Prevents orphaned DB records on storage failure | Good |
| Service role RLS via JWT claim | Edge function has NULL auth.uid() | Good |
| Promise.allSettled for batches | Partial failure tolerance | Good |
| Error history as array | Preserve retry attempts for debugging | Good |
| 0.75 similarity threshold | Filter low-quality RAG matches | Good |
| Compensating actions over transactions | Supabase doesn't support cross-service transactions | Good |
| Sequential bulk delete | Per-document atomicity, partial success reporting | Good |
| 5-minute signed URL expiry | Security-first approach | Good |
| 2000 char chunks / 100 overlap | Balances coherence with retrieval granularity | Good |
| localStorage over Dexie.js | Simpler for <100 messages per conversation | Good |
| Zod schemas as single source of truth | Tool validation AND Gemini function declarations | Good |
| Hybrid suggestion approach | Predefined chips for known fields, AI for open questions | Good |
| Two-phase validation flow | LLM extraction → Zod validation → German errors | Good |
| Admin-only citations | Store for traceability, hide from user responses | Good |
| Inquiry ID flow | Precise single-row DB update via .eq('id', inquiryId) | Good |
| 44x44px tap targets | Mobile accessibility compliance | Good |
| Escalation chips after 3 failures | User-friendly error recovery | Good |

---
*Last updated: 2026-02-03 after v1.1 milestone*
