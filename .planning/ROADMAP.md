# Roadmap: Gehalt-Pflege Chat Intelligence

## Milestones

- ✅ **v1.0 Document Pipeline** - Phases 1-6 (shipped 2026-01-25)
- 🚧 **v1.1 Chat Intelligence** - Phases 7-11 (in progress)

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

## 🚧 v1.1 Chat Intelligence (In Progress)

**Milestone Goal:** Enhance chatbot with conversation persistence, intelligent tool calling, suggested responses, validation improvements, and citation quality.

### Phase 7: Conversation Persistence ✅
**Goal:** Users can resume conversations across sessions, admins gain visibility into inquiry data
**Depends on:** Phase 6 (RAG Integration)
**Requirements:** CONV-01, CONV-02, CONV-03, CONV-04, CONV-05, CONV-06
**Success Criteria** (what must be TRUE):
  1. ✅ User reloads page and sees full conversation history within 1 second
  2. ✅ User closes browser, reopens days later, and conversation resumes automatically from last state
  3. ✅ Admin views structured salary inquiry data (job details, tax details, result) in dashboard
  4. ✅ Admin sees user email associated with each salary inquiry
  5. ✅ User sees visual progress indicator showing collected fields during conversation
  6. ✅ User exports conversation/result to email and receives formatted summary
**Plans:** 3 plans complete

Plans:
- [x] 07-01-PLAN.md -- Client-side conversation persistence and step progress indicator
- [x] 07-02-PLAN.md -- Admin inquiry dashboard with structured data and filters
- [x] 07-03-PLAN.md -- Email export with DOI consent and formatted result email

### Phase 8: Function Calling Enhancement
**Goal:** AI reliably executes tax calculations and tariff lookups via structured tool calls
**Depends on:** Phase 6 (RAG Integration)
**Requirements:** FUNC-01, FUNC-02, FUNC-03, FUNC-04, FUNC-05
**Success Criteria** (what must be TRUE):
  1. AI calls tax calculation tool with validated parameters (gross salary, tax class, church tax, children)
  2. AI calls tariff lookup tool and retrieves accurate salary grades for TVöD, TV-L, AVR by experience level
  3. When tool validation fails, AI receives error message and retries with corrected parameters (max 3 attempts)
  4. AI executes multiple tools in single turn when appropriate (e.g., tariff lookup then tax calculation)
  5. Tool execution results inform AI's suggested response generation
**Plans:** TBD

Plans:
- [ ] 08-01: TBD
- [ ] 08-02: TBD

### Phase 9: Suggested Response Chips
**Goal:** Users tap quick reply options instead of typing on mobile
**Depends on:** Phase 7 (Conversation Persistence - needs context for suggestions)
**Requirements:** CHIP-01, CHIP-02, CHIP-03, CHIP-04, CHIP-05
**Success Criteria** (what must be TRUE):
  1. AI generates 2-4 contextual quick reply chips below each bot message
  2. User taps chip and selected text submits as user message automatically
  3. Chips have touch-friendly sizing (min 44x44px tap target) on mobile devices
  4. Suggestions adapt to state machine stage (tariff options in job_details, yes/no in confirmation)
  5. Chips display common values for known fields (Steuerklasse 1-6, TVöD/TV-L/AVR)
**Plans:** TBD

Plans:
- [ ] 09-01: TBD
- [ ] 09-02: TBD

### Phase 10: Validation Improvements
**Goal:** Data extraction is reliable with user-friendly German error messages
**Depends on:** Phase 8 (Function Calling Enhancement - validation applies to tool parameters)
**Requirements:** VALD-01, VALD-02, VALD-05
**Success Criteria** (what must be TRUE):
  1. Data extraction uses two-phase validation (LLM extracts -> Zod schema validates before accepting)
  2. Validation errors display user-friendly German messages (e.g., "Steuerklasse muss zwischen 1 und 6 liegen")
  3. When validation fails, AI re-prompts user with specific correction request referencing the error
**Plans:** TBD

Plans:
- [ ] 10-01: TBD

### Phase 11: Citation Quality Enhancement
**Goal:** RAG responses include document name and page number for trust
**Depends on:** Phase 6 (RAG Integration - enhances existing citations)
**Requirements:** VALD-03, VALD-04
**Success Criteria** (what must be TRUE):
  1. RAG citations include document name in response (e.g., "[TVoD_2025.pdf]")
  2. RAG citations include page number when available (e.g., "[TVoD_2025.pdf, S. 12]")
**Plans:** TBD

Plans:
- [ ] 11-01: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 7 -> 8 -> 9 -> 10 -> 11

**Parallelization opportunities:**
- Phase 7 and Phase 8 can run in parallel (independent components)
- Phase 9 depends on Phase 7 (needs conversation context)
- Phase 10 and Phase 11 can run in parallel after Phase 8 complete

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Database & Storage Foundation | v1.0 | 1/1 | Complete | 2026-01-25 |
| 2. Atomic File Operations | v1.0 | 3/3 | Complete | 2026-01-25 |
| 3. Status & Error Tracking | v1.0 | 3/3 | Complete | 2026-01-25 |
| 4. Durable Document Processing | v1.0 | 4/4 | Complete | 2026-01-25 |
| 5. Error Recovery | v1.0 | 1/1 | Complete | 2026-01-25 |
| 6. RAG Integration | v1.0 | 2/2 | Complete | 2026-01-25 |
| 7. Conversation Persistence | v1.1 | 3/3 | Complete | 2026-01-27 |
| 8. Function Calling Enhancement | v1.1 | 0/TBD | Not started | - |
| 9. Suggested Response Chips | v1.1 | 0/TBD | Not started | - |
| 10. Validation Improvements | v1.1 | 0/TBD | Not started | - |
| 11. Citation Quality Enhancement | v1.1 | 0/TBD | Not started | - |

---

*Roadmap created: 2026-01-26*
*Last updated: 2026-01-27*
