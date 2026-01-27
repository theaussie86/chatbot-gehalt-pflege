# Requirements: Gehalt-Pflege Chat Intelligence

**Defined:** 2026-01-26
**Core Value:** Documents uploaded by admins must reliably become searchable context for the chatbot — no orphaned files, no missing embeddings, no data loss.

## v1.1 Requirements

Requirements for Chat Intelligence milestone. Each maps to roadmap phases.

### Conversation Persistence

- [ ] **CONV-01**: User conversation persists in browser storage across page refreshes
- [ ] **CONV-02**: User can resume previous conversation session automatically
- [ ] **CONV-03**: Admin can view structured salary inquiry data (job details, tax details, calculated result)
- [ ] **CONV-04**: Admin can see user email associated with salary inquiry
- [ ] **CONV-05**: User sees visual progress of collected data during conversation
- [ ] **CONV-06**: User can export conversation/result to email

### Function Calling

- [ ] **FUNC-01**: AI calls tax calculation tool with structured parameters (gross salary, tax class, church tax, children)
- [ ] **FUNC-02**: AI calls tariff lookup tool to retrieve salary grades (TVöD, TV-L, AVR by Stufe/experience)
- [ ] **FUNC-03**: Validation errors from tools are returned to AI for retry with corrected parameters
- [ ] **FUNC-04**: AI can execute multiple tools in a single turn when needed
- [ ] **FUNC-05**: Tool results inform suggested response generation

### Suggested Responses

- [ ] **CHIP-01**: AI generates 2-4 quick reply chip options dynamically
- [ ] **CHIP-02**: Chips are clickable and send the selected text as user message
- [ ] **CHIP-03**: Chips have touch-friendly sizing for mobile devices
- [ ] **CHIP-04**: Suggestions are context-aware based on current state machine stage
- [ ] **CHIP-05**: Chips show common values for known fields (tax classes, tariff systems)

### Validation & Citation Quality

- [ ] **VALD-01**: Data extraction uses two-phase validation (LLM extraction → Zod schema validation)
- [ ] **VALD-02**: Validation errors display user-friendly German messages
- [ ] **VALD-03**: RAG citations include document name in response
- [ ] **VALD-04**: RAG citations include page number when available
- [ ] **VALD-05**: Validation errors guide AI to re-prompt user with specific correction request

## v1.2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### Advanced Analytics

- **ANLY-01**: Admin dashboard shows conversation completion rates
- **ANLY-02**: Admin can filter salary inquiries by date range, tariff system
- **ANLY-03**: Aggregate statistics (avg salary by region, common tax classes)

### Conversation Enhancement

- **CONV-07**: Multi-device sync via server-side storage
- **CONV-08**: Conversation summarization for long sessions

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| User authentication | Chatbot is anonymous, email collected optionally |
| Real-time chat (websockets) | Polling/request-response sufficient for salary calculator |
| Voice input | Text-based interface meets user needs |
| Multi-language support | German-only for German nursing salary calculator |
| Conversation branching | Linear flow sufficient for salary interview |
| Custom embedding models | text-embedding-004 meets quality requirements |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| CONV-01 | Phase 7 | Pending |
| CONV-02 | Phase 7 | Pending |
| CONV-03 | Phase 7 | Pending |
| CONV-04 | Phase 7 | Pending |
| CONV-05 | Phase 7 | Pending |
| CONV-06 | Phase 7 | Pending |
| FUNC-01 | Phase 8 | Pending |
| FUNC-02 | Phase 8 | Pending |
| FUNC-03 | Phase 8 | Pending |
| FUNC-04 | Phase 8 | Pending |
| FUNC-05 | Phase 8 | Pending |
| CHIP-01 | Phase 9 | Pending |
| CHIP-02 | Phase 9 | Pending |
| CHIP-03 | Phase 9 | Pending |
| CHIP-04 | Phase 9 | Pending |
| CHIP-05 | Phase 9 | Pending |
| VALD-01 | Phase 10 | Pending |
| VALD-02 | Phase 10 | Pending |
| VALD-05 | Phase 10 | Pending |
| VALD-03 | Phase 11 | Pending |
| VALD-04 | Phase 11 | Pending |

**Coverage:**
- v1.1 requirements: 21 total
- Mapped to phases: 21 (100%)
- Unmapped: 0

**Phase coverage:**
- Phase 7 (Conversation Persistence): 6 requirements (CONV-01 through CONV-06)
- Phase 8 (Function Calling): 5 requirements (FUNC-01 through FUNC-05)
- Phase 9 (Suggested Response Chips): 5 requirements (CHIP-01 through CHIP-05)
- Phase 10 (Validation Improvements): 3 requirements (VALD-01, VALD-02, VALD-05)
- Phase 11 (Citation Quality): 2 requirements (VALD-03, VALD-04)

---
*Requirements defined: 2026-01-26*
*Last updated: 2026-01-26 after roadmap creation*
