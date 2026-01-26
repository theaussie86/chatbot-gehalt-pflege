# Features Research: Chat Intelligence

**Domain:** AI Chatbot Conversation Features (Salary Calculator Context)
**Researched:** 2026-01-26
**Confidence:** MEDIUM (verified with official sources and recent 2026 materials)

## Executive Summary

Chat Intelligence features enhance conversational AI systems through five core capabilities: **conversation persistence** (storing/resuming chats), **LLM function calling** (executing actions through tools), **suggested response chips** (quick reply buttons), **data extraction validation** (ensuring structured outputs), and **citation quality** (source attribution).

**Context:** The Gehalt-Pflege chatbot already implements basic state machine flow, intent detection, and tool calling for salary calculations. This research focuses on **enhancing** these capabilities with production-ready patterns observed in 2026 chatbot implementations.

---

## Table Stakes Features

Features users expect from modern AI chatbots. Missing these creates friction or perceived incompleteness.

### 1. Conversation History Storage & Retrieval

**What users expect:**
- Return to conversation and see full history
- Same conversation accessible across page reloads
- Context maintained across sessions

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Database Schema | `conversations` table with session_id, user_id, timestamp | Low |
| Message Storage | Each message stored with role (user/bot), content, metadata | Low |
| Session Management | Unique session ID per conversation with TTL (90 days recommended) | Low |
| Data Retrieval | Load history on page load, ordered by timestamp | Low |

**Why expected:** Industry standard since 2025. Users frustrated by tools that "forget" previous context or lose work.

**Existing foundation:** Currently stateless (no database storage). History exists client-side only during single session.

**References:**
- [AWS DynamoDB data models for generative AI chatbots](https://aws.amazon.com/blogs/database/amazon-dynamodb-data-models-for-generative-ai-chatbots/)
- [PostgreSQL for Chat History - LangChain](https://hexacluster.ai/blog/postgres-for-chat-history-langchain-postgres-postgreschatmessagehistory)
- [AI SDK UI: Chatbot Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)

---

### 2. Progressive Disclosure (One Question at a Time)

**What users expect:**
- Bot asks focused, single questions
- Not overwhelmed with all options upfront
- Clear progression through conversation

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| State Machine | Already implemented in `salary-flow.ts` | ✅ Exists |
| Missing Field Detection | `getMissingFields()` logic | ✅ Exists |
| System Instructions | Dynamic prompts based on state | ✅ Exists |
| UI Indicators | Progress bar showing completion % | Low |

**Why expected:** Reduces cognitive load, prevents decision paralysis. [Jakob Nielsen introduced progressive disclosure in 1995](https://www.nngroup.com/articles/progressive-disclosure/); still critical in [2026 AI agents](https://aipositive.substack.com/p/progressive-disclosure-matters).

**Existing foundation:** Already well-implemented. System transitions job_details → tax_details → summary, asking for one field at a time.

**References:**
- [Progressive Disclosure Matters: Applying 90s UX Wisdom to 2026 AI Agents](https://aipositive.substack.com/p/progressive-disclosure-matters)
- [AI Design Patterns: Progressive Disclosure](https://www.aiuxdesign.guide/patterns/progressive-disclosure)
- [NN/G: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/)

---

### 3. Error Handling & Validation with Clear Feedback

**What users expect:**
- Immediate feedback when providing invalid data
- Clear explanation of what's wrong
- Guidance on how to fix it

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Field Validation | Type checking (numbers, enums, ranges) | Low |
| User-Facing Errors | German messages explaining validation failures | Low |
| Re-prompting Logic | Ask again with context about the error | Low |
| Value Constraints | Min/max for hours, valid tax classes, etc. | Low |

**Why expected:** [74% citation accuracy in RAG systems](https://arxiv.org/abs/2504.15629) highlights need for validation. Users abandon chatbots that accept then fail on invalid data.

**Existing foundation:** `ResponseValidator.ts` exists. Needs enhancement for user-friendly error messages.

**References:**
- [The Complete Guide to Using Pydantic for Validating LLM Outputs](https://machinelearningmastery.com/the-complete-guide-to-using-pydantic-for-validating-llm-outputs/)
- [Structured Data Extraction - Phoenix](https://arize.com/docs/phoenix/cookbook/tracing/structured-data-extraction)
- [LLMs for Structured Data Extraction from PDFs in 2026](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)

---

### 4. Human Handoff / Exit Strategy

**What users expect:**
- Option to talk to human if bot fails
- Clear way to exit or restart conversation
- No feeling of being "trapped" in the flow

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Escape Keyword Detection | Recognize "help", "agent", "restart" | Low |
| UI Buttons | "Start Over" or "Contact Support" | Low |
| Handoff Context | Pass conversation history to human | Medium |
| Fallback Instructions | System prompt for unhandled scenarios | Low |

**Why expected:** [#1 chatbot UX mistake is failing to offer clean exit](https://www.certainly.io/blog/top-ux-mistakes-chatbot). Users feel trapped without escape routes.

**Existing foundation:** No explicit exit/restart mechanism. Implemented through browser refresh.

**References:**
- [Chatbot Best Practices You Can't Afford to Miss in 2026](https://botpress.com/blog/chatbot-best-practices)
- [How To Build A Chatbot: 10 User Experience Design Mistakes To Avoid](https://www.certainly.io/blog/top-ux-mistakes-chatbot)
- [AI Chatbot Session Management Best Practices](https://optiblack.com/insights/ai-chatbot-session-management-best-practices)

---

## Differentiator Features

Features that set the chatbot apart. Not expected, but provide competitive advantage.

### 5. AI-Generated Suggested Response Chips (Quick Replies)

**Value proposition:**
- Reduce typing effort (especially mobile)
- Guide users toward optimal paths
- Show bot's capabilities proactively

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Suggestion Generation | LLM generates 2-4 contextual options per state | Medium |
| UI Component | Clickable chips below chat input | Low |
| Mobile Optimization | Touch-friendly buttons with character limits | Low |
| Hybrid Input | Allow typing OR clicking chips | Low |

**Example use case:**
```
Bot: "In welchem Bundesland arbeiten Sie?"
Chips: ["Nordrhein-Westfalen", "Bayern", "Berlin", "Andere"]
```

**When to use:**
- Enum fields (tariff, tax class, state)
- Yes/No questions (church tax, children)
- Confirmation prompts ("Ja, berechnen", "Nein, ändern")

**Complexity:** Medium. Requires:
1. LLM prompt engineering to generate contextual suggestions
2. Frontend component for chip rendering
3. Click handler that populates input and submits

**Caution:** [Don't remove typing freedom](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0). Always allow free-text input alongside chips.

**References:**
- [11 Use Cases for Suggest Reply AI That Drive Results (2026)](https://bluetweak.com/blog/ai-suggested-replies/)
- [Quick Reply Best Practices](https://www.chatbot.com/help/bot-responses/how-to-use-quick-replies/)
- [Push The Button: Quick Replies And The Chatbot Experience](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0)

---

### 6. Enhanced RAG Citation Attribution

**Value proposition:**
- Users trust answers backed by sources
- Enables verification of LLM claims
- Reduces hallucination impact

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Fine-Grained Citations | Link specific sentences to document chunks | High |
| Citation Correction | Post-processing to fix misattributions | Medium |
| Source Display | Inline footnotes [1] with expandable sources | Medium |
| Contextual Alignment | Verify cited text actually supports claim | High |

**Current state:** RAG implemented with basic document retrieval. Citations not fine-grained.

**Enhancement opportunity:**
- **CiteFix approach:** [Post-processing citation correction achieves 15.46% accuracy improvement](https://arxiv.org/abs/2504.15629)
- **FACTUM framework:** [Mechanistic detection of citation hallucination](https://arxiv.org/pdf/2601.05866)
- **Chunk metadata:** Store spatial metadata for fine-grained attribution

**Complexity:** High. Requires:
1. Chunking with overlap for context preservation
2. Similarity scoring between generated text and chunks
3. Post-processing pipeline to verify citations
4. UI for displaying inline citations

**References:**
- [CiteFix: Enhancing RAG Accuracy Through Post-Processing Citation Correction](https://arxiv.org/abs/2504.15629)
- [FACTUM: Mechanistic Detection of Citation Hallucination in Long-Form RAG](https://arxiv.org/pdf/2601.05866)
- [Citation-Aware RAG: Fine Grained Citations](https://www.tensorlake.ai/blog/rag-citations)
- [LLM Citations Explained: RAG & Source Attribution Methods](https://rankstudio.net/articles/en/ai-citation-frameworks)

---

### 7. Advanced Tool Calling with Retry & Error Recovery

**Value proposition:**
- Robust calculation even when LLM provides invalid parameters
- Self-healing tool calls through retry logic
- Graceful degradation on tool failures

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Parameter Validation | Pydantic/JSON schema for all tool inputs | Medium |
| Retry Logic | LLM retries with corrected args after validation error | Medium |
| Error Context | Return user-friendly AND model-friendly errors | Medium |
| Circuit Breaker | Stop retrying after N failures, escalate to human | Medium |

**Current state:** Basic tool calling exists (`calculate_net_salary`). No retry or validation feedback loop.

**Enhancement opportunity:**
- **Validation errors fed back to LLM:** "taxClass must be 1-6, you provided 7"
- **Retry with corrected args:** LLM learns to re-call with valid inputs
- **Circuit breaker:** After 3 failed calls, explain limitation to user

**Example flow:**
```
1. LLM calls calculate_net_salary(taxClass: 7)
2. Validation fails: "taxClass must be 1-6"
3. Error returned to LLM as function response
4. LLM re-calls with taxClass: 1
5. Success
```

**Complexity:** Medium. Existing tool infrastructure makes this incrementally achievable.

**References:**
- [The Anatomy of Tool Calling in LLMs: A Deep Dive](https://martinuke0.github.io/posts/2026-01-07-the-anatomy-of-tool-calling-in-llms-a-deep-dive/)
- [Mastering LLM Tool Calling: The Complete Framework](https://machinelearningmastery.com/mastering-llm-tool-calling-the-complete-framework-for-connecting-models-to-the-real-world/)
- [LLM Function-Calling Pitfalls Nobody Mentions](https://medium.com/@2nick2patel2/llm-function-calling-pitfalls-nobody-mentions-a0a0575888b1)

---

### 8. Conversation Summarization for Long Sessions

**Value proposition:**
- Maintain context beyond LLM token limits
- Enable multi-session conversations
- Reduce token costs for long histories

**Implementation requirements:**

| Component | Requirement | Complexity |
|-----------|-------------|------------|
| Sliding Window | Keep last N messages + summary of older ones | Medium |
| Summarization LLM Call | Generate summary when history exceeds threshold | Low |
| Summary Storage | Persist summaries in database | Low |
| Context Injection | Prepend summary to chat history | Low |

**Use case:** User returns days later. Instead of sending 100 messages to LLM, send summary + recent 10.

**Complexity:** Medium. Pattern well-documented in LangChain/LlamaIndex ecosystems.

**References:**
- [5 Techniques in How to Ingest Chat History/Memory to an AI Chatbot](https://genailia.medium.com/5-techniques-in-how-to-pump-chat-history-to-an-ai-chatbot-application-b7c1509fb5ec)
- [Building Stateful Conversations with Postgres and LLMs](https://medium.com/@levi_stringer/building-stateful-conversations-with-postgres-and-llms-e6bb2a5ff73e)

---

## Anti-Features

Features to deliberately NOT build. Common mistakes in chatbot implementations.

### ❌ Auto-Advancing Without Confirmation

**What NOT to do:**
- Automatically move to next phase when fields complete
- Skip summary confirmation step
- Submit calculation without explicit user approval

**Why avoid:**
- Users need moment to review before proceeding
- [Violates progressive disclosure principles](https://www.nngroup.com/articles/progressive-disclosure/)
- Creates feeling of loss of control

**What to do instead:**
- Require explicit confirmation at summary phase (already implemented)
- Always show "Is this correct?" before final action
- Let user control pace of conversation

**Reference:** [AI Chatbot UX: 2026's Top Design Best Practices](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots) warns against removing user agency.

---

### ❌ Infinite Tool Calling Loops

**What NOT to do:**
- Allow LLM to call same tool repeatedly without limit
- No circuit breaker for failed tool calls
- Re-call tool with identical invalid parameters

**Why avoid:**
- [Cost and latency explosion](https://composio.dev/blog/ai-agent-tool-calling-guide)
- Frustrates users with endless "calculating..."
- Wastes API tokens

**What to do instead:**
- Max 3 retry attempts per tool per turn
- Validate parameters BEFORE calling expensive tools
- Return clear errors that prevent retry with same args

**Reference:** [Tool Calling Explained: The Core of AI Agents (2026 Guide)](https://composio.dev/blog/ai-agent-tool-calling-guide) emphasizes circuit breaker patterns.

---

### ❌ Loading 50+ Tool Definitions into Every Prompt

**What NOT to do:**
- Send all possible tools to LLM in every request
- Include rarely-used tools "just in case"
- Ignore token costs of tool schemas

**Why avoid:**
- [58 tools consume ~55k tokens](https://docs.anthropic.com/en/docs/build-with-claude/tool-use) (Anthropic research)
- Model accuracy degrades with too many options
- Unnecessary latency and cost

**What to do instead:**
- Only include relevant tools for current state
- `job_details` phase: No tools needed (data collection only)
- `summary` phase: Only `calculate_net_salary` tool
- Use Tool Search if expanding beyond 30 tools

**Reference:** [Claude 4.5: Function Calling and Tool Use](https://composio.dev/blog/claude-function-calling-tools) documents accuracy degradation patterns.

---

### ❌ Over-Relying on Quick Reply Chips

**What NOT to do:**
- Force all input through chips (disable typing)
- Show 10+ chips per message
- Use chips for open-ended questions

**Why avoid:**
- [Removes user freedom](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0)
- Character limits make complex answers impossible
- Frustrates power users who type faster

**What to do instead:**
- Max 4 chips per message (mobile friendly)
- Always allow typing alongside chips
- Reserve chips for enum fields, yes/no, confirmations
- Never for: names, numbers, free-text responses

**Reference:** [Chatbot Best Practices for Business (2026)](https://www.revechat.com/blog/chatbot-best-practices/) emphasizes hybrid input.

---

### ❌ Storing Conversation History Forever

**What NOT to do:**
- Keep all conversations indefinitely
- No TTL or archival strategy
- Expose old conversations in UI without filtering

**Why avoid:**
- GDPR compliance issues (data retention limits)
- [Database bloat impacts performance](https://aws.amazon.com/blogs/database/amazon-dynamodb-data-models-for-generative-ai-chatbots/)
- Users uncomfortable seeing years-old chats

**What to do instead:**
- 90-day TTL recommended (DynamoDB best practice)
- Archive to cold storage after 30 days of inactivity
- Purge after 1 year or on user request
- Clear "Delete conversation" option in UI

**Reference:** [Amazon DynamoDB data models for generative AI chatbots](https://aws.amazon.com/blogs/database/amazon-dynamodb-data-models-for-generative-ai-chatbots/) details TTL patterns.

---

### ❌ Hallucinating Tool Call Results

**What NOT to do:**
- LLM claims it performed action without actually calling tool
- No verification that tool was executed
- Trust LLM's self-reported tool usage

**Why avoid:**
- ["Deception" is common failure mode](https://www.giskard.ai/knowledge/function-calling-in-llms-testing-agent-tool-usage-for-ai-security)
- Users receive incorrect information
- Breaks trust in system

**What to do instead:**
- Log all tool executions server-side
- Verify tool was called before generating response
- Display tool result badges in UI ("✓ Calculated")
- Include actual tool output in response, not LLM's interpretation

**Reference:** [Function calling in LLMs: Testing agent tool usage for AI Security](https://www.giskard.ai/knowledge/function-calling-in-llms-testing-agent-tool-usage-for-ai-security) documents deception patterns.

---

## Feature Dependencies

```
Conversation Persistence (foundational)
  ↓
  ├─ Session Management
  ├─ Conversation Summarization (requires history storage)
  └─ Multi-device Sync

Progressive Disclosure (already implemented)
  ↓
  └─ Quick Reply Chips (enhances existing flow)

Tool Calling (already implemented)
  ↓
  ├─ Parameter Validation
  ├─ Retry Logic
  └─ Error Recovery

RAG (already implemented)
  ↓
  └─ Enhanced Citations (requires chunk metadata)
```

**Critical path:**
1. Conversation Persistence (enables everything else)
2. Parameter Validation (improves existing tool calling)
3. Quick Reply Chips (low-hanging UX improvement)
4. Enhanced Citations (high-value, high-complexity)

---

## MVP Recommendation for v1.1

**Must-Have (Table Stakes):**
1. ✅ Conversation History Storage & Retrieval
2. ✅ Progressive Disclosure (already implemented)
3. ✅ Error Handling with Clear Feedback (enhance existing)
4. ✅ Human Handoff / Exit Strategy

**Should-Have (Differentiators - pick 2):**
5. ✅ AI-Generated Suggested Response Chips (high ROI, low complexity)
6. ✅ Advanced Tool Calling with Retry (enhances existing feature)

**Nice-to-Have (Defer to v1.2):**
7. ⏸️ Enhanced RAG Citation Attribution (high complexity, research-heavy)
8. ⏸️ Conversation Summarization (not needed for short sessions)

**Rationale:**
- Conversation persistence is non-negotiable for multi-session usage
- Quick reply chips provide immediate UX improvement for mobile users
- Tool retry logic fixes existing edge cases with minimal effort
- Enhanced citations require significant R&D; defer until core features stable

---

## Complexity Assessment

| Feature | Complexity | Effort (days) | Dependencies |
|---------|------------|---------------|--------------|
| Conversation History Storage | Low | 2-3 | Supabase schema, UI |
| Progressive Disclosure | ✅ Done | 0 | N/A |
| Error Handling & Validation | Low | 1-2 | Pydantic schemas |
| Human Handoff / Exit Strategy | Low | 1-2 | UI components |
| Quick Reply Chips | Medium | 3-4 | LLM prompt, frontend |
| Enhanced RAG Citations | High | 8-10 | Chunk metadata, post-processing |
| Advanced Tool Retry Logic | Medium | 2-3 | Validation framework |
| Conversation Summarization | Medium | 3-4 | History storage (prerequisite) |

**Total MVP estimate:** 9-13 days (features 1, 3, 4, 5, 6)

---

## Sources

### Conversation Persistence
- [AI SDK UI: Chatbot Message Persistence](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence)
- [Amazon DynamoDB data models for generative AI chatbots](https://aws.amazon.com/blogs/database/amazon-dynamodb-data-models-for-generative-ai-chatbots/)
- [Persistent Memory for Chatbots using PostgreSQL and LangChain](https://hexacluster.ai/blog/postgres-for-chat-history-langchain-postgres-postgreschatmessagehistory)
- [AI Chatbot Session Management: Best Practices](https://optiblack.com/insights/ai-chatbot-session-management-best-practices)
- [Chatbot Best Practices You Can't Afford to Miss in 2026](https://botpress.com/blog/chatbot-best-practices)

### LLM Function Calling
- [The Anatomy of Tool Calling in LLMs: A Deep Dive](https://martinuke0.github.io/posts/2026-01-07-the-anatomy-of-tool-calling-in-llms-a-deep-dive/)
- [Function Calling with LLMs | Prompt Engineering Guide](https://www.promptingguide.ai/applications/function_calling)
- [Function calling using LLMs](https://martinfowler.com/articles/function-call-LLM.html)
- [Tool Calling Explained: The Core of AI Agents (2026 Guide)](https://composio.dev/blog/ai-agent-tool-calling-guide)
- [Mastering LLM Tool Calling: The Complete Framework](https://machinelearningmastery.com/mastering-llm-tool-calling-the-complete-framework-for-connecting-models-to-the-real-world/)
- [LLM Function-Calling Pitfalls Nobody Mentions](https://medium.com/@2nick2patel2/llm-function-calling-pitfalls-nobody-mentions-a0a0575888b1)

### Quick Reply Chips
- [11 Use Cases for Suggest Reply AI That Drive Results (2026)](https://bluetweak.com/blog/ai-suggested-replies/)
- [Quick reply - Chatbot.com](https://www.chatbot.com/help/bot-responses/how-to-use-quick-replies/)
- [Push The Button: Quick Replies And The Chatbot Experience](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0)
- [The 20 best looking chatbot UIs in 2026](https://www.jotform.com/ai/agents/best-chatbot-ui/)

### Data Extraction & Validation
- [The Complete Guide to Using Pydantic for Validating LLM Outputs](https://machinelearningmastery.com/the-complete-guide-to-using-pydantic-for-validating-llm-outputs/)
- [How to Use Pydantic for LLMs: Schema, Validation & Prompts](https://pydantic.dev/articles/llm-intro)
- [LLMs for Structured Data Extraction from PDFs in 2026](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)
- [The guide to structured outputs and function calling with LLMs](https://agenta.ai/blog/the-guide-to-structured-outputs-and-function-calling-with-llms)

### RAG Citation Quality
- [CiteFix: Enhancing RAG Accuracy Through Post-Processing Citation Correction](https://arxiv.org/abs/2504.15629)
- [FACTUM: Mechanistic Detection of Citation Hallucination in Long-Form RAG](https://arxiv.org/pdf/2601.05866)
- [LLM Citations Explained: RAG & Source Attribution Methods](https://rankstudio.net/articles/en/ai-citation-frameworks)
- [Citation-Aware RAG: Fine Grained Citations](https://www.tensorlake.ai/blog/rag-citations)

### Progressive Disclosure & UX
- [Progressive Disclosure Matters: Applying 90s UX Wisdom to 2026 AI Agents](https://aipositive.substack.com/p/progressive-disclosure-matters)
- [Progressive Disclosure | AI Design Patterns](https://www.aiuxdesign.guide/patterns/progressive-disclosure)
- [Progressive Disclosure - NN/G](https://www.nngroup.com/articles/progressive-disclosure/)
- [AI Chatbot UX: 2026's Top Design Best Practices](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots)

### Common Mistakes & Anti-Patterns
- [How To Build A Chatbot: 10 User Experience Design Mistakes To Avoid](https://www.certainly.io/blog/top-ux-mistakes-chatbot)
- [11 Most Common Chatbot Mistakes (From AI Experts)](https://botpress.com/blog/common-chatbot-mistakes)
- [What Causes Chatbot Drop-Off and How to Fix It](https://velaro.com/blog/chatbot-abandonment-reasons-and-solutions)
- [Function calling in LLMs: Testing agent tool usage for AI Security](https://www.giskard.ai/knowledge/function-calling-in-llms-testing-agent-tool-usage-for-ai-security)
