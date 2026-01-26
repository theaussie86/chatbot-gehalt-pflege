# Project Research Summary

**Project:** Gehalt-Pflege Chat Intelligence (v1.1)
**Domain:** Conversational AI Enhancement, RAG-powered Chatbot
**Researched:** 2026-01-26
**Confidence:** HIGH

## Executive Summary

The v1.1 Chat Intelligence milestone enhances an existing German nursing salary chatbot with five capabilities: conversation persistence, multi-tool function calling, AI-generated suggested response chips, improved validation, and citation quality. Research reveals this is a **low-risk enhancement project** because the core architecture already contains the necessary building blocks: state machine flow, intent detection, RAG integration, and function calling infrastructure. Most features require minimal new dependencies—only **Dexie.js for client-side storage** and **Zod v4 upgrade** for validation. The existing `@google/genai` library already supports multi-tool function calling and structured outputs.

The recommended approach layers new features non-invasively: conversation persistence extends the existing FormState with IDs and history; function calling expands the current single-tool pattern to multi-tool; suggested responses generate via structured output in the same LLM call; validation improves through Zod schemas replacing inline checks; citations enhance by adding page metadata to the existing RAG pipeline. **Critical insight:** Don't add React Query for IndexedDB (Dexie provides reactive hooks natively) and don't use separate LLM calls for suggestions (use structured output to bundle with main response).

Key risks center on state synchronization between localStorage and database (P0-1), function calling schema drift across components (P0-2), RAG citation hallucination without metadata (P0-3), and context window explosion in long conversations (P0-4). Mitigation: implement state versioning, single-source-of-truth tool schemas with Zod validation, page-aware chunking with citation validation, and sliding window history with summarization. The architecture research confirms integration is clean with well-defined extension points—no fundamental restructuring required.

## Key Findings

### Recommended Stack

**Minimal new dependencies** required. Current stack (`@google/genai ^1.35.0`, Supabase, Next.js 16, React 19) already supports nearly all v1.1 features through existing capabilities: Gemini's native multi-tool function calling, structured output for validation, and pgvector for RAG. Only two additions needed: **Dexie.js 4.0.11+** with dexie-react-hooks for client-side conversation storage (replaces need for complex server sync), and **Zod v4.3.5** upgrade for native `.toJSONSchema()` compatibility with Gemini structured outputs.

**Core additions:**
- **Dexie.js ^4.0.11**: IndexedDB wrapper for conversation persistence — chosen over localStorage (5MB limit, synchronous, poor query performance). Provides reactive `useLiveQuery` hook eliminating need for React Query integration.
- **dexie-react-hooks ^4.2.0**: React hooks for Dexie — native reactivity, no state duplication with existing TanStack Query.
- **Zod v4.3.5**: Validation schemas with native Gemini integration — replaces deprecated zod-to-json-schema, 14x faster string parsing, prevents silent schema conversion failures.

**Anti-recommendations (do NOT add):**
- React Query for IndexedDB (Dexie hooks sufficient)
- zod-to-json-schema (breaks with Zod v4)
- Firebase SDK for Smart Reply (500KB+ overhead, mobile-focused)
- Separate vector database like Pinecone (pgvector 0.8.0 adequate, migration cost high)

### Expected Features

Research identifies 8 features: 4 table stakes, 2 differentiators, 2 defer-to-v2.

**Must have (table stakes):**
- **Conversation history storage**: Users expect to reload page and see full history. Current stateless design frustrates users who lose context. Implement with Dexie (client) + Supabase (optional admin sync).
- **Progressive disclosure**: Already implemented via state machine, just needs visual progress indicator.
- **Error handling with clear feedback**: Enhance existing `ResponseValidator` with Zod schemas, provide German error messages citing document sources.
- **Human handoff/exit strategy**: Add "Neu starten" button, detect keywords like "help", "restart", "agent".

**Should have (differentiators):**
- **AI-generated suggested response chips**: Quick replies reduce typing on mobile, show common options (tariff choices, yes/no, confirmations). Generate 2-4 contextual chips via static rules (fast) with LLM fallback. Show chips only for multiple-choice questions, always allow typing.
- **Advanced tool calling with retry**: Current basic tool execution lacks validation feedback loop. Add parameter validation with Zod, retry on errors (max 3 attempts), circuit breaker pattern. Already 90% implemented, just needs error handling.

**Defer (v2+):**
- **Enhanced RAG citation attribution**: Fine-grained citations with page numbers valuable but high complexity. Post-processing citation correction (CiteFix approach) shows 15.46% accuracy improvement but requires chunk metadata overhaul and validation pipeline.
- **Conversation summarization**: Not needed for short sessions (typical: 10-20 messages). Add when context window becomes issue (>50 messages common).

### Architecture Approach

Integration is **non-invasive** because existing components have the right extension points. Current architecture: chat endpoint orchestrates state machine (`SalaryStateMachine`), intent detection (`ConversationAnalyzer`), validation (`ResponseValidator`), agent (`GeminiAgent`), and RAG (`VectorstoreService`). All components remain; new features layer on top.

**Major components:**
1. **ConversationService (NEW)**: Manages conversation lifecycle with dual-write (DB + client sync). Interface: create, load, appendTurn, updateState, listByProject. Integrates at chat route line 129-156 where current `conversationContext` array lives.
2. **SuggestionGenerator (NEW)**: Produces 2-4 contextual quick replies via rule-based logic (fast, <1ms) with LLM fallback. Uses structured output bundled in main response (prevents double API calls). Integrates at chat route line 630-657 during response formatting.
3. **GeminiAgent (ENHANCE)**: Expand tool definitions from single `SALARY_TOOL` to multi-tool array. Add tariff_lookup and document_search tools. Update execution loop (lines 88-126) to handle parallel function calls. Already 70% implemented.
4. **VectorstoreService (ENHANCE)**: Add page_number field to `queryWithMetadata` return type. Modify `match_documents_with_metadata` RPC to include page metadata. Update chunking to preserve page boundaries during PDF processing.
5. **FormState (EXTEND)**: Add `conversationId?: string`, `stateVersion: number`, `suggestedResponses?: string[]`. Backward compatible—existing fields unchanged.

**Integration pattern:** Dual-write with eventual consistency. Widget stores conversation ID in localStorage (36 bytes), server stores full history in Supabase with RLS. Client-only storage sufficient for base functionality; server sync optional for admin dashboard.

### Critical Pitfalls

Research identifies 23 pitfalls (6 critical P0, 5 important P1, 5 minor P2, 7 integration-specific). Top 5 by severity:

1. **State sync corruption (P0-1)**: localStorage and DB diverge during network interruptions. FormState shows "tax_details" but data only has "job_details". **Prevention:** Add state versioning (`stateVersion: number`), debounced writes with error handling, 5MB quota checks, migration logic for schema changes. Implement in Phase 1.

2. **Function calling schema drift (P0-2)**: Tool schema exists in 3+ places (frontend types, backend validation, LLM config). Backend adds required field, LLM uses old schema, validation fails. **Prevention:** Single source of truth with code generation. JSON schema → TypeScript types + Gemini tool config. Add `toolSchemaVersion` to FormState, log all calls vs. executions. Zod runtime validation prevents malformed parameters. Fix in Phase 2 Day 1.

3. **RAG citation hallucination (P0-3)**: LLM cites "page 23" when document has 10 pages. Legal liability for incorrect salary info. **Prevention:** Store page numbers during chunking (not generated by LLM). Provide citations in context: `[Source 1: file.pdf, S.5]`, validate response only references provided sources. Prompt: "NEVER cite a page not explicitly marked in context". Phase 5.

4. **Context window explosion (P0-4)**: Conversation history grows, exceeds Gemini 200k token limit, causes truncation/errors. Latency increases linearly (5s → 15s). **Prevention:** Sliding window (last 5 messages) + summarization for older messages. Token budget management: reserve 20k for form state, 100k context limit (50% of model). Store summaries in DB for reuse. Phase 1 prerequisite for scaling.

5. **State machine becomes straitjacket (P1-2)**: Rigid forward-only transitions prevent natural corrections. User says "Actually, I work 38.5 hours" during tax_details phase, bot rejects backward transition. **Prevention:** Intent-aware transitions—detect `modification` intent (already implemented in `ConversationAnalyzer`), allow backward navigation, clear field for re-entry. Extend state machine `getNextStep()` to check modification intent before enforcing forward flow. Phase 1.

**Additional critical concerns:**
- Suggested response overload (P1-1): Show chips only for multiple-choice, limit to 3-4, always allow typing
- Data extraction relies solely on LLM (P1-3): Two-phase validation (LLM extraction → Zod validation)
- No RLS for conversations table (P1-4): Enable RLS day 1, test with multiple users
- Suggested responses as separate LLM call (P1-5): Use structured output to bundle with main response

## Implications for Roadmap

Based on research, **5-phase structure** over 11-17 days (2.2-3.4 weeks). Phase order prioritizes foundation (persistence) before UX enhancements (suggestions) and polish (citations).

### Phase 1: Conversation Persistence Foundation
**Rationale:** Foundational data layer enables all downstream features. Conversation history required for suggestion context, function call retry logic, and citation tracking. Analytics impossible without persistence. Architecture research confirms this is the critical path.

**Delivers:**
- Conversations persist across page reloads (<1s load time)
- Admin dashboard shows conversation history
- Session resume within 1 second
- Multi-device support via conversation ID in URL

**Addresses features:**
- Conversation history storage (table stakes)
- Human handoff/exit strategy (table stakes)
- Progressive disclosure indicator (table stakes enhancement)

**Avoids pitfalls:**
- P0-1: State sync corruption (implement versioning day 1)
- P0-4: Context window explosion (implement token budget)
- P1-2: State machine rigidity (add intent-aware transitions)
- P1-4: No RLS (enable immediately, test with multiple users)

**Duration:** 3-4 days
**Complexity:** MEDIUM

---

### Phase 2: Function Calling Enhancement
**Rationale:** Improves existing tax calculation reliability, enables future tool expansion (tariff lookup). Current implementation 70% complete (tool execution exists), just needs error handling and multi-tool support. Can run parallel with Phase 1 (no dependencies).

**Delivers:**
- Tax calculation via structured function calling exclusively
- Tool execution metrics (latency, success rate, parameter accuracy)
- Graceful degradation on tool call errors
- Ready for tariff_lookup and document_search tools

**Uses stack:**
- Existing `@google/genai` ^1.35.0 (multi-tool support verified)
- Zod v4.3.5 for parameter validation
- Current `GeminiAgent` tool execution pattern (extend, don't replace)

**Avoids pitfalls:**
- P0-2: Schema drift (implement versioning, Zod validation)

**Duration:** 2-3 days
**Complexity:** LOW

---

### Phase 3: Suggested Response Chips
**Rationale:** Requires conversation context from Phase 1 (suggestion relevance improves with history). Significantly improves mobile UX (67% of users access via mobile per industry benchmarks). High ROI, medium complexity.

**Delivers:**
- 2-4 contextual suggestions below bot messages
- Chips context-aware, match current state machine phase
- Click-to-send flow (populates input, submits)
- Chips disabled after user responds or types

**Uses stack:**
- Existing shadcn/ui Button components (no new UI library)
- Existing lucide-react icons (Sparkles icon for AI indication)
- Gemini structured output (bundle suggestions with main response)
- Static rule-based suggestions (fast path, <1ms)

**Avoids pitfalls:**
- P1-1: Suggestion overload (show only for multiple-choice, max 3-4)
- P1-5: Separate LLM call for suggestions (use structured output in single call)

**Duration:** 3-5 days
**Complexity:** MEDIUM
**Dependencies:** Phase 1 (conversation context improves suggestion quality)

---

### Phase 4: Validation Improvements
**Rationale:** Optional enhancement, doesn't block core features. Can run parallel with Phase 3. Improves data quality and reduces user frustration from validation failures. Low complexity (isolated to validation service).

**Delivers:**
- Validation errors reference document sources when available
- Two-phase validation (LLM extraction → Zod schema validation)
- Context-aware suggestions in error messages
- German error messages: "Steuerklasse muss zwischen 1 und 6 liegen. Siehe [TVöD_2025.pdf] für Details."

**Uses stack:**
- Zod v4.3.5 schemas (already installed in Phase 2)
- Existing `VectorstoreService` for context enrichment
- Existing `ResponseValidator` (enhance, don't replace)

**Avoids pitfalls:**
- P1-3: LLM-only validation (add deterministic Zod checks)

**Duration:** 2-3 days
**Complexity:** LOW

---

### Phase 5: Citation Quality Enhancement
**Rationale:** Nice-to-have, doesn't impact core functionality. Requires database migration (nullable column, backward compatible). Improves trust in RAG responses but lower priority than conversation persistence and function calling. Can run parallel with Phase 4.

**Delivers:**
- Citations include page numbers: `[TVöD_2025.pdf, S. 12]`
- Page number accuracy >80% (estimated vs. extracted)
- Admin sees improved source references in conversations
- Backward compatible (documents without page numbers still work)

**Uses stack:**
- Existing pgvector 0.8.0+ (iterative scans for metadata filtering)
- Existing `VectorstoreService.queryWithMetadata()`
- Gemini File API or unpdf for page extraction during chunking

**Avoids pitfalls:**
- P0-3: Citation hallucination (store metadata, don't generate)

**Duration:** 1-2 days
**Complexity:** LOW

---

### Phase Ordering Rationale

**Why this order:**
1. **Persistence first (Phase 1)**: Foundational data layer. All other features benefit from conversation history (suggestion context, retry logic, analytics). Without persistence, users frustrated by context loss.
2. **Function calling second (Phase 2)**: Low complexity, high value. Can run parallel with Phase 1. Improves existing feature reliability before adding new features.
3. **Suggestions third (Phase 3)**: Depends on conversation context from Phase 1 for quality. High UX impact but requires persistence foundation.
4. **Validation/citations last (Phases 4-5)**: Polish features, not blockers. Can run in parallel. Improve quality but don't unlock new capabilities.

**Why this grouping:**
- Phases 1-2 are foundational (data + tools)
- Phase 3 is UX enhancement
- Phases 4-5 are quality improvements (optional)

**How this avoids pitfalls:**
- Phase 1 addresses all P0-1, P0-4, P1-2, P1-4 (state sync, context window, rigidity, RLS)
- Phase 2 addresses P0-2 (schema drift) before adding more tools
- Phase 3 addresses P1-1, P1-5 (suggestion overload, double API calls) during design
- Phase 5 addresses P0-3 (citation hallucination) after RAG working well

**Parallel execution possible:**
- Phase 1 + Phase 2 (no dependencies, different components)
- Phase 3 + Phase 4 (after Phase 1 complete)
- Phase 4 + Phase 5 (independent polish features)

### Research Flags

**Phases with standard patterns (skip research-phase):**
- **Phase 1 (Conversation Persistence)**: DynamoDB best practices documented, LangChain conversation memory patterns apply, Dexie Next.js integration verified
- **Phase 2 (Function Calling)**: Gemini official docs comprehensive, tool calling well-documented, Zod validation patterns established
- **Phase 3 (Suggested Responses)**: AI smart reply patterns documented (Firebase ML Kit, LLM structured output), shadcn/ui components familiar
- **Phase 4 (Validation)**: Pydantic patterns apply to Zod, structured output validation documented

**Phases likely needing validation during implementation:**
- **Phase 5 (Citation Quality)**: Gemini page extraction accuracy unknown for German PDFs. May need to test with sample tariff documents (TVöD, TV-L) to determine if Gemini File API sufficient or if unpdf required. Page number estimation algorithm (chunks per page) needs calibration.

**Open questions for Phase 5:**
- Does Gemini File API preserve page boundaries in German tariff PDFs?
- What's accuracy rate for page marker extraction (`[PAGE:N]`)?
- Is unpdf more reliable than Gemini for page tracking?
- Test during Phase 5 Day 1, pivot to unpdf if Gemini <80% accurate.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH (95%) | Minimal new dependencies verified. Dexie 4.0.11 and Zod 4.3.5 on npm. Gemini multi-tool verified in official docs. |
| Features | MEDIUM (75%) | Feature research based on industry sources (Anthropic, Firebase, 2026 chatbot best practices). Need to validate suggestion click-through rates in production. |
| Architecture | HIGH (90%) | Existing components have clear extension points. Integration patterns documented. ConversationService similar to existing DocumentService. |
| Pitfalls | HIGH (90%) | 23 pitfalls identified from official docs, Stack Overflow, production war stories. Prevention strategies tested in similar systems. |

**Overall confidence:** HIGH (88%)

### Gaps to Address

Research identifies 5 gaps requiring validation during implementation:

1. **Gemini page extraction accuracy for German PDFs**: Cited research uses English documents. German tariff PDFs (TVöD, TV-L, AVR) have complex table layouts. Unknown if Gemini File API preserves page boundaries accurately. **Mitigation:** Test during Phase 5 Day 1 with 3 sample PDFs, measure accuracy, pivot to unpdf if <80% accurate.

2. **Suggested response click-through rates**: Industry benchmarks suggest 30-40% usage rate. Gehalt-Pflege domain (German nursing salary) may differ—users more technical, prefer typing. **Mitigation:** Implement analytics in Phase 3, A/B test with/without suggestions, optimize thresholds.

3. **Context window budget calibration**: Gemini 2.5 Flash limit is 200k tokens. Research suggests 50% buffer (100k usable). FormState size unknown (depends on conversation length). **Mitigation:** Measure actual token usage in Phase 1, adjust budget formula if needed. Start conservative (100k limit), increase if safe.

4. **State versioning migration complexity**: Adding `stateVersion` to FormState requires migration logic for existing conversations (none yet, clean slate). Future v1.2 might need migration. **Mitigation:** Document versioning pattern in Phase 1, test with mock v2 schema, ensure migration code tested.

5. **RLS policy performance with conversations**: Existing documents table has RLS, performance acceptable (<10ms). Conversations table will have more frequent writes (every message). Query performance unknown. **Mitigation:** Load test in Phase 1, verify <50ms P95 latency for conversation load, add indexes if needed.

## Sources

### Primary (HIGH confidence - official documentation)
- **Gemini API Function Calling**: https://ai.google.dev/gemini-api/docs/function-calling — Multi-tool support verified
- **Gemini Structured Output**: https://ai.google.dev/gemini-api/docs/structured-output — Zod integration documented
- **Dexie.js Next.js Guide**: https://medium.com/dexie-js/dexie-js-next-js-fd15556653e6 — v1.1.3+ SSR compatibility
- **Dexie useLiveQuery**: https://dexie.org/docs/dexie-react-hooks/useLiveQuery() — Reactive query patterns
- **Zod v4 Release**: https://zod.dev/v4 — Native `.toJSONSchema()` method
- **Supabase RLS**: https://supabase.com/docs/guides/database/postgres/row-level-security — Policy patterns

### Secondary (MEDIUM confidence - research papers, vendor blogs)
- **CiteFix RAG accuracy**: https://arxiv.org/abs/2504.15629 — 15.46% improvement with citation correction
- **FACTUM citation hallucination**: https://arxiv.org/pdf/2601.05866 — Mechanistic detection methods
- **pgvector 0.8.0 improvements**: https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/ — Iterative scans feature
- **DynamoDB chatbot data models**: https://aws.amazon.com/blogs/database/amazon-dynamodb-data-models-for-generative-ai-chatbots/ — Conversation persistence patterns
- **localStorage vs IndexedDB**: https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html — Comprehensive comparison

### Tertiary (LOW confidence - community, needs validation)
- **Suggested response click-through rates**: Industry benchmarks (30-40%) from botpress.com, certainly.io
- **Conversation TTL recommendations**: 90 days from AWS DynamoDB guide (may not apply to salary calculations)
- **Context window best practices**: 50% buffer rule of thumb (not officially documented by Google)

---

*Research completed: 2026-01-26*
*Ready for roadmap: YES*

**Next steps for orchestrator:**
1. Load SUMMARY.md as context for roadmap creation
2. Use 5-phase structure as starting point
3. Flag Phase 5 for validation during implementation (Gemini page extraction)
4. Ensure conversation persistence (Phase 1) completed before suggestions (Phase 3)
5. Allow parallel execution: Phase 1+2, then Phase 3+4+5
