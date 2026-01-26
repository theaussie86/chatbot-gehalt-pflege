# Architecture Research: Chat Intelligence Integration

**Domain:** Chat UX Enhancements for AI Salary Calculator
**Focus:** Integration of conversation persistence, function calling, suggested responses, and validation improvements
**Researched:** 2026-01-26
**Overall confidence:** HIGH

## Executive Summary

Chat Intelligence features integrate as enhancements to the existing state machine-driven chatbot architecture without requiring fundamental restructuring. The current system already has the core building blocks: state machine flow (`SalaryStateMachine`), intent detection (`ConversationAnalyzer`), validation services (`ResponseValidator`), and RAG integration (`VectorstoreService`). New features layer on top through four architectural additions: (1) persistent conversation storage in Supabase with local storage sync, (2) structured tool definitions for tax calculation via Gemini's function calling API, (3) suggested response generation via context-aware prompting, and (4) enhanced validation with citation enrichment.

The integration is non-invasive because the state machine and agent orchestration patterns remain unchanged. Conversation persistence extends the existing `FormState` with conversation IDs and history arrays. Function calling replaces inline tax calculation prompts with structured tool definitions already partially implemented in `GeminiAgent`. Suggested responses are generated during response formatting as an optional field. Citations already exist in the RAG pipeline (`queryWithMetadata`) and only need page number enrichment via document metadata.

Risk is LOW because each feature operates independently - conversation persistence doesn't depend on function calling, suggested responses don't require persistent storage, and validation improvements are isolated to the `ResponseValidator` service. The recommended build order sequences features by complexity and integration surface: start with conversation persistence (foundational data layer), then function calling (agent enhancement), followed by suggested responses (UI layer), and finish with validation/citation improvements (polish).

## Integration Points

### Existing Components Requiring Enhancement

#### 1. Chat Endpoint (`apps/api/app/api/chat/route.ts`)

**Current role:** Request orchestration with state machine execution, intent detection, and response generation.

**Integration needs:**

**Line 26-48: Request parsing and authentication**
- **ADD:** Extract `conversationId` from request body
- **ADD:** Load existing conversation from DB if ID provided
- **MODIFY:** Include `conversationId` in response for client sync

**Line 129-156: State machine initialization and conversation context**
- **ALREADY EXISTS:** `conversationContext` array (line 147-154) keeping last 10 messages
- **MODIFY:** Replace local array with DB-backed history for persistence
- **ADD:** Create new conversation record on first message
- **ADD:** Update conversation record after each turn

**Line 159-176: Intent detection**
- **NO CHANGE:** Intent detection logic remains identical
- **BENEFIT:** Persistent history improves intent accuracy over multiple sessions

**Line 304-414: Tax calculation execution**
- **ALREADY PARTIAL:** GeminiAgent has function calling infrastructure
- **ENHANCE:** Move calculation from inline prompts to pure function calling
- **ADD:** Response handling for structured tool results
- **BENEFIT:** Structured I/O reduces parsing errors

**Line 630-657: Response generation**
- **ADD:** Generate suggested response chips based on current state
- **ADD:** Include suggestions in response payload
- **MODIFY:** Response format from `{ text, formState }` to `{ text, formState, suggestions?, conversationId }`

**Integration complexity:** MEDIUM - multiple touchpoints but well-isolated

---

#### 2. GeminiAgent (`apps/api/utils/agent/GeminiAgent.ts`)

**Current role:** AI orchestration with tool execution (salary calculation).

**Integration needs:**

**Line 3-4: Tool definitions**
- **ALREADY EXISTS:** `SALARY_TOOL` imported from config (line 3)
- **VERIFY:** Tool definition matches Gemini 2.0+ function calling schema
- **EXPAND:** Add additional tools if needed (tariff lookup, state validation)

**Line 64-126: Tool execution handling**
- **ALREADY EXISTS:** Function call detection and execution pattern
- **ENHANCE:** Add comprehensive error handling for malformed tool calls
- **ADD:** Logging for tool execution metrics (latency, success rate)
- **REVIEW:** Current implementation manually parses - ensure robust

**Integration complexity:** LOW - existing pattern, just enhancement

---

#### 3. VectorstoreService (`apps/api/lib/vectorstore/VectorstoreService.ts`)

**Current role:** RAG query with semantic search and caching.

**Integration needs:**

**Line 210-266: queryWithMetadata**
- **ALREADY EXISTS:** Returns `{ content, similarity, metadata: { documentId, filename, chunkIndex } }`
- **ADD:** Page number extraction from chunk metadata
- **MODIFY:** Metadata structure to include `pageNumber?: number`

**Database schema modification required:**
```sql
-- Add page column to document_chunks (nullable for backward compatibility)
ALTER TABLE document_chunks ADD COLUMN page_number INTEGER;

-- Populate during Inngest chunk creation based on chunk index estimation
```

**Integration complexity:** LOW - isolated metadata enhancement

---

#### 4. ResponseValidator (`apps/api/utils/agent/ResponseValidator.ts`)

**Current role:** Field validation with LLM normalization.

**Integration needs:**

**Line 52-63: Vectorstore enrichment**
- **ALREADY EXISTS:** Calls `vectorstore.enrichValue()` for context
- **ENHANCE:** Use vectorstore context for validation suggestions with citations
- **ADD:** Citation references in validation errors
- **EXAMPLE:** "Hours must be 1-60. See [document.pdf, S. 3] for TVöD working hours."

**Integration complexity:** LOW - optional enhancement, not blocking

---

#### 5. FormState Type (`apps/api/types/form.ts`)

**Current role:** State machine data structure.

**Integration needs:**

**Line 3-40: FormState interface**
- **ADD:** `conversationId?: string` - UUID for persistence
- **ADD:** `suggestedResponses?: string[]` - AI-generated quick replies
- **ALREADY EXISTS:** `conversationContext?: string[]` - message history (line 37)
- **KEEP:** String array format for backward compatibility (don't break existing state machine)

**Integration complexity:** LOW - type extension, backward compatible

---

#### 6. Widget Chat Component (`apps/web/App.tsx`)

**Current role:** UI for chat interaction with message rendering and progress tracking.

**Integration needs:**

**Line 23-70: State initialization and config**
- **ADD:** Load `conversationId` from localStorage on mount
- **ADD:** Resume conversation if ID exists in localStorage
- **MODIFY:** Include conversation ID in API requests (line 132)

**Line 112-156: Send message handler**
- **MODIFY:** Include `conversationId` in payload to `sendMessageToGemini` (line 132)
- **ADD:** Save conversation ID to localStorage after first response
- **ADD:** Handle `conversationId` from response

**Line 221-242: Message rendering**
- **ADD:** Render suggested response chips below bot messages
- **ADD:** Click handlers for chip selection (calls `handleSendMessage` with chip text)
- **ADD:** Disable chips after user responds

**New component needed:**
```typescript
// apps/web/src/components/SuggestedResponses.tsx
interface SuggestedResponsesProps {
  suggestions: string[];
  onSelect: (text: string) => void;
  disabled: boolean;
}
```

**Integration complexity:** MEDIUM - UI changes with new component and state

---

## New Components

### 1. Conversation Persistence Service

**Location:** `apps/api/lib/conversation/ConversationService.ts`

**Purpose:** Manage conversation lifecycle with dual-write pattern (DB + client sync).

**Interface:**
```typescript
class ConversationService {
  constructor(supabase: SupabaseClient);

  // Create new conversation
  async create(projectId: string, metadata?: Record<string, any>): Promise<Conversation>;

  // Load conversation with history
  async load(conversationId: string): Promise<Conversation | null>;

  // Append message turn (user + assistant)
  async appendTurn(
    conversationId: string,
    userMessage: string,
    assistantResponse: string,
    metadata: { intent?: string; extractedData?: Record<string, any> }
  ): Promise<void>;

  // Update conversation state
  async updateState(conversationId: string, formState: FormState): Promise<void>;

  // List conversations for admin dashboard
  async listByProject(projectId: string, limit?: number): Promise<Conversation[]>;
}

interface Conversation {
  id: string;
  project_id: string;
  created_at: Date;
  updated_at: Date;
  completed_at?: Date;
  form_state: FormState;
  metadata: Record<string, any>;
  messages?: ConversationMessage[];
}

interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: Date;
  intent?: string;
  extracted_data?: Record<string, any>;
}
```

**Database schema:**
```sql
-- Conversations table
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL REFERENCES projects(public_key),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  form_state JSONB NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Conversation messages table
CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  intent TEXT,
  extracted_data JSONB
);

-- Indexes
CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);
CREATE INDEX idx_messages_conversation ON conversation_messages(conversation_id, created_at);
```

**Integration pattern:** Dual-write with eventual consistency
1. Chat endpoint creates/loads conversation on first message
2. Appends messages after each turn
3. Updates state after state machine transitions
4. Client stores conversation ID in localStorage
5. Admin dashboard queries for analytics

**Complexity:** MEDIUM - new service with database schema

---

### 2. Suggested Response Generator

**Location:** `apps/api/utils/agent/SuggestionGenerator.ts`

**Purpose:** Generate contextual quick-reply options based on state machine phase.

**Interface:**
```typescript
class SuggestionGenerator {
  constructor(genAI: GoogleGenAI);

  // Generate suggestions for current state
  async generate(
    formState: FormState,
    maxSuggestions?: number
  ): Promise<string[]>;

  // Get static suggestions (fast fallback)
  static getStaticSuggestions(formState: FormState): string[];
}
```

**Implementation approach:**

**Rule-based suggestions (fast, deterministic):**
```typescript
static getStaticSuggestions(formState: FormState): string[] {
  const section = formState.section;
  const missing = formState.missingFields?.[0];

  // Summary phase: confirmation options
  if (section === 'summary' && !missing) {
    return ['Ja, berechnen', 'Wochenstunden ändern', 'Steuerklasse ändern'];
  }

  // Job details: common inputs
  if (section === 'job_details') {
    if (missing === 'tarif') return ['TVöD', 'TV-L', 'AVR'];
    if (missing === 'hours') return ['Vollzeit (38,5h)', 'Teilzeit (30h)', '20 Stunden'];
    if (missing === 'state') return ['Nordrhein-Westfalen', 'Bayern', 'Berlin'];
  }

  // Tax details: common options
  if (section === 'tax_details') {
    if (missing === 'taxClass') return ['Steuerklasse 1 (ledig)', 'Steuerklasse 4 (verheiratet)'];
    if (missing === 'churchTax') return ['Ja, Kirchenmitglied', 'Nein'];
    if (missing === 'numberOfChildren') return ['0 Kinder', '1 Kind', '2 Kinder'];
  }

  return [];
}
```

**LLM-based suggestions (dynamic, context-aware fallback):**
- Used when no static rules match
- Considers conversation context
- ~200-500ms latency (non-blocking)

**Integration:** Called during response generation (chat route ~640), included in response payload.

**Complexity:** LOW - isolated service with fast static fallback

---

### 3. Citation Enhancer

**Location:** `apps/api/lib/vectorstore/CitationEnhancer.ts`

**Purpose:** Enrich RAG results with page numbers for better source attribution.

**Interface:**
```typescript
class CitationEnhancer {
  // Extract page number from chunk metadata or estimate from chunk index
  static extractPageNumber(
    chunkIndex: number,
    documentMetadata?: { totalPages?: number; chunksPerPage?: number }
  ): number | null;

  // Format citation string
  static formatCitation(filename: string, pageNumber: number | null): string;

  // Enhance RAG results with page numbers
  static enhanceResults(
    results: Array<{ content: string; metadata: any }>
  ): Array<{ content: string; citation: string }>;
}
```

**Implementation:**
```typescript
static extractPageNumber(chunkIndex: number, chunksPerPage = 5): number | null {
  // Estimate: 2000 chars per chunk, ~5 chunks per page (A4 page ~10K chars)
  return Math.floor(chunkIndex / chunksPerPage) + 1;
}

static formatCitation(filename: string, pageNumber: number | null): string {
  return pageNumber ? `[${filename}, S. ${pageNumber}]` : `[${filename}]`;
}
```

**Integration:** Used in chat route line ~226-239 when formatting RAG context with citations.

**Complexity:** LOW - utility functions, no state

---

## Modified Components

### 1. Chat Route Response Flow

**Before (v1.0):**
```typescript
// Line 630-657
const responseResult = await client.models.generateContent({ ... });
let responseText = responseResult.text || '';

return NextResponse.json({
  text: responseText,
  formState: nextFormState
});
```

**After (v1.1):**
```typescript
// 1. Load/create conversation
const conversationId = body.conversationId;
const conversation = conversationId
  ? await conversationService.load(conversationId)
  : await conversationService.create(projectId);

// 2. Execute state machine (UNCHANGED)
const stepResult = SalaryStateMachine.getNextStep(nextFormState);

// 3. Generate response (UNCHANGED)
const responseResult = await client.models.generateContent({ ... });
let responseText = responseResult.text || '';

// 4. Generate suggestions (NEW, parallel with response)
const suggestions = await suggestionGenerator.generate(nextFormState);

// 5. Save conversation turn (NEW)
await conversationService.appendTurn(
  conversation.id,
  message,
  responseText,
  { intent: nextFormState.userIntent, extractedData: extraction }
);

// 6. Return enhanced response (MODIFIED)
return NextResponse.json({
  text: responseText,
  formState: nextFormState,
  conversationId: conversation.id,
  suggestions: suggestions
});
```

**Complexity:** MEDIUM - orchestration changes

---

### 2. RAG Query with Citations

**Before (v1.0):**
```typescript
// Line 204-239
const ragResults = await vectorstore.queryWithMetadata(message, activeProjectId, 5);

const contextSection = ragResults.map((r, i) => `
[Quelle ${i + 1}: ${r.metadata.filename}]
${r.content}
`).join('\n---\n');
```

**After (v1.1):**
```typescript
const ragResults = await vectorstore.queryWithMetadata(message, activeProjectId, 5);
const enhancedResults = CitationEnhancer.enhanceResults(ragResults);

const contextSection = enhancedResults.map(r => `
${r.citation}
${r.content}
`).join('\n---\n');
```

**Complexity:** LOW - simple utility swap

---

### 3. Widget Message State

**Before (v1.0):**
```typescript
// Line 3, apps/web/types.ts
interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  options?: string[];
  resultData?: SalaryResultData;
}
```

**After (v1.1):**
```typescript
interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  options?: string[]; // Keep for backward compatibility
  suggestions?: string[]; // NEW: AI-generated suggestions
  resultData?: SalaryResultData;
}
```

**Widget state management (NEW):**
```typescript
// On mount: restore conversation
const [conversationId, setConversationId] = useState<string | null>(null);

useEffect(() => {
  const savedId = localStorage.getItem('chatbot_conversation_id');
  if (savedId) {
    setConversationId(savedId);
    // Note: History restored from API, not localStorage (prevents stale data)
  }
}, []);

// On first response: save conversation ID
const handleSendMessage = async (text: string) => {
  const response = await sendMessageToGemini(text, messages, conversationId);

  if (response.conversationId && !conversationId) {
    localStorage.setItem('chatbot_conversation_id', response.conversationId);
    setConversationId(response.conversationId);
  }
  // ...
};
```

**Complexity:** LOW - state extension

---

## Data Flow Changes

### Before: Stateless Chat (v1.0)

```
┌─────────┐     ┌──────────────┐     ┌────────────┐
│ Widget  │────>│ Chat Route   │────>│  Gemini    │
│         │<────│ (stateless)  │<────│  API       │
└─────────┘     └──────────────┘     └────────────┘
                       │
                       v
                ┌─────────────┐
                │  Supabase   │
                │  (projects, │
                │  documents) │
                └─────────────┘
```

**Characteristics:**
- No conversation memory beyond in-memory `conversationContext` (last 10 messages)
- FormState lives only in API response
- No admin visibility into conversations
- No analytics or session resume

---

### After: Persistent Conversations (v1.1)

```
┌─────────┐     ┌──────────────┐     ┌────────────┐
│ Widget  │────>│ Chat Route   │────>│  Gemini    │
│  (ID in │<────│ (loads conv) │<────│  API       │
│ storage)│     └──────┬───────┘     └────────────┘
└─────────┘            │
                       v
                ┌───────────────────────────┐
                │  Supabase                 │
                │  ├─ conversations         │
                │  ├─ conversation_messages │
                │  ├─ projects              │
                │  └─ documents             │
                └───────────┬───────────────┘
                            ^
                            │
                      ┌─────────────┐
                      │ Admin Dash  │
                      │ (analytics) │
                      └─────────────┘
```

**Characteristics:**
- Conversation ID persists in localStorage (client) and DB (server)
- Full history stored for analytics and debugging
- Admin can view conversation transcripts
- Session resume across page reloads
- Multi-device support possible (ID via URL/QR)

---

### Function Calling Flow

**Current (v1.0): Inline calculation**
```
User: "Berechne mein Gehalt"
  │
  v
State machine detects summary + confirmation
  │
  v
Inline prompt with all parameters → TaxWrapper.calculate()
  │
  v
Returns formatted result as text
```

**New (v1.1): Structured tool calling**
```
User: "Berechne mein Gehalt"
  │
  v
State machine detects summary + confirmation
  │
  v
GeminiAgent sends with SALARY_TOOL definition
  │
  v
Gemini returns function_call: { name: "calculate_net_salary", args: {...} }
  │
  v
GeminiAgent executes TaxWrapper.calculate(args)
  │
  v
Returns result to Gemini → Gemini formats natural language response
```

**Benefits:**
- Structured I/O reduces parsing errors
- Easier to add new tools (tariff lookup, validation check)
- Better observability (log tool calls separately)
- Gemini 2.0+ optimized for function calling

---

### Suggested Responses Flow

```
User message arrives
  │
  v
State machine processes → determines next state
  │
  v
Response generated (LLM call)
  │
  v
[PARALLEL] SuggestionGenerator.generate(formState)
  │
  ├─> Static rules (fast path ~0ms)
  │     └─> ["TVöD", "TV-L", "AVR"]
  │
  └─> LLM generation (fallback ~300ms)
        └─> ["Vollzeit 38,5 Stunden", "Teilzeit 20 Stunden"]
  │
  v
Response payload: { text, formState, suggestions, conversationId }
  │
  v
Widget renders chips below bot message
  │
  v
User clicks chip OR types manually
```

**Performance:** Static suggestions ~0ms, LLM suggestions ~200-500ms (non-blocking)

---

## Suggested Build Order

### Phase 1: Conversation Persistence (Foundation)
**Duration:** 3-4 days
**Why first:** Foundational data layer for all other features, enables analytics and debugging

**Tasks:**
1. Database schema (conversations, conversation_messages tables)
2. ConversationService implementation (create, load, appendTurn, updateState)
3. Chat route integration (load/save conversation)
4. Widget localStorage sync (save/restore conversation ID)
5. Admin dashboard conversation viewer (list conversations)

**Deliverables:**
- Conversations persist across page reloads
- Admin can view conversation history
- Session resume works within 1 second
- RLS policies for conversation access

**Dependencies:** None
**Risks:** LOW - isolated to data layer
**Validation:**
- Test conversation creation on first message
- Test session resume after page reload
- Test admin visibility of conversations

---

### Phase 2: Function Calling Enhancement (Agent Layer)
**Duration:** 2-3 days
**Why second:** Improves tax calculation reliability, enables future tool expansion

**Tasks:**
1. Verify SALARY_TOOL definition matches Gemini 2.0 schema
2. Enhance GeminiAgent function call handling (lines 64-126)
3. Add comprehensive logging for tool execution
4. Add error handling for malformed tool calls
5. Test tool calling with various parameter combinations

**Deliverables:**
- Tax calculation uses structured function calling exclusively
- Tool execution metrics logged (latency, success rate)
- Graceful degradation on tool call errors

**Dependencies:** None (can run parallel with Phase 1)
**Risks:** LOW - existing pattern, just enhancement
**Validation:**
- Test successful tool execution
- Test malformed parameter handling
- Verify tool call logs appear

---

### Phase 3: Suggested Responses (UX Enhancement)
**Duration:** 3-5 days
**Why third:** Requires conversation context from Phase 1, significantly improves UX

**Tasks:**
1. SuggestionGenerator service with static rules
2. LLM-based suggestion fallback for edge cases
3. Chat route integration (generate suggestions in parallel with response)
4. Widget SuggestedResponses component (chip rendering)
5. Click handler and state management (disable after use)

**Deliverables:**
- Suggested responses appear below bot messages
- Chips are context-aware and match current phase
- Clicking chip sends message automatically
- Chips disabled after user responds or types

**Dependencies:** Phase 1 (conversation context improves suggestions)
**Risks:** LOW - UI-only feature with backend support
**Validation:**
- Test static suggestions for each phase
- Test LLM fallback for ambiguous states
- Test chip click-to-send flow

---

### Phase 4: Validation Improvements (Polish)
**Duration:** 2-3 days
**Why fourth:** Optional enhancement, doesn't block core features

**Tasks:**
1. Enhance ResponseValidator to use vectorstore context for suggestions
2. Add citation references to validation errors
3. Test validation with edge cases (unusual inputs)
4. Update error messages to be more helpful

**Deliverables:**
- Validation errors reference document sources when available
- Suggestions are more context-aware
- Edge cases handled gracefully

**Dependencies:** None (can run parallel with Phase 3)
**Risks:** LOW - isolated to validation service
**Validation:**
- Test validation with document context
- Test validation without documents (fallback)
- Verify citation formatting

---

### Phase 5: Citation Quality (Polish)
**Duration:** 1-2 days
**Why last:** Nice-to-have, doesn't impact core functionality

**Tasks:**
1. Add page_number column to document_chunks table (nullable)
2. Update Inngest pipeline to estimate page numbers during chunk creation
3. CitationEnhancer utility functions
4. Integrate with RAG query formatting (chat route line ~226-239)
5. Optional: Backfill existing documents (migration script)

**Deliverables:**
- Citations include page numbers when available
- Format: `[document.pdf, S. 5]`
- Admin sees improved source references in chat

**Dependencies:** None (can run parallel with Phase 4)
**Risks:** LOW - isolated enhancement
**Validation:**
- Upload new document, verify page numbers in chunks
- Test RAG query with page number citations
- Test backward compatibility (documents without page numbers)

---

## Integration Complexity Matrix

| Feature | New Components | Modified Components | DB Schema | UI Changes | Complexity |
|---------|----------------|---------------------|-----------|------------|------------|
| Conversation Persistence | ConversationService | Chat route, Widget | 2 tables | localStorage sync | MEDIUM |
| Function Calling | None | GeminiAgent, Chat route | None | None | LOW |
| Suggested Responses | SuggestionGenerator | Chat route, Widget | None | New component | MEDIUM |
| Validation Improvements | None | ResponseValidator | None | Error messages | LOW |
| Citation Quality | CitationEnhancer | VectorstoreService, RAG format | 1 column | Citation display | LOW |

**Total effort:** 11-17 days (2.2-3.4 weeks)

---

## Performance Considerations

### Database Queries

**Conversation load (with history):**
```sql
SELECT c.*,
       json_agg(cm ORDER BY cm.created_at) AS messages
FROM conversations c
LEFT JOIN conversation_messages cm ON cm.conversation_id = c.id
WHERE c.id = $1
GROUP BY c.id;
```
**Expected latency:** <10ms for conversations up to 100 messages

---

### Suggestion Generation

**Static suggestions:** ~0ms (synchronous lookup)
**LLM suggestions:** 200-500ms (can run in parallel with response generation)

**Optimization strategy:**
```typescript
const [responseText, suggestions] = await Promise.all([
  generateResponse(formState),
  suggestionGenerator.generate(formState)
]);
```

---

### Citation Enhancement

**Cost:** ~5ms for 5 RAG results (pure computation, no I/O)

---

### Client-side Storage

**localStorage size:** ~36 bytes (UUID) per conversation ID
**Cleanup strategy:** Store only last conversation ID, replace on new chat

---

## Security Considerations

### Conversation Privacy

**RLS policy:**
```sql
-- Project owners can access their project's conversations
CREATE POLICY "Project owners access conversations"
ON conversations
FOR ALL
USING (
  project_id IN (
    SELECT public_key FROM projects WHERE user_id = auth.uid()
  )
);
```

**Widget access:** Conversations scoped to project (no user auth), but project ID required

---

### Function Calling Safety

**Tool definition validation:**
- Whitelist allowed tools in SALARY_TOOL config
- Validate parameters before execution in GeminiAgent
- Rate limit tool calls (inherited from existing rate limiting)

---

### localStorage Hygiene

**Data stored:**
- Conversation ID (UUID) - safe to expose, not sensitive
- No conversation history (prevents XSS exfiltration)
- No user input (privacy risk)
- No API responses (PII risk)

---

## Monitoring & Observability

### Metrics to Track

**Conversation metrics:**
- Conversation creation rate (conversions/hour)
- Average conversation length (messages per conversation)
- Completion rate (reached 'completed' state %)
- Session resume rate (% conversations with >1 session)

**Function calling metrics:**
- Tool call success rate (%)
- Tool call latency (P50, P95, P99)
- Parameter extraction accuracy

**Suggestion metrics:**
- Suggestion usage rate (clicks vs manual input %)
- Suggestion relevance (user edits after click %)
- Generation latency (static vs LLM)

---

### Logging Strategy

**Chat route additions:**
```typescript
console.log('[Conversation] Created:', conversationId);
console.log('[Tool] Executing:', toolCall.name, toolCall.args);
console.log('[Suggestions] Generated:', suggestions, 'via:', method);
```

**Error tracking:**
- Conversation save failures (DB errors)
- Tool call errors (malformed responses)
- Suggestion generation timeouts

---

## Migration Path

### Existing Conversations

**Challenge:** Current chats have no conversation ID

**Solution:** Backward compatibility approach
- New conversations automatically get IDs
- Existing in-progress sessions continue without IDs
- User can start new conversation to enable persistence

**No data migration needed** - clean cut between v1.0 (stateless) and v1.1 (persistent)

---

### Database Schema

**Migration order:**
1. Create conversations table
2. Create conversation_messages table
3. Add page_number to document_chunks (nullable, backfill optional)
4. Deploy code with feature flag (environment variable)
5. Enable features gradually per project

---

## Success Criteria

**Conversation Persistence:**
- [ ] Conversations persist across page reloads (<1s load time)
- [ ] Admin can view conversation history in dashboard
- [ ] Session resume works reliably
- [ ] <1% conversation save failures

**Function Calling:**
- [ ] Tax calculation uses structured tool calls exclusively
- [ ] Tool call success rate >95%
- [ ] Tool call latency <500ms P95

**Suggested Responses:**
- [ ] Suggestions appear for all phases
- [ ] Click-to-send works reliably
- [ ] Suggestion usage rate >30% (users prefer chips over typing)
- [ ] Generation latency <500ms (non-blocking)

**Validation Improvements:**
- [ ] Validation errors include document references when available
- [ ] User confusion rate decreases (measured by retry attempts)

**Citation Quality:**
- [ ] Citations include page numbers when available
- [ ] Page number accuracy >80%

---

## Conclusion

Chat Intelligence features integrate cleanly into the existing v1.0 architecture with minimal disruption. The state machine (`SalaryStateMachine`), agent orchestration (`GeminiAgent`), and RAG pipeline (`VectorstoreService`) remain unchanged. New features layer on top through four focused additions:

1. **Conversation persistence** - ConversationService with dual-write pattern
2. **Function calling** - Enhancement to existing GeminiAgent tool execution
3. **Suggested responses** - SuggestionGenerator with static/LLM fallback
4. **Citation/validation improvements** - CitationEnhancer utility and validator enhancements

Build order prioritizes foundation (conversation persistence) before UX enhancements (suggestions) and polish (citations). Each phase delivers independent value and can be deployed incrementally.

**Risk assessment:** LOW
- Features operate independently (no cross-dependencies)
- Integration at well-defined extension points
- Existing patterns reused (dual-write, tool calling, metadata enrichment)
- No fundamental architecture changes required

**Total effort:** 11-17 days (2.2-3.4 weeks) across 5 phases

---

*Architecture research completed: 2026-01-26*
*Ready for roadmap creation: YES*
