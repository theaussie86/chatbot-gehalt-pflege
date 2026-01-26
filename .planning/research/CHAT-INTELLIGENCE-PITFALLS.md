# Pitfalls Research: Chat Intelligence Features

**Domain:** Conversational AI Enhancement
**Researched:** 2026-01-26
**Context:** Adding Chat Intelligence to existing Gehalt-Pflege chatbot (Gemini 2.0, Supabase, State Machine)
**Overall Confidence:** HIGH

## Executive Summary

This research identifies 23 critical pitfalls when adding Chat Intelligence features (conversation persistence, function calling, suggested responses, data extraction validation, citations) to an existing chatbot system. Pitfalls are prioritized by severity (P0 = Critical, P1 = Important, P2 = Minor) and organized by feature area with specific detection and prevention strategies.

**Key Finding:** Most failures are organizational and integration-related, not purely technical. The biggest risks come from:
1. State synchronization between persistence layers (localStorage ↔ DB)
2. Schema validation gaps in function calling
3. State machine rigidity conflicting with conversation history
4. RAG citation quality vs. speed tradeoffs

---

## Critical Pitfalls (P0)

### P0-1: State Sync Corruption (Conversation Persistence)

**What goes wrong:** Local storage and database state diverge during network interruptions or rapid user actions, causing data loss or duplication.

**Root cause:** Frequent synchronization triggers many read/write operations. JSON parsing/stringifying for complex objects becomes expensive. Browser localStorage limits (5-10MB) cause silent failures.

**Consequences:**
- User sees conversation A, bot responds based on conversation B (data from DB)
- Messages appear duplicated or out of order after page refresh
- State machine transitions corrupt (formState shows "tax_details" but data only has "job_details")
- Silent data loss when storage quota exceeded

**Warning signs:**
- Inconsistent message counts between client and server
- `localStorage.setItem()` failures not caught
- Race conditions during rapid message exchanges
- No versioning on persisted state schema

**Prevention strategy:**
```typescript
// ❌ BAD: Synchronous writes on every message
localStorage.setItem('history', JSON.stringify(messages));

// ✅ GOOD: Debounced writes with error handling
const persistState = debounce((state: ConversationState) => {
  try {
    const serialized = JSON.stringify(state);
    if (serialized.length > 5 * 1024 * 1024) { // 5MB check
      console.warn('State too large, truncating...');
      // Implement truncation strategy
    }
    localStorage.setItem('conv_state', serialized);
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      // Clear old data, retry
      clearOldestMessages();
    }
  }
}, 500);

// Include version for schema migrations
const STATE_VERSION = 2;
```

**Integration with existing system:**
- Current `FormState` (apps/api/types/form.ts) has no version field
- State machine (`SalaryStateMachine`) assumes all required fields present
- Add `stateVersion: number` to FormState
- Implement migration logic when loading from localStorage

**Phase assignment:** Phase 1 (Conversation Persistence Foundation)

**Sources:**
- [Persistence Pays Off: React Components with Local Storage Sync](https://dev.to/mattlewandowski93/persistence-pays-off-react-components-with-local-storage-sync-2bfk)
- [Databases and Persistent Storage for Conversation Data | Symbl.ai](https://symbl.ai/developers/blog/databases-and-persistent-storage-for-conversation-data/)

---

### P0-2: Function Calling Schema Drift

**What goes wrong:** Backend updates required fields in tool definition, but LLM still uses old schema, causing validation failures and broken calculations.

**Root cause:** Tool schemas exist in multiple places (frontend type definitions, backend validation, LLM configuration). When one changes, others aren't updated atomically.

**Consequences:**
- Salary calculation tool called with missing `numberOfChildren`, breaks TaxWrapper
- LLM invents parameters not in schema (hallucinated IDs, amounts)
- Backend rejects valid function calls due to version mismatch
- Silent failures where LLM claims it calculated but tool never executed

**Warning signs:**
- Function call attempts increase but execution rate drops
- Validation errors mention fields not in current schema
- LLM apologizes for "technical difficulties" repeatedly
- Tool definitions in code don't match Gemini API config

**Prevention strategy:**
```typescript
// ❌ BAD: Hardcoded schema in multiple files
// File 1: apps/api/utils/agent/config.ts
const SALARY_TOOL = { name: "calculate_net_salary", parameters: {...} };

// File 2: apps/api/types/form.ts
interface TaxDetails { taxClass: string; /* ... */ }

// ✅ GOOD: Single source of truth with code generation
// schema/tools.schema.json (source of truth)
{
  "calculate_net_salary": {
    "version": "2.1.0",
    "parameters": { "taxClass": { "type": "string", "required": true } }
  }
}

// Generated from schema (CI step):
// - apps/api/types/tools.generated.ts (TypeScript types)
// - apps/api/utils/agent/config.generated.ts (Gemini tool config)

// Runtime validation:
import { validateToolCall } from './validation';
const result = validateToolCall(call.name, call.args, '2.1.0');
```

**Integration with existing system:**
- Current `SALARY_TOOL` (apps/api/utils/agent/config.ts) is manually defined
- `GeminiAgent.sendMessage()` extracts function calls without version checking
- `TaxWrapper.calculate()` has loose validation (uses `??` defaults)

**Mitigation steps:**
1. Add `toolSchemaVersion` to FormState for debugging
2. Log all function call attempts vs. executions (detect drift)
3. Implement structured output validation (Gemini 3 feature)
4. Use Pydantic-equivalent for TypeScript (Zod) for runtime validation

**Phase assignment:** Phase 2 (Function Calling Enhancement) - Day 1 task

**Sources:**
- [LLM Function-Calling Pitfalls Nobody Mentions](https://medium.com/@2nick2patel2/llm-function-calling-pitfalls-nobody-mentions-a0a0575888b1)
- [Function calling with the Gemini API](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini 3 Structured Output validation](https://blog.google/technology/developers/gemini-api-structured-outputs/)

---

### P0-3: RAG Citation Hallucination

**What goes wrong:** LLM generates citations to page numbers or sources that don't exist, undermining user trust in salary information.

**Root cause:** Citation metadata not stored at chunking time, or LLM asked to "generate citations" rather than "use provided citations." Model confabulates when instructed to cite but no citation data provided.

**Consequences:**
- User: "What's the TVöD rate for E5?" Bot: "According to page 23..." (document only has 10 pages)
- Legal liability: incorrect salary info attributed to authoritative document
- Users distrust all bot responses, abandon chatbot

**Warning signs:**
- Citations reference pages outside document range
- Multiple chunks from same document cite different page numbers for same fact
- `queryWithMetadata()` returns empty metadata but bot still cites sources
- Users report "I checked page X, that's not what it says"

**Prevention strategy:**
```typescript
// ❌ BAD: Ask LLM to generate citations
const prompt = `Answer with citations to page numbers: ${question}`;

// ✅ GOOD: Provide citations in context, validate in response
const resultsWithCitations = await vectorstore.queryWithMetadata(question, projectId, 5);

// Build context with citation markers
const context = resultsWithCitations.map((r, idx) =>
  `[Source ${idx+1}: ${r.metadata.filename}, page ${r.metadata.pageNumber || 'N/A'}]\n${r.content}`
).join('\n\n');

const prompt = `Use ONLY the provided sources. When citing, use the exact [Source N] format.
Context: ${context}

Question: ${question}`;

// Validate response only references provided source IDs
const response = await agent.sendMessage(prompt, history);
const citedSources = extractSourceIds(response); // [1, 3]
const validSources = citedSources.every(id => id <= resultsWithCitations.length);
if (!validSources) {
  throw new Error('Response cited non-existent sources');
}
```

**Integration with existing system:**
- `VectorstoreService.queryWithMetadata()` exists but returns `chunkIndex`, not page numbers
- Current chunking in `splitTextIntoChunks()` doesn't preserve page boundaries
- Gemini text extraction (`extractTextFromFile()`) loses page metadata from PDFs
- RAG injection happens in `GeminiAgent.sendMessage()` via `contextDocuments` without citation format

**Mitigation steps:**
1. **Phase 5 (Citation Quality):** Modify chunking to preserve page numbers
   - Use Gemini's PDF parsing with page markers: `--PAGE 5--\n\nContent...`
   - Store `pageNumber` in document_chunks metadata column
   - Update `match_documents_with_metadata` RPC to return page numbers
2. Add citation validation layer (reject hallucinated citations)
3. Prompt engineering: "NEVER cite a page not explicitly marked in context"
4. Test with deliberate "citation traps" (ask about content not in docs)

**Phase assignment:** Phase 5 (Citation Quality)

**Sources:**
- [Citation-Aware RAG: How to add Fine Grained Citations](https://www.tensorlake.ai/blog/rag-citations)
- [RAG with in-line citations | LlamaIndex](https://developers.llamaindex.ai/python/examples/workflow/citation_query_engine/)
- [Retrieval Augmented Generation with Citations - Zilliz](https://zilliz.com/blog/retrieval-augmented-generation-with-citations)

---

### P0-4: Context Window Explosion

**What goes wrong:** As conversation history grows, it exceeds Gemini's context window (200k tokens for 2.5 Flash), causing truncation or errors. Performance degrades as processing time increases linearly with history size.

**Root cause:** Conversation persistence sends entire history on every request. State machine adds system instructions. RAG adds document context. Combined payload exceeds limits.

**Consequences:**
- Gemini API returns 400 errors: "Request too large"
- Older messages silently truncated, bot "forgets" user's earlier answers
- Latency increases (5s → 15s) as conversation lengthens
- Cost explosion ($0.30 per 1M tokens * repeated history)

**Warning signs:**
- Response times increase linearly with conversation length
- Errors appear after 15-20 message exchanges
- Token counts in logs approach 200k
- Users complain bot "forgot" what they said earlier

**Prevention strategy:**
```typescript
// ❌ BAD: Send full history always
const history = await getConversationHistory(conversationId); // 50 messages
await agent.sendMessage(userMessage, history); // 💥 200k tokens

// ✅ GOOD: Sliding window + summarization
import { estimateTokens } from './tokenizer';

const CONTEXT_LIMIT = 100_000; // tokens (50% of model limit for safety)
const CRITICAL_DATA_LIMIT = 20_000; // reserve for state machine data

async function prepareHistory(
  conversationId: string,
  formState: FormState
): Promise<AgentMessage[]> {
  const fullHistory = await getConversationHistory(conversationId);

  // Always include: last 5 messages + form state
  const recentMessages = fullHistory.slice(-5);
  const formStateTokens = estimateTokens(JSON.stringify(formState));

  let tokenBudget = CONTEXT_LIMIT - CRITICAL_DATA_LIMIT - formStateTokens;

  // Add recent messages until budget exhausted
  const selectedHistory: AgentMessage[] = [];
  for (const msg of recentMessages.reverse()) {
    const msgTokens = estimateTokens(msg.content);
    if (tokenBudget - msgTokens < 0) break;
    selectedHistory.unshift(msg);
    tokenBudget -= msgTokens;
  }

  // If still have budget and older messages exist, add summary
  if (tokenBudget > 5000 && fullHistory.length > selectedHistory.length) {
    const olderMessages = fullHistory.slice(0, -5);
    const summary = await summarizeHistory(olderMessages);
    selectedHistory.unshift({
      role: 'system',
      content: `[Previous conversation summary]: ${summary}`
    });
  }

  return selectedHistory;
}
```

**Integration with existing system:**
- Current `GeminiAgent.sendMessage()` accepts `history: AgentMessage[]` with no truncation
- State machine instructions added via `getNextStep().systemInstructions`
- RAG context injected via `contextDocuments` (untruncated)
- No token counting or budget management

**Mitigation steps:**
1. Implement token estimation (use tiktoken or approximation: 1 token ≈ 4 chars)
2. Add conversation summarization endpoint (use Gemini to compress old messages)
3. Store summaries in `conversations` table for reuse
4. Monitor token usage per request (add to logs)

**Phase assignment:** Phase 1 (Conversation Persistence) - must solve before scaling

**Sources:**
- [Managing Chat History at scale in Generative AI Chatbots](https://builder.aws.com/content/2j9daS4A39fteekgv9t1Hty11Qy/managing-chat-history-at-scale-in-generative-ai-chatbots)
- [How do chatbots store conversation history?](https://www.tencentcloud.com/techpedia/128208)

---

## Important Pitfalls (P1)

### P1-1: Suggested Response Overload

**What goes wrong:** Every bot message shows 3-5 suggested response chips, overwhelming users and making them feel railroaded.

**Root cause:** Designers assume "more options = better UX." Reality: users want freedom to type naturally. Over-suggesting violates conversation norms.

**Consequences:**
- 67% of users leave if trapped in loops without escape
- Users ignore suggestions and type anyway (wasted API calls generating them)
- Accessibility issues: screen readers announce 5 buttons per response
- Mobile UI cramped with button rows

**Warning signs:**
- Click-through rate on suggested responses <20%
- Users type similar but not exact text as suggestions
- Support requests: "How do I say something else?"
- A/B test shows better completion rate WITHOUT suggestions

**Prevention strategy:**
```typescript
// ❌ BAD: Always show suggestions
<div className="suggestions">
  {botMessage.suggestions.map(s => <Chip>{s}</Chip>)}
</div>

// ✅ GOOD: Contextual suggestions only
function shouldShowSuggestions(context: ConversationContext): boolean {
  const reasons = [
    context.userSeemsStuck,           // 3+ unclear inputs
    context.isMultipleChoiceQuestion, // "Steuerklasse 1, 2, oder 3?"
    context.stateTransitionPoint,     // Moving job_details → tax_details
    context.isFirstMessage           // Onboarding
  ];

  return reasons.some(r => r === true);
}

// Limit to 3-5 suggestions, always include "free form" option
const suggestions = generateSuggestions(context).slice(0, 3);
suggestions.push({ text: "Etwas anderes...", action: 'focus_input' });
```

**Integration with existing system:**
- State machine (`SalaryStateMachine.getNextStep()`) provides `systemInstructions` but no suggestion generation
- Frontend (apps/web) has no suggestion UI components yet
- Would need to detect "multiple choice" vs. "open-ended" questions

**Best practices:**
- Yes/No questions: Always show chips with context ("Ja, Kirchensteuer zahlen" not just "Ja")
- Numeric inputs (hours, children): Show chips for common values (40h, 38.5h, Vollzeit)
- Open text (unusual state variations): No chips, free input
- Always provide escape hatch: "Korrigieren" or "Andere Antwort"

**Phase assignment:** Phase 3 (Suggested Responses) - make this decision during design

**Sources:**
- [AI Chatbot UX: 2026's Top Design Best Practices](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots)
- [Chatbot buttons vs quick replies | Activechat.ai](https://activechat.ai/news/chatbot-buttons-vs-quick-replies/)
- [Push The Button: Quick Replies And The Chatbot Experience](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0)

---

### P1-2: State Machine Becomes Conversation Straitjacket

**What goes wrong:** Rigid state machine prevents natural conversation flow. User wants to go back and correct hours (job_details) while in tax_details state, but system blocks transition.

**Root cause:** `SalaryStateMachine.canTransition()` enforces strict forward progression. Conversation persistence allows users to reference earlier context, but state machine doesn't support backtracking.

**Consequences:**
- User: "Actually, I work 38.5 hours, not 40"
- Bot: "I'm sorry, we're past that stage. Please complete tax details first."
- User abandons conversation, starts over
- Low completion rate due to inflexibility

**Warning signs:**
- Users say "wait", "actually", "I meant", "go back" frequently
- State machine validation errors increase with conversation length
- Users restart conversations instead of correcting mistakes
- Support requests: "How do I change my earlier answer?"

**Prevention strategy:**
```typescript
// ❌ BAD: Strict forward-only transitions
if (!SalaryStateMachine.canTransition(currentState, 'job_details')) {
  return "Sorry, can't go back. Please continue.";
}

// ✅ GOOD: Intent-aware transitions
import { ConversationAnalyzer } from './ConversationAnalyzer';

async function handleMessage(message: string, state: FormState) {
  const intent = await analyzer.detectIntent(message, state);

  if (intent.type === 'modification') {
    // Allow backward transition for corrections
    const targetSection = intent.targetSection; // 'job_details' | 'tax_details'
    const field = intent.field; // 'hours'

    return {
      formState: {
        ...state,
        section: targetSection, // Move back
        data: {
          ...state.data,
          [targetSection]: {
            ...state.data[targetSection],
            [field]: undefined // Clear for re-entry
          }
        }
      },
      message: `Okay, let's update ${field}. What's the correct value?`
    };
  }

  // Normal state machine flow for other intents
  const nextStep = SalaryStateMachine.getNextStep(state);
  // ...
}
```

**Integration with existing system:**
- `ConversationAnalyzer` exists (apps/api/utils/agent/ConversationAnalyzer.ts)
- Current implementation detects `modification` intent
- State machine allows backward transition from summary → job_details/tax_details
- Need to extend: support modifications DURING tax_details, not just from summary

**Mitigation steps:**
1. Add `lastModifiedSection` to FormState (track where user wants to edit)
2. Modify `getNextStep()` to check for modification intent before enforcing forward flow
3. Prompt engineering: teach bot to ask "Do you want to change that?" when detecting modifications
4. Log modification attempts to understand common correction patterns

**Phase assignment:** Phase 1 (Conversation Persistence) - critical for multi-turn UX

**Sources:**
- [Is Chatbot Dialog State Machine Deprecation Inevitable?](https://cobusgreyling.medium.com/is-chatbot-dialog-state-machine-deprecation-inevitable-1f08a7b5fde3)
- [Guiding AI Conversations through Dynamic State Transitions](https://promptengineering.org/guiding-ai-conversations-through-dynamic-state-transitions/)

---

### P1-3: Data Extraction Validator Relies Solely on LLM

**What goes wrong:** Extracted values (taxClass, hours, state) pass through LLM validation only. No deterministic checks. LLM validates "Steuerklasse: sieben" as valid (should be 1-6).

**Root cause:** Trusting LLM output without secondary validation. Structured outputs guarantee syntax (valid JSON) but not semantics (valid values).

**Consequences:**
- `TaxWrapper.calculate()` receives `taxClass: "sieben"`, crashes
- Database stores invalid data (hours: -5, numberOfChildren: 100)
- Users receive wildly incorrect salary calculations
- Need manual cleanup of bad data

**Warning signs:**
- Calculation errors with vague messages: "Invalid input"
- Data quality checks fail: 10% of records have out-of-range values
- Users report: "Bot said my salary is €1,000,000/month"
- Retry rate increases (users keep correcting bot's mistakes)

**Prevention strategy:**
```typescript
// ❌ BAD: LLM-only validation
const extracted = await llm.extract(userMessage);
formState.data.tax_details.taxClass = extracted.taxClass; // 💥 might be "sieben"

// ✅ GOOD: Two-phase validation (LLM → Deterministic)
import { z } from 'zod';

const TaxDetailsSchema = z.object({
  taxClass: z.enum(['1', '2', '3', '4', '5', '6']),
  churchTax: z.boolean(),
  numberOfChildren: z.number().int().min(0).max(20),
  hours: z.number().positive().max(80)
});

async function extractAndValidate(
  userMessage: string,
  field: keyof TaxDetails
): Promise<{ valid: boolean; value?: any; error?: string }> {
  // Phase 1: LLM extraction
  const extracted = await llm.extract(userMessage, field);

  // Phase 2: Schema validation
  try {
    const validated = TaxDetailsSchema.pick({ [field]: true }).parse(extracted);
    return { valid: true, value: validated[field] };
  } catch (e) {
    if (e instanceof z.ZodError) {
      // Provide specific error for re-prompting
      return {
        valid: false,
        error: `${field} must be ${e.errors[0].message}`
      };
    }
    throw e;
  }
}
```

**Integration with existing system:**
- `ResponseValidator` exists (apps/api/utils/agent/ResponseValidator.ts) - check if it has deterministic rules
- State machine defines required fields but not validation rules
- `TaxWrapper.calculate()` uses `??` defaults instead of throwing on invalid input (masks validation issues)

**Mitigation steps:**
1. Create Zod schemas for all form fields (job_details, tax_details)
2. Update `ResponseValidator` to use schemas
3. Add validation errors to FormState: `validationErrors: Record<string, string>`
4. Bot reprompts with specific error: "Steuerklasse muss zwischen 1 und 6 liegen"
5. Log validation failures to detect common extraction issues

**Phase assignment:** Phase 4 (Data Extraction Validation) - foundational for Phase 4

**Sources:**
- [The Complete Guide to Using Pydantic for Validating LLM Outputs](https://machinelearningmastery.com/the-complete-guide-to-using-pydantic-for-validating-llm-outputs/)
- [LLMs for Structured Data Extraction from PDFs in 2026](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)
- [Structured outputs | Gemini API](https://ai.google.dev/gemini-api/docs/structured-output)

---

### P1-4: Database Persistence Without RLS for Conversations

**What goes wrong:** Conversations table lacks Row-Level Security. User A can query user B's salary conversations via modified API calls.

**Root cause:** Adding conversations table without RLS policies (easy to forget when adding new tables). Supabase defaults to no access without explicit policies.

**Consequences:**
- Privacy breach: sensitive salary data exposed across users
- GDPR violation: unauthorized access to personal data
- Users lose trust in chatbot
- Legal liability

**Warning signs:**
- New table created without `ALTER TABLE ENABLE ROW LEVEL SECURITY`
- No policies defined for `SELECT`, `INSERT`, `UPDATE`, `DELETE`
- Service role bypasses RLS but client SDK doesn't
- Test queries from different users return each other's data

**Prevention strategy:**
```sql
-- ❌ BAD: Table without RLS
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  messages JSONB[]
);
-- No RLS enabled! 💥

-- ✅ GOOD: RLS-first approach
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  messages JSONB[] DEFAULT '[]'::jsonb[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS immediately
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- User can only access their own conversations
CREATE POLICY "Users can view own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role policy for background jobs
CREATE POLICY "Service role full access"
  ON conversations
  USING (auth.jwt() ->> 'role' = 'service_role');
```

**Integration with existing system:**
- Existing `documents` and `projects` tables have RLS (see v1.0 milestone)
- Pattern: Service role uses JWT claim check `auth.jwt() ->> 'role' = 'service_role'`
- Must follow same pattern for conversations table

**Mitigation steps:**
1. Create migration: `20260127_add_conversations_table.sql`
2. Enable RLS before inserting any data
3. Write policies for user access + service role
4. Test with multiple user accounts (ensure isolation)
5. Add to CI: check all tables have RLS enabled

**Phase assignment:** Phase 1 (Conversation Persistence) - Day 1 blocker

**Sources:**
- [Best Practices for Supabase | Security, Scaling & Maintainability](https://www.leanware.co/insights/supabase-best-practices)
- [Supabase Best Practices for storing sensitive data](https://github.com/orgs/supabase/discussions/21073)

---

### P1-5: Suggested Responses Generated by Separate LLM Call

**What goes wrong:** Every bot response triggers second LLM call to generate suggested chips. Doubles latency (3s → 6s) and cost.

**Root cause:** Treating suggestion generation as separate task instead of part of main response.

**Consequences:**
- User waits 6+ seconds for response + suggestions
- Costs double: 2 Gemini API calls per user message
- Suggestions sometimes contradict main response (different contexts)
- Race condition: suggestions arrive before/after main message

**Warning signs:**
- Network tab shows two `/generate` calls per user message
- Suggestions don't match response tone or context
- Users see message, then buttons pop in later (layout shift)
- Cost analysis shows 2x expected API usage

**Prevention strategy:**
```typescript
// ❌ BAD: Separate calls
const response = await agent.sendMessage(message, history);
const suggestions = await agent.generateSuggestions(response); // 2nd call 💸

// ✅ GOOD: Structured output in single call
const prompt = `${systemInstruction}

Respond in JSON format:
{
  "message": "Your conversational response",
  "suggestions": ["Option 1", "Option 2", "Option 3"]
}

Only include suggestions if this is a multiple-choice question.`;

const result = await agent.sendMessage(prompt, history, {
  responseFormat: 'json',
  structuredOutputSchema: ResponseWithSuggestionsSchema
});

const parsed = JSON.parse(result);
return {
  text: parsed.message,
  suggestions: parsed.suggestions || []
};
```

**Integration with existing system:**
- Current `GeminiAgent.sendMessage()` returns plain string
- No structured output format configured
- Gemini 2.5 Flash supports JSON mode and structured outputs
- Would need to update response parsing in chat route

**Mitigation steps:**
1. Update agent config to use structured output (Gemini API feature)
2. Define response schema: `{ message: string, suggestions?: string[] }`
3. Only request suggestions when needed (use conditional prompting)
4. Cache common suggestions (e.g., tax class chips reused across conversations)

**Phase assignment:** Phase 3 (Suggested Responses)

**Sources:**
- [Structured outputs | Gemini API](https://ai.google.dev/gemini-api/docs/structured-output)
- [Improving Structured Outputs in the Gemini API](https://blog.google/technology/developers/gemini-api-structured-outputs/)

---

## Minor Pitfalls (P2)

### P2-1: Conversation Export Lacks Machine-Readable Format

**What goes wrong:** Users export conversation as pretty HTML/PDF, but can't import it elsewhere or analyze it programmatically.

**Root cause:** Only human-readable export implemented. No JSON/CSV export option.

**Consequences:**
- Users can't transfer conversation to another salary tool
- Can't analyze conversation data (e.g., find all Steuerklasse 3 calculations)
- Support team can't debug issues (need structured data)

**Prevention:** Offer multiple export formats (JSON for machines, PDF for printing).

**Phase assignment:** Phase 1 (Conversation Persistence) - nice-to-have feature

---

### P2-2: No Conversation Title/Summary

**What goes wrong:** Conversation list shows "Conversation 1", "Conversation 2" instead of meaningful titles like "TVöD E5 Berechnung".

**Root cause:** Conversations saved by UUID only. No summarization step.

**Consequences:**
- Users can't find past conversations ("Which one was my Berlin calculation?")
- Cluttered UI with generic labels

**Prevention:** Generate title from first exchange or key data (tariff + state).

```typescript
function generateConversationTitle(formState: FormState): string {
  const { tarif, state } = formState.data.job_details || {};
  if (tarif && state) return `${tarif} - ${state}`;
  return `Berechnung vom ${new Date().toLocaleDateString('de-DE')}`;
}
```

**Phase assignment:** Phase 1 (Conversation Persistence) - UX improvement

---

### P2-3: Citation Page Numbers Stored as String

**What goes wrong:** Page numbers stored as strings ("5", "iv", "N/A") instead of integers. Sorting fails, queries inefficient.

**Root cause:** Generic text extraction doesn't normalize page references.

**Consequences:**
- Sorting citations alphabetically: "1", "10", "2" (wrong order)
- Can't query "all chunks from pages 5-10"
- Roman numerals (preface pages) break integer assumptions

**Prevention:** Store as JSONB: `{ pageNumber: int | null, pageLabel: string }`

```typescript
interface PageMetadata {
  pageNumber: number | null; // Numeric position (1, 2, 3, null for covers)
  pageLabel: string;          // Display label ("iv", "5", "Cover")
}
```

**Phase assignment:** Phase 5 (Citation Quality)

**Sources:**
- [Citation-Aware RAG: How to add Fine Grained Citations](https://www.tensorlake.ai/blog/rag-citations)

---

### P2-4: No Offline Indicator for Conversation Sync

**What goes wrong:** User types messages while offline. No indication messages aren't being saved to DB. Data lost on page close.

**Root cause:** No network status detection or queue mechanism.

**Consequences:**
- User thinks conversation saved, refreshes page, messages gone
- Frustration and lost work

**Prevention:** Show offline banner, queue messages in localStorage, sync on reconnect.

```typescript
// Detect offline
window.addEventListener('offline', () => {
  showBanner('Offline - messages will sync when reconnected');
});

// Queue messages
const offlineQueue = [];
if (!navigator.onLine) {
  offlineQueue.push(message);
  localStorage.setItem('offline_queue', JSON.stringify(offlineQueue));
}

// Sync on reconnect
window.addEventListener('online', async () => {
  const queue = JSON.parse(localStorage.getItem('offline_queue') || '[]');
  await syncMessages(queue);
  localStorage.removeItem('offline_queue');
});
```

**Phase assignment:** Phase 1 (Conversation Persistence) - Polish

---

### P2-5: RAG Similarity Threshold Too Aggressive

**What goes wrong:** Current threshold (0.5 in code, 0.75 in docs) filters out relevant results, bot says "I don't have that information" when document actually contains answer.

**Root cause:** Single fixed threshold doesn't work for all query types. Specific questions (TVöD table lookup) need high precision. Broad questions (what is Kirchensteuer?) need high recall.

**Consequences:**
- False negatives: relevant chunks excluded
- Users rephrase questions multiple times
- Low RAG utilization (system says "no info" too often)

**Prevention:** Dynamic thresholds based on query type.

```typescript
function getThresholdForQuery(query: string): number {
  if (query.match(/\d+/)) return 0.8; // Numeric queries (rates, tables) need precision
  if (query.length < 50) return 0.6;  // Short queries tolerate more variance
  return 0.7; // Default
}

const threshold = getThresholdForQuery(question);
const results = await supabase.rpc('match_documents', {
  match_threshold: threshold,
  // ...
});
```

**Integration with existing system:**
- `VectorstoreService.query()` hardcodes `match_threshold: 0.5`
- Documentation says 0.75 optimal (see CLAUDE.md note: "0.75 similarity threshold for RAG quality")
- Need to align and make configurable

**Phase assignment:** Phase 5 (Citation Quality) - Optimization

---

## Integration-Specific Pitfalls

### I-1: State Machine Transition Log Missing

**What goes wrong:** Bug report: "Bot asked for tax info twice." No way to debug which state transitions occurred.

**Root cause:** State machine transitions happen in-memory, not persisted.

**Consequences:**
- Can't reproduce bugs
- No analytics on completion funnels (where do users drop off?)
- A/B testing impossible (can't measure state transition rates)

**Prevention:** Log all state transitions to database.

```typescript
// Table: conversation_state_log
CREATE TABLE conversation_state_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  from_state VARCHAR(50),
  to_state VARCHAR(50),
  reason TEXT, -- "all_job_details_complete", "user_modification", etc.
  form_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

// In SalaryStateMachine.getNextStep()
const previousSection = currentState.section;
const nextStep = /* ... state machine logic */;

if (nextStep.nextState.section !== previousSection) {
  await logStateTransition({
    conversationId,
    fromState: previousSection,
    toState: nextStep.nextState.section,
    reason: nextStep.systemInstructions,
    formState: nextStep.nextState
  });
}
```

**Phase assignment:** Phase 1 (Conversation Persistence)

---

### I-2: Conversation ID Not Linked to FormState

**What goes wrong:** FormState passed separately from conversationId. Same user can have multiple concurrent conversations, but system only tracks one FormState in localStorage.

**Root cause:** FormState designed for single-conversation widget. Adding persistence requires 1:N relationship (user has many conversations).

**Consequences:**
- User starts calculation in Tab A (job_details)
- Opens Tab B, starts new calculation
- Tab A formState overwritten by Tab B localStorage write
- Tab A continues with wrong data
- Calculations mixed up

**Prevention:** Scope FormState by conversationId.

```typescript
// ❌ BAD: Single formState key
localStorage.setItem('formState', JSON.stringify(state));

// ✅ GOOD: Conversation-scoped state
const conversationId = generateConversationId(); // UUID
localStorage.setItem(`formState:${conversationId}`, JSON.stringify(state));

// URL includes conversationId for tab isolation
// /chat?conversationId=abc-123
```

**Integration with existing system:**
- Current system stateless (formState passed in each API call)
- No conversationId concept yet
- Need to generate ID on first message, pass in subsequent calls

**Phase assignment:** Phase 1 (Conversation Persistence) - Architecture decision

---

### I-3: RAG Context Pollutes State Machine Instructions

**What goes wrong:** State machine adds "Ask about Steuerklasse" instruction. RAG adds 3 document chunks. Combined prompt confuses LLM: bot responds with document facts instead of asking question.

**Root cause:** No priority ordering of context sources. LLM treats all context equally.

**Consequences:**
- Bot ignores state machine instructions
- Responds with tangential document content
- Fails to ask for required field
- Conversation stalls

**Prevention:** Structured context with explicit priorities.

```typescript
// ❌ BAD: Concatenate all context
const prompt = `${systemInstruction}\n${stateInstruction}\n${ragContext}\n\nUser: ${message}`;

// ✅ GOOD: Hierarchical context
const prompt = `
# PRIMARY DIRECTIVE (Highest Priority)
${stateInstruction}
You MUST follow this directive before incorporating other context.

# BACKGROUND KNOWLEDGE (Supporting Context)
The following information may help answer questions, but should NOT override your primary directive:
${ragContext}

# SYSTEM BEHAVIOR
${systemInstruction}

# USER MESSAGE
${message}
`;
```

**Phase assignment:** Phase 2 (Function Calling Enhancement) - Prompt engineering

---

### I-4: No Conversation Expiry/Archival

**What goes wrong:** Conversations table grows indefinitely. Query performance degrades. Users have 500 old conversations in list.

**Root cause:** No retention policy defined.

**Consequences:**
- Database bloat
- Slow conversation list loading
- Users overwhelmed by history

**Prevention:** Archive old conversations, add TTL.

```sql
-- Archive conversations older than 1 year
CREATE TABLE conversations_archive (LIKE conversations INCLUDING ALL);

-- Daily job
INSERT INTO conversations_archive
SELECT * FROM conversations
WHERE updated_at < NOW() - INTERVAL '1 year';

DELETE FROM conversations
WHERE updated_at < NOW() - INTERVAL '1 year';

-- Or soft delete with status
ALTER TABLE conversations ADD COLUMN status VARCHAR(20) DEFAULT 'active';
CREATE INDEX idx_conversations_status ON conversations(status, updated_at);
```

**Phase assignment:** Phase 1 (Conversation Persistence) - Operational concern

---

### I-5: Function Calling Timeout Not Handled

**What goes wrong:** `TaxWrapper.calculate()` takes 500ms. During high load, times out. GeminiAgent doesn't detect failure, waits indefinitely.

**Root cause:** No timeout on synchronous function call execution.

**Consequences:**
- API request hangs (client waits 30s, times out)
- User sees loading spinner forever
- Server resources locked

**Prevention:** Wrap tool execution in timeout.

```typescript
// In GeminiAgent.sendMessage()
if (call.name === "calculate_net_salary") {
  const TOOL_TIMEOUT = 5000; // 5s

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Tool execution timeout')), TOOL_TIMEOUT)
  );

  try {
    const toolResult = await Promise.race([
      this.taxWrapper.calculate(input),
      timeoutPromise
    ]);

    // Return success result
  } catch (error) {
    if (error.message === 'Tool execution timeout') {
      // Return error to LLM, let it inform user gracefully
      result = await chat.sendMessage({
        message: [{
          role: "function",
          parts: [{
            functionResponse: {
              name: "calculate_net_salary",
              response: { error: "Calculation timed out. Please try again." }
            }
          }]
        }]
      });
    }
  }
}
```

**Phase assignment:** Phase 2 (Function Calling Enhancement) - Reliability

---

### I-6: Conversation Deletion Doesn't Cascade to State Logs

**What goes wrong:** User deletes conversation. Record deleted from `conversations` table, but `conversation_state_log` entries remain (orphaned).

**Root cause:** Foreign key missing `ON DELETE CASCADE`.

**Consequences:**
- Database bloat with orphaned logs
- Privacy concern: conversation "deleted" but state history remains
- GDPR violation: user data not fully removed

**Prevention:** Cascade deletes across related tables.

```sql
-- ❌ BAD: No cascade
CREATE TABLE conversation_state_log (
  conversation_id UUID REFERENCES conversations(id)
);

-- ✅ GOOD: Cascade delete
CREATE TABLE conversation_state_log (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE
);

-- Also add to messages, citations, etc.
CREATE TABLE conversation_messages (
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE
);
```

**Integration with existing system:**
- Pattern established in v1.0: `documents` → `document_chunks` cascade
- Apply same pattern to conversation tables

**Phase assignment:** Phase 1 (Conversation Persistence) - Data integrity

---

## Summary: Pitfall Prevention Checklist

Before shipping each phase:

### Phase 1: Conversation Persistence
- [ ] State versioning implemented (P0-1)
- [ ] Token budget management added (P0-4)
- [ ] RLS policies created and tested (P1-4)
- [ ] State transition logging enabled (I-1)
- [ ] ConversationId scoping implemented (I-2)
- [ ] Cascade delete configured (I-6)
- [ ] Intent-aware transitions for modifications (P1-2)

### Phase 2: Function Calling Enhancement
- [ ] Schema version tracking added (P0-2)
- [ ] Zod validation schemas defined (P0-2)
- [ ] Function call timeout handling (I-5)
- [ ] Context priority structure (I-3)

### Phase 3: Suggested Responses
- [ ] Contextual suggestion logic (P1-1)
- [ ] Structured output in single call (P1-5)
- [ ] Click-through rate monitoring

### Phase 4: Data Extraction Validation
- [ ] Two-phase validation (LLM → Zod) (P1-3)
- [ ] Validation error feedback loop
- [ ] Common value range tests

### Phase 5: Citation Quality
- [ ] Page number metadata in chunks (P0-3)
- [ ] Citation validation layer (P0-3)
- [ ] Dynamic similarity thresholds (P2-5)
- [ ] Page metadata normalized (P2-3)

---

## Sources

### Conversation Persistence
- [Persistence Pays Off: React Components with Local Storage Sync](https://dev.to/mattlewandowski93/persistence-pays-off-react-components-with-local-storage-sync-2bfk)
- [Databases and Persistent Storage for Conversation Data | Symbl.ai](https://symbl.ai/developers/blog/databases-and-persistent-storage-for-conversation-data/)
- [Managing Chat History at scale in Generative AI Chatbots](https://builder.aws.com/content/2j9daS4A39fteekgv9t1Hty11Qy/managing-chat-history-at-scale-in-generative-ai-chatbots)
- [How do chatbots store conversation history?](https://www.tencentcloud.com/techpedia/128208)

### Function Calling
- [The Anatomy of Tool Calling in LLMs: A Deep Dive](https://martinuke0.github.io/posts/2026-01-07-the-anatomy-of-tool-calling-in-llms-a-deep-dive/)
- [LLM Function-Calling Pitfalls Nobody Mentions](https://medium.com/@2nick2patel2/llm-function-calling-pitfalls-nobody-mentions-a0a0575888b1)
- [Function calling with the Gemini API](https://ai.google.dev/gemini-api/docs/function-calling)
- [Structured outputs | Gemini API](https://ai.google.dev/gemini-api/docs/structured-output)

### Suggested Responses
- [AI Chatbot UX: 2026's Top Design Best Practices](https://www.letsgroto.com/blog/ux-best-practices-for-ai-chatbots)
- [Chatbot buttons vs quick replies | Activechat.ai](https://activechat.ai/news/chatbot-buttons-vs-quick-replies/)
- [Push The Button: Quick Replies And The Chatbot Experience](https://medium.com/roborobo-magazine/push-the-button-quick-replies-and-the-chatbot-experience-453ef33f28e0)

### Data Extraction Validation
- [The Complete Guide to Using Pydantic for Validating LLM Outputs](https://machinelearningmastery.com/the-complete-guide-to-using-pydantic-for-validating-llm-outputs/)
- [LLMs for Structured Data Extraction from PDFs in 2026](https://unstract.com/blog/comparing-approaches-for-using-llms-for-structured-data-extraction-from-pdfs/)

### RAG Citations
- [Citation-Aware RAG: How to add Fine Grained Citations](https://www.tensorlake.ai/blog/rag-citations)
- [RAG with in-line citations | LlamaIndex](https://developers.llamaindex.ai/python/examples/workflow/citation_query_engine/)
- [Retrieval Augmented Generation with Citations - Zilliz](https://zilliz.com/blog/retrieval-augmented-generation-with-citations)

### State Machines
- [Is Chatbot Dialog State Machine Deprecation Inevitable?](https://cobusgreyling.medium.com/is-chatbot-dialog-state-machine-deprecation-inevitable-1f08a7b5fde3)
- [Guiding AI Conversations through Dynamic State Transitions](https://promptengineering.org/guiding-ai-conversations-through-dynamic-state-transitions/)

### Supabase/PostgreSQL
- [Best Practices for Supabase | Security, Scaling & Maintainability](https://www.leanware.co/insights/supabase-best-practices)
- [Supabase Best Practices for storing sensitive data](https://github.com/orgs/supabase/discussions/21073)

---

**Document Status:** ✅ Complete
**Last Updated:** 2026-01-26
**Next Review:** Before v1.1 Phase 1 begins
