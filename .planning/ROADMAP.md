# Roadmap: Gehalt-Pflege Chat Intelligence

## Milestones

- ✅ **v1.0 Document Pipeline** - Phases 1-6 (shipped 2026-01-25)
- ✅ **v1.1 Chat Intelligence** - Phases 7-11 (shipped 2026-02-03)

## Overview

The v1.1 Chat Intelligence milestone transforms the chatbot from a stateless interview into an intelligent conversational partner. Users gain conversation persistence across sessions, AI-powered suggested responses reduce typing friction, enhanced function calling enables structured tool interactions, validation improvements ensure data quality, and citation quality adds trustworthy source references. This builds on v1.0's RAG foundation to create a production-ready conversational salary calculator.

## Phases

<details>
<summary>✅ v1.0 Document Pipeline (Phases 1-6) - SHIPPED 2026-01-25</summary>

### Phase 1: Database & Storage Foundation
**Goal:** Establish data layer for document management
**Plans:** 1 plan complete

Plans:
- [x] 01-01: Database schema and storage setup

### Phase 2: Atomic File Operations
**Goal:** Upload and delete documents reliably
**Plans:** 3 plans complete

Plans:
- [x] 02-01: Atomic upload with rollback
- [x] 02-02: Atomic delete (storage + DB + chunks)
- [x] 02-03: Signed URL download

### Phase 3: Status & Error Tracking
**Goal:** Real-time visibility into document pipeline state
**Plans:** 3 plans complete

Plans:
- [x] 03-01: Status state machine
- [x] 03-02: Error message storage
- [x] 03-03: Admin UI status indicators

### Phase 4: Durable Document Processing
**Goal:** Reliable background processing with automatic retries
**Plans:** 4 plans complete

Plans:
- [x] 04-01: Inngest pipeline setup
- [x] 04-02: Text extraction via Gemini
- [x] 04-03: Embedding generation
- [x] 04-04: Chunk storage with embeddings

### Phase 5: Error Recovery
**Goal:** Admin can recover from failures without re-upload
**Plans:** 1 plan complete

Plans:
- [x] 05-01: Reprocess failed documents

### Phase 6: RAG Integration
**Goal:** Chatbot answers questions with document citations
**Plans:** 2 plans complete

Plans:
- [x] 06-01: Vector search with similarity threshold
- [x] 06-02: Response generation with source citations

</details>

<details>
<summary>✅ v1.1 Chat Intelligence (Phases 7-11) - SHIPPED 2026-02-03</summary>

**Milestone Goal:** Enhance chatbot with conversation persistence, intelligent tool calling, suggested responses, validation improvements, and citation quality.

- [x] Phase 7: Conversation Persistence (3/3 plans) — completed 2026-01-27
- [x] Phase 8: Function Calling Enhancement (2/2 plans) — completed 2026-02-03
- [x] Phase 9: Suggested Response Chips (2/2 plans) — completed 2026-02-03
- [x] Phase 10: Validation Improvements (2/2 plans) — completed 2026-02-03
- [x] Phase 11: Citation Quality Enhancement (2/2 plans) — completed 2026-02-03

**Archive:** See `.planning/milestones/v1.1-ROADMAP.md` for full details.

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database & Storage Foundation | v1.0 | 1/1 | Complete | 2026-01-25 |
| 2. Atomic File Operations | v1.0 | 3/3 | Complete | 2026-01-25 |
| 3. Status & Error Tracking | v1.0 | 3/3 | Complete | 2026-01-25 |
| 4. Durable Document Processing | v1.0 | 4/4 | Complete | 2026-01-25 |
| 5. Error Recovery | v1.0 | 1/1 | Complete | 2026-01-25 |
| 6. RAG Integration | v1.0 | 2/2 | Complete | 2026-01-25 |
| 7. Conversation Persistence | v1.1 | 3/3 | Complete | 2026-01-27 |
| 8. Function Calling Enhancement | v1.1 | 2/2 | Complete | 2026-02-03 |
| 9. Suggested Response Chips | v1.1 | 2/2 | Complete | 2026-02-03 |
| 10. Validation Improvements | v1.1 | 2/2 | Complete | 2026-02-03 |
| 11. Citation Quality Enhancement | v1.1 | 2/2 | Complete | 2026-02-03 |

---

*Roadmap created: 2026-01-26*
*Last updated: 2026-02-03 (v1.1 milestone archived)*
