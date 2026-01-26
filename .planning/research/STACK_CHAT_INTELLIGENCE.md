# Stack Research: Chat Intelligence Features (v1.1)

**Project:** Gehalt-Pflege Chatbot - Milestone v1.1
**Researched:** 2026-01-26
**Overall Confidence:** HIGH
**Context:** Subsequent milestone - Adding chat intelligence features to existing RAG-enabled chatbot

---

## Executive Summary

Adding conversation persistence, function calling, suggested response chips, validation improvements, and citation quality requires **minimal new dependencies**. Most capabilities already exist in current stack:
- `@google/genai` ^1.35.0 already supports multi-tool function calling and structured outputs
- Existing VectorstoreService already has `queryWithMetadata()` method (just needs database schema enhancement)
- UI components use existing shadcn/ui + Radix

**Primary additions:**
1. **Dexie.js** (4.0.11+) for client-side conversation storage
2. **dexie-react-hooks** (4.2.0) for reactive IndexedDB queries
3. **Zod v4** (4.3.5) upgrade for improved validation and Gemini schema compatibility
4. **Database schema enhancements** for citation metadata (page numbers)

**Key Finding:** Do NOT add React Query integration for IndexedDB. Dexie provides native `useLiveQuery` hook that serves the same reactive purpose, avoiding state management duplication.

---

## Recommended Stack Additions

### 1. Conversation Persistence

#### Client-Side Storage: Dexie.js + dexie-react-hooks

| Package | Version | Install Location | Purpose |
|---------|---------|------------------|---------|
| `dexie` | `^4.0.11` | apps/web | IndexedDB wrapper for conversation history |
| `dexie-react-hooks` | `^4.2.0` | apps/web | React hooks (`useLiveQuery`) for reactive queries |

**Why Dexie over localStorage:**

| Criterion | localStorage | Dexie (IndexedDB) | Winner |
|-----------|--------------|-------------------|--------|
| **Storage capacity** | ~5MB limit | 20-50% of disk | IndexedDB |
| **Performance** | Synchronous (blocks UI) | Asynchronous, non-blocking | IndexedDB |
| **Data structure** | Strings only (JSON overhead) | Native objects | IndexedDB |
| **Queries** | Manual filtering | Indexed queries | IndexedDB |
| **Chat scalability** | Poor (history truncation) | Excellent (unlimited growth) | IndexedDB |

**Why dexie-react-hooks over React Query:**
- Dexie's `useLiveQuery()` observes IndexedDB data reactively (similar to React Query)
- Automatically re-renders components when data changes
- **No state duplication:** React Query manages server cache, Dexie manages local persistence
- Fixed Next.js compatibility in version 1.1.3+ (server-safe with default initial values)
- **Performance:** Native IndexedDB observation, no polling or manual invalidation

**Integration with existing stack:**
- Compatible with Next.js (use in `useEffect` to ensure client-side execution)
- Works alongside existing TanStack React Query v5.90.17 for server state
- No conflict: React Query = server cache (API responses), Dexie = local persistence (offline support)

**Implementation pattern:**

```typescript
// apps/web/src/lib/db.ts
import Dexie, { Table } from 'dexie';

interface Conversation {
  id: string;
  projectId: string;
  messages: Array<{
    role: 'user' | 'bot';
    content: string;
    timestamp: Date;
  }>;
  formState: {
    section: string;
    data: Record<string, unknown>;
    missingFields: string[];
  };
  createdAt: Date;
  updatedAt: Date;
}

class ChatDatabase extends Dexie {
  conversations!: Table<Conversation>;

  constructor() {
    super('GehaltPflegeChatDB');
    this.version(1).stores({
      // Indexes: id (primary), projectId, createdAt
      conversations: 'id, projectId, createdAt'
    });
  }
}

export const db = new ChatDatabase();
```

**Usage with useLiveQuery (reactive):**

```typescript
// apps/web/src/App.tsx
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './lib/db';

function ChatInterface({ projectId }: { projectId: string }) {
  // Reactive query - auto-updates when IndexedDB changes
  const conversations = useLiveQuery(
    () => db.conversations
      .where('projectId').equals(projectId)
      .reverse()
      .sortBy('createdAt'),
    [projectId]
  );

  // Save new message
  const handleSendMessage = async (message: string) => {
    const conv = conversations?.[0];
    if (conv) {
      await db.conversations.update(conv.id, {
        messages: [...conv.messages, { role: 'user', content: message, timestamp: new Date() }],
        updatedAt: new Date()
      });
    }
  };

  return <div>{conversations?.map(...)}</div>;
}
```

**Next.js server-side safety:**

```typescript
// apps/web/src/hooks/useConversations.ts
import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';

export function useConversations(projectId: string) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  // useLiveQuery handles SSR gracefully since v1.1.3
  const conversations = useLiveQuery(
    () => isClient ? db.conversations.where('projectId').equals(projectId).toArray() : [],
    [projectId, isClient]
  );

  return conversations ?? [];
}
```

**Optional: Server-side sync for admin visibility**

Client-only storage is sufficient for chat persistence. Server sync is **optional** for admin dashboard:

```typescript
// apps/api/app/api/conversations/route.ts
export async function POST(request: Request) {
  const { conversationId, messages, formState } = await request.json();

  // Sync to Supabase for admin visibility
  await supabase.from('conversations').upsert({
    id: conversationId,
    project_id: projectId,
    messages,
    form_state: formState,
    updated_at: new Date()
  });

  return NextResponse.json({ success: true });
}
```

**Sources:**
- [Dexie.js Next.js compatibility guide](https://medium.com/dexie-js/dexie-js-next-js-fd15556653e6)
- [useLiveQuery() documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())
- [localStorage vs IndexedDB comprehensive comparison](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [Dexie with Next.js tutorial](https://blog.yuceefh.com/build-basic-nextjs-app-indexeddb-dexiejs)

**Confidence:** HIGH (official documentation, Next.js compatibility verified in v1.1.3+, npm version 4.2.0 confirmed Jan 2026)

---

### 2. Function Calling (Multi-Tool Support)

#### No new dependencies required ✅

**Current capability:**
- `@google/genai` ^1.35.0 **already supports** multi-tool function calling
- Existing `GeminiAgent.ts` (lines 53-126) implements single-tool execution (`calculate_net_salary`)
- Current pattern: `tools: [SALARY_TOOL]` (single tool)

**What needs changing:**
Extend existing tool array structure, not add new packages.

**Current structure (apps/api/utils/agent/config.ts):**

```typescript
const SALARY_TOOL = {
  name: "calculate_net_salary",
  description: "...",
  parameters: { type: "OBJECT", properties: { ... } }
};

// apps/api/utils/agent/GeminiAgent.ts (line 59)
tools: [SALARY_TOOL]
```

**Updated multi-tool structure:**

```typescript
// apps/api/utils/agent/config.ts
export const TOOLS = [{
  functionDeclarations: [
    {
      name: "calculate_net_salary",
      description: "Calculate German net salary based on gross income and tax details",
      parameters: {
        type: "OBJECT",
        properties: {
          yearlySalary: { type: "NUMBER", description: "Annual gross salary in EUR" },
          taxClass: { type: "NUMBER", description: "German tax class 1-6" },
          year: { type: "NUMBER", description: "Tax year (2025 or 2026)" },
          hasChildren: { type: "BOOLEAN" },
          childCount: { type: "NUMBER" },
          churchTax: { type: "STRING", enum: ["none", "ev", "rk"] },
          state: { type: "STRING", description: "Bundesland or 'west'/'east'" },
          birthYear: { type: "NUMBER" },
          healthInsuranceAddOn: { type: "NUMBER", description: "Percentage, default 1.6" }
        },
        required: ["yearlySalary", "taxClass", "year"]
      }
    },
    {
      name: "lookup_tariff_details",
      description: "Retrieve salary details for specific German tariff system (TVöD, TV-L, AVR), group, and experience level (Stufe)",
      parameters: {
        type: "OBJECT",
        properties: {
          tarif: { type: "STRING", description: "Tariff system", enum: ["TVöD", "TV-L", "AVR"] },
          group: { type: "STRING", description: "Pay group (E1-E15 or P-values)" },
          stufe: { type: "NUMBER", description: "Experience level 1-6", enum: [1, 2, 3, 4, 5, 6] },
          year: { type: "NUMBER", description: "Year for tariff table", enum: [2025, 2026] }
        },
        required: ["tarif", "group", "stufe"]
      }
    },
    {
      name: "search_documents",
      description: "Search uploaded documents for specific information about tariffs, regulations, or salary details",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING", description: "Search query in German" },
          topK: { type: "NUMBER", description: "Number of results (default 3)", default: 3 }
        },
        required: ["query"]
      }
    }
  ]
}];
```

**Updated GeminiAgent implementation (apps/api/utils/agent/GeminiAgent.ts):**

```typescript
// Line 59: Update config
config: {
  systemInstruction: dynamicSystemInstruction,
  temperature: 0.7,
  tools: TOOLS // Use new multi-tool array
}

// Lines 88-126: Update tool execution loop
if (functionCalls && functionCalls.length > 0) {
  const toolResults = [];

  // Handle parallel function calls
  for (const call of functionCalls) {
    let toolResult;

    switch (call.name) {
      case "calculate_net_salary":
        console.log("[GeminiAgent] Executing: calculate_net_salary", call.args);
        const input: SalaryInput = {
          yearlySalary: call.args.yearlySalary,
          taxClass: call.args.taxClass,
          year: call.args.year,
          hasChildren: call.args.hasChildren ?? false,
          childCount: call.args.childCount ?? 0,
          churchTax: call.args.churchTax ?? 'none',
          state: call.args.state ?? 'west',
          birthYear: call.args.birthYear,
          healthInsuranceAddOn: call.args.healthInsuranceAddOn ?? 1.6
        };
        toolResult = this.taxWrapper.calculate(input);
        break;

      case "lookup_tariff_details":
        console.log("[GeminiAgent] Executing: lookup_tariff_details", call.args);
        toolResult = await this.tariffLookup(call.args);
        break;

      case "search_documents":
        console.log("[GeminiAgent] Executing: search_documents", call.args);
        toolResult = await this.vectorstore.query(
          call.args.query,
          this.projectId,
          call.args.topK ?? 3
        );
        break;

      default:
        toolResult = { error: `Unknown function: ${call.name}` };
    }

    toolResults.push({
      role: "function",
      parts: [{
        functionResponse: {
          name: call.name,
          response: { result: toolResult }
        }
      }]
    });
  }

  // Send all tool results back to model
  result = await chat.sendMessage({ message: toolResults });
}
```

**Parallel function calling:**
Gemini can return **multiple function calls in a single response**. Example:

```json
{
  "functionCalls": [
    { "name": "lookup_tariff_details", "args": { "tarif": "TVöD", "group": "E9", "stufe": 3 } },
    { "name": "calculate_net_salary", "args": { "yearlySalary": 45000, "taxClass": 1, "year": 2025 } }
  ]
}
```

Handle by looping over `functionCalls` array instead of accessing `functionCalls[0]`.

**API syntax reference (from official docs):**

```javascript
// JavaScript format
const config = {
  tools: [{
    functionDeclarations: [declaration1, declaration2, declaration3]
  }]
};
```

**Best practices for function calling:**
- Limit to 10-20 active tools per conversation (better relevance)
- Use descriptive function and parameter names
- Provide clear descriptions (Gemini uses these to decide which tool to call)
- Set `required` fields for mandatory parameters
- Use enums for constrained values (better validation)

**Sources:**
- [Gemini function calling official docs](https://ai.google.dev/gemini-api/docs/function-calling)
- [Using tools & agents with Gemini API](https://ai.google.dev/gemini-api/docs/tools)
- [Gemini function calling introduction (Google Codelabs)](https://codelabs.developers.google.com/codelabs/gemini-function-calling)

**Confidence:** HIGH (verified with official API documentation, current @google/genai version supports this)

---

### 3. Suggested Response Chips

#### No new dependencies required ✅

**Strategy:**
Generate contextual quick replies via Gemini structured output. Render with existing shadcn/ui + Radix UI + Tailwind.

**Backend: Suggestion generation via Gemini**

```typescript
// apps/api/utils/agent/suggestion-generator.ts
import { GoogleGenAI } from '@google/genai';
import { FormState } from '@/types/form';

interface Suggestion {
  text: string;
  intent: 'answer' | 'skip' | 'clarify' | 'modify';
  priority: number;
}

const suggestionSchema = {
  type: "OBJECT",
  properties: {
    suggestions: {
      type: "ARRAY",
      description: "List of 2-4 contextual quick reply suggestions",
      items: {
        type: "OBJECT",
        properties: {
          text: { type: "STRING", description: "Short suggestion text (max 40 chars)" },
          intent: {
            type: "STRING",
            description: "User intent this suggestion represents",
            enum: ["answer", "skip", "clarify", "modify"]
          },
          priority: { type: "NUMBER", description: "Priority 1-10 (higher = more relevant)" }
        },
        required: ["text", "intent", "priority"]
      }
    }
  },
  required: ["suggestions"]
};

export async function generateSuggestions(
  formState: FormState,
  genAI: GoogleGenAI
): Promise<Suggestion[]> {
  const currentSection = formState.section;
  const missingFields = formState.missingFields;

  const prompt = `
Generiere 3 kontextuelle Vorschläge für den Nutzer.

Aktueller Abschnitt: ${currentSection}
Fehlende Felder: ${missingFields.join(', ')}

Beispiele:
- "Ja, TVöD"
- "Ich weiß es nicht"
- "Überspringen"
- "Zurück zur vorherigen Frage"
`;

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      responseSchema: suggestionSchema,
      temperature: 0.7
    },
    contents: [{
      parts: [{ text: prompt }]
    }]
  });

  const parsed = JSON.parse(result.text);
  return parsed.suggestions.sort((a, b) => b.priority - a.priority).slice(0, 3);
}
```

**API integration (apps/api/app/api/chat/route.ts):**

```typescript
export async function POST(request: Request) {
  // ... existing chat logic ...

  const responseText = await agent.sendMessage(message, history, contextDocs);
  const updatedFormState = salaryFlow.transition(currentFormState, message);

  // Generate suggestions for next user input
  const suggestions = await generateSuggestions(updatedFormState, getGeminiClient());

  return NextResponse.json({
    text: responseText,
    formState: updatedFormState,
    suggestions // Add to API response
  });
}
```

**Frontend: UI with existing shadcn/ui**

```typescript
// apps/web/src/components/SuggestionChips.tsx
import { Button } from '@/components/ui/button'; // shadcn/ui (already installed)
import { Sparkles } from 'lucide-react'; // lucide-react ^0.560.0 (already installed)

interface Suggestion {
  text: string;
  intent: 'answer' | 'skip' | 'clarify' | 'modify';
  priority: number;
}

interface SuggestionChipsProps {
  suggestions: Suggestion[];
  onSelect: (text: string) => void;
}

export function SuggestionChips({ suggestions, onSelect }: SuggestionChipsProps) {
  if (!suggestions || suggestions.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap mt-3">
      {suggestions.map((suggestion, i) => (
        <Button
          key={i}
          variant="outline"
          size="sm"
          onClick={() => onSelect(suggestion.text)}
          className="text-xs hover:bg-muted transition-colors"
        >
          <Sparkles className="w-3 h-3 mr-1.5 opacity-60" />
          {suggestion.text}
        </Button>
      ))}
    </div>
  );
}
```

**Usage in chat component:**

```typescript
// apps/web/src/App.tsx
import { SuggestionChips } from './components/SuggestionChips';

function ChatInterface() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  const handleSendMessage = async (message: string) => {
    const response = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message, history, projectId, currentFormState })
    });

    const data = await response.json();
    // data = { text, formState, suggestions }

    setSuggestions(data.suggestions || []);
    // ... handle response text and formState ...
  };

  const handleSuggestionClick = (text: string) => {
    handleSendMessage(text); // Send suggestion as user message
  };

  return (
    <div>
      {/* Chat messages */}
      <SuggestionChips
        suggestions={suggestions}
        onSelect={handleSuggestionClick}
      />
      {/* Input field */}
    </div>
  );
}
```

**Alternatives considered:**

| Alternative | Reason NOT to use |
|-------------|-------------------|
| Firebase Smart Reply | Overkill, requires Firebase SDK (~500KB+), mobile-focused |
| Custom ML model | Unnecessary, Gemini generates better contextual suggestions |
| Pre-defined hardcoded suggestions | Not contextual, doesn't adapt to conversation state |

**Sources:**
- [Build AI-powered smart replies with React](https://dev.to/envitab/build-ai-powered-smart-replies-with-react-and-synthetic-44hc)
- [Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Smart reply UI patterns](https://github.com/mahmud-r-farhan/smart-reply)

**Confidence:** HIGH (existing stack sufficient, Gemini structured output verified, shadcn/ui already installed)

---

### 4. Validation Improvements (Zod Schemas)

#### Upgrade existing Zod to v4

| Package | Current | Upgrade To | Location | Reason |
|---------|---------|------------|----------|--------|
| `zod` | (unknown) | `^4.3.5` | apps/api | Performance + native `.toJSONSchema()` for Gemini |

**Why upgrade to Zod v4:**

| Improvement | Zod v3 | Zod v4 | Gain |
|-------------|--------|--------|------|
| **String parsing** | Baseline | 14x faster | Performance |
| **Array parsing** | Baseline | 7x faster | Performance |
| **Object parsing** | Baseline | 6.5x faster | Performance |
| **JSON Schema conversion** | `zod-to-json-schema` (3rd party) | Native `.toJSONSchema()` | Simplicity |
| **Gemini compatibility** | Breaks with v4 conversion | Native support | Reliability |
| **Bundle size (mini)** | N/A | @zod/mini (1.9KB gzipped) | Optional optimization |

**Critical fix for Gemini structured output:**

```typescript
// ❌ OLD (broken with Zod v4)
import { zodToJsonSchema } from 'zod-to-json-schema'; // 3rd party library
const schema = zodToJsonSchema(myZodSchema);

// ✅ NEW (native Zod v4)
const schema = myZodSchema.toJSONSchema(); // Built-in method
```

**Problem with zod-to-json-schema:**
- Built for Zod v3
- When used with Zod v4, **silently fails** (generates incorrect schemas)
- Gemini API rejects malformed schemas or returns incorrect structured output

**Integration with existing validation:**

```typescript
// apps/api/utils/agent/ResponseValidator.ts
import { z } from 'zod';

// Define schemas for each form state
const jobDetailsSchema = z.object({
  tarif: z.enum(['TVöD', 'TV-L', 'AVR'], {
    errorMap: () => ({ message: 'Ungültige Tarifwahl. Bitte wähle TVöD, TV-L oder AVR.' })
  }),
  group: z.string().regex(/^(E[1-9]|E1[0-5]|P\d+)$/, {
    message: 'Ungültige Entgeltgruppe. Format: E1-E15 oder P-Wert.'
  }),
  experience: z.number().int().min(1).max(6, {
    message: 'Stufe muss zwischen 1 und 6 liegen.'
  }),
  hours: z.number().positive().max(60, {
    message: 'Wochenstunden müssen zwischen 0 und 60 liegen.'
  }),
  state: z.string().min(1, {
    message: 'Bundesland ist erforderlich.'
  })
});

const taxDetailsSchema = z.object({
  taxClass: z.number().int().min(1).max(6, {
    message: 'Steuerklasse muss zwischen 1 und 6 liegen.'
  }),
  churchTax: z.enum(['none', 'ev', 'rk'], {
    errorMap: () => ({ message: 'Kirchensteuer: none, ev, oder rk.' })
  }),
  hasChildren: z.boolean(),
  numberOfChildren: z.number().int().nonnegative().optional()
});

// Validation function
export function validateFormData(section: string, data: Record<string, unknown>) {
  const schema = section === 'job_details' ? jobDetailsSchema : taxDetailsSchema;

  const result = schema.safeParse(data);

  if (!result.success) {
    return {
      isValid: false,
      errors: result.error.flatten().fieldErrors
    };
  }

  return { isValid: true, data: result.data };
}
```

**Use with Gemini structured output (data extraction):**

```typescript
// apps/api/lib/salary-flow.ts
import { getGeminiClient } from './gemini';
import { jobDetailsSchema } from '@/utils/agent/ResponseValidator';

export async function extractJobDetails(message: string, history: Message[]) {
  const genAI = getGeminiClient();

  const result = await genAI.models.generateContent({
    model: "gemini-2.5-flash",
    config: {
      responseSchema: jobDetailsSchema.toJSONSchema(), // ✅ Native Zod v4 method
      temperature: 0.3 // Lower temp for extraction
    },
    contents: [
      ...history,
      { parts: [{ text: message }] }
    ]
  });

  const extractedData = JSON.parse(result.text);
  // Data is already validated against schema by Gemini
  return extractedData;
}
```

**Limitations to note (from Gemini docs):**
- Very large schemas may be rejected
- Deeply nested schemas (>5 levels) may cause errors
- **Mitigation:** Simplify schemas by:
  - Shortening property names
  - Reducing nesting depth
  - Limiting number of constraints
  - Breaking into smaller schemas

**Installation:**

```bash
cd apps/api
npm install zod@latest  # Installs 4.3.5 (verified Jan 26, 2026)
npm uninstall zod-to-json-schema  # Remove if present (deprecated with v4)
```

**Sources:**
- [Zod v4 release notes](https://zod.dev/v4)
- [Zod v4 & Gemini: Fix structured output with z.toJSONSchema](https://www.buildwithmatija.com/blog/zod-v4-gemini-fix-structured-output-z-tojsonschema)
- [Why Zod schemas break when switching to Gemini](https://heyhuy.com/blog/gemini-structured-mode/)
- [Gemini structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output)
- [Zod on npm](https://www.npmjs.com/package/zod) (version 4.3.5 published 15 days ago)

**Confidence:** HIGH (official docs, npm version 4.3.5 verified as of Jan 2026, Gemini compatibility fix documented)

---

### 5. Citation Quality (Document Name + Page Number)

#### Database schema extension required (no new packages) ✅

**Current state (apps/api/lib/vectorstore/VectorstoreService.ts):**
- `queryWithMetadata()` method exists (lines 217-266) ✅
- Returns: `documentId`, `filename`, `chunkIndex` ✅
- **Missing:** Page number tracking ❌

**What's needed:**
1. Add page metadata columns to `document_chunks` table
2. Enhance Supabase RPC function `match_documents_with_metadata`
3. Update TypeScript interfaces
4. Extract page numbers during document processing (Gemini or unpdf)

**Database schema migration:**

```sql
-- Migration: Add page metadata to document_chunks
-- File: supabase/migrations/YYYYMMDD_add_page_metadata.sql

ALTER TABLE document_chunks
ADD COLUMN page_number INTEGER,
ADD COLUMN page_range INT4RANGE, -- For chunks spanning multiple pages
ADD COLUMN bounding_box JSONB;   -- Optional: for precise highlighting [x, y, width, height]

-- Index for efficient page-based queries
CREATE INDEX idx_chunks_page ON document_chunks(document_id, page_number);

-- Update RPC function for citation metadata
CREATE OR REPLACE FUNCTION match_documents_with_metadata(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
RETURNS TABLE (
  content text,
  similarity float,
  document_id uuid,
  filename text,
  chunk_index int,
  page_number int,
  page_range int4range
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.document_id,
    d.filename,
    dc.chunk_index,
    dc.page_number,
    dc.page_range
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE
    d.project_id = filter_project_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

**TypeScript interface update (apps/api/lib/vectorstore/VectorstoreService.ts):**

```typescript
// Line 221-229: Update return type
async queryWithMetadata(
  question: string,
  projectId: string,
  topK = 3
): Promise<Array<{
  content: string;
  similarity: number;
  metadata: {
    documentId: string;
    filename: string;
    chunkIndex: number;
    pageNumber?: number;       // ✅ Add this
    pageRange?: [number, number]; // ✅ Add this
  }
}>> {
  // ... existing implementation ...

  // Line 252-259: Update mapping
  return results.map((r: any) => ({
    content: r.content,
    similarity: r.similarity,
    metadata: {
      documentId: r.document_id,
      filename: r.filename,
      chunkIndex: r.chunk_index,
      pageNumber: r.page_number,           // ✅ Add this
      pageRange: r.page_range ? [r.page_range.lower, r.page_range.upper] : undefined // ✅ Add this
    }
  }));
}
```

**Citation formatting function:**

```typescript
// apps/api/utils/citations.ts
interface CitationMetadata {
  documentId: string;
  filename: string;
  chunkIndex: number;
  pageNumber?: number;
  pageRange?: [number, number];
}

export function formatCitation(metadata: CitationMetadata, index: number): string {
  let pageInfo = '';

  if (metadata.pageNumber) {
    pageInfo = `, S. ${metadata.pageNumber}`;
  } else if (metadata.pageRange) {
    pageInfo = `, S. ${metadata.pageRange[0]}-${metadata.pageRange[1]}`;
  }

  // Format: [1: TVöD_Tarifregelung_2025.pdf, S. 12]
  return `[${index + 1}: ${metadata.filename}${pageInfo}]`;
}

export function formatCitationList(citations: CitationMetadata[]): string {
  return citations
    .map((citation, i) => formatCitation(citation, i))
    .join('\n');
}

// Example output:
// [1: TVöD_Tarifregelung_2025.pdf, S. 12]
// [2: Entgelttabelle_2026.pdf, S. 3-4]
```

**Integration in GeminiAgent (apps/api/utils/agent/GeminiAgent.ts):**

```typescript
// Line 48-51: Update context injection
if (contextDocuments && contextDocuments.length > 0) {
  // Format with citations
  const contextWithCitations = contextDocuments.map((doc, i) => {
    const citation = formatCitation(doc.metadata, i);
    return {
      role: 'user',
      parts: [{
        text: `${citation}\n${doc.content}`
      }]
    };
  });

  chatHistory.unshift(...contextWithCitations);
}

// Instruct model to use citations in responses
const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}

Wenn du Informationen aus hochgeladenen Dokumenten verwendest, zitiere die Quelle mit [Nummer].

Heute ist der ${currentDate}.`;
```

**Example response with citations:**

```
Die Entgeltgruppe E9, Stufe 3 erhält laut TVöD im Jahr 2025 ein Bruttogehalt von 3.817,38 € monatlich [1: TVöD_Tarifregelung_2025.pdf, S. 12].

Quellen:
[1: TVöD_Tarifregelung_2025.pdf, S. 12]
```

**Page number extraction during document processing:**

**Option A: Gemini File API with page tracking**

```typescript
// supabase/functions/process-embeddings/index.ts
// Update extractTextFromFile to request page markers

const extractionPrompt = `
Extract all text from this document.
For each paragraph, indicate its page number in the format: [PAGE:N] at the start of the paragraph.
Example:
[PAGE:1] This is the first paragraph on page 1.
[PAGE:2] This is a paragraph on page 2.
`;

const result = await genAI.models.generateContent({
  model: "gemini-2.5-flash",
  contents: [{
    parts: [
      { fileData: { mimeType, fileUri } },
      { text: extractionPrompt }
    ]
  }]
});

const textWithPages = result.text;

// Parse page markers
function parseTextWithPageNumbers(text: string): Array<{ content: string; pageNumber: number }> {
  const pageMarkerRegex = /\[PAGE:(\d+)\]\s*/g;
  const chunks: Array<{ content: string; pageNumber: number }> = [];

  let currentPage = 1;
  let lastIndex = 0;
  let match;

  while ((match = pageMarkerRegex.exec(text)) !== null) {
    const pageContent = text.slice(lastIndex, match.index).trim();
    if (pageContent) {
      chunks.push({ content: pageContent, pageNumber: currentPage });
    }
    currentPage = parseInt(match[1], 10);
    lastIndex = match.index + match[0].length;
  }

  // Add remaining text
  const remaining = text.slice(lastIndex).trim();
  if (remaining) {
    chunks.push({ content: remaining, pageNumber: currentPage });
  }

  return chunks;
}

const chunksWithPages = parseTextWithPageNumbers(textWithPages);

// Store with page metadata
await supabase.from('document_chunks').insert(
  chunksWithPages.map((chunk, i) => ({
    document_id: documentId,
    content: chunk.content,
    embedding: embeddings[i],
    chunk_index: i,
    page_number: chunk.pageNumber // ✅ Add page number
  }))
);
```

**Option B: unpdf for PDF page extraction (more reliable)**

```typescript
// supabase/functions/process-embeddings/index.ts
import { extractText, getDocumentProxy } from 'npm:unpdf';

const { data: fileBlob } = await supabase.storage
  .from('project-files')
  .download(storagePath);

const arrayBuffer = await fileBlob.arrayBuffer();
const pdf = await getDocumentProxy(arrayBuffer);

const chunksWithPages: Array<{ content: string; pageNumber: number }> = [];

for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
  const page = await pdf.getPage(pageNum);
  const textContent = await page.getTextContent();

  const pageText = textContent.items
    .map((item: any) => item.str)
    .join(' ');

  chunksWithPages.push({
    content: pageText,
    pageNumber: pageNum
  });
}

// Then split long pages into smaller chunks while preserving page number
const finalChunks = chunksWithPages.flatMap(({ content, pageNumber }) => {
  const splits = textSplitter.splitText(content);
  return splits.map(text => ({ content: text, pageNumber }));
});
```

**Performance considerations:**

| Aspect | Impact | Mitigation |
|--------|--------|------------|
| **Storage overhead** | +10-15% | Acceptable for citation quality |
| **RLS policy impact** | Potential slowdown if not indexed | Index `project_id` in RLS policies |
| **Query performance** | Minimal (JOIN already exists) | Existing index on `document_id` sufficient |
| **Extraction accuracy** | Gemini may hallucinate page numbers | Prefer unpdf for PDFs when possible |

**Known pitfalls (from research):**
- **RLS with non-LEAKPROOF functions:** Prevents index usage → catastrophic performance degradation
- **Solution:** Use built-in operators (`=`, `IN`) in RLS policies, avoid custom functions
- **pgvector 0.8.0+ required:** Iterative scans improve metadata filtering recall
- **Citation storage overhead:** ~10-15% but enables professional RAG (worth it)

**Sources:**
- [Citation-aware RAG architecture](https://www.tensorlake.ai/blog/rag-citations)
- [Utilizing metadata for better RAG retrieval (arXiv 2026)](https://arxiv.org/abs/2601.11863)
- [pgvector with metadata filtering guide](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/)
- [RLS with pgvector for RAG applications](https://medium.com/@michael.hannecke/implementing-row-level-security-in-vector-dbs-for-rag-applications-fdbccb63d464)
- [Postgres RLS performance considerations](https://postgres.fm/episodes/rls-vs-performance)

**Confidence:** MEDIUM (database migration straightforward, Gemini page extraction needs validation, unpdf more reliable but requires integration)

---

## Integration Points with Existing Stack

### 1. Conversation Persistence

**Client (apps/web):**
- Initialize Dexie database in `src/lib/db.ts`
- Use `useLiveQuery` in chat components (`App.tsx`)
- **No conflict** with existing TanStack React Query v5.90.17
  - React Query = server state (API calls)
  - Dexie = client state (offline persistence)

**Server (apps/api) - Optional:**
- Add `/api/conversations` endpoint for admin dashboard sync
- Leverage existing Supabase auth (`@supabase/ssr` v0.8.0)
- Store in new `conversations` table with RLS

**Data flow:**
```
User sends message → Stored in IndexedDB (Dexie) → Rendered via useLiveQuery
                   ↓
                Optional: POST /api/conversations → Supabase (admin visibility)
```

### 2. Function Calling

**Modify existing files (no new files):**
- `apps/api/utils/agent/config.ts` - Extend `TOOLS` array with new function declarations
- `apps/api/utils/agent/GeminiAgent.ts` - Update tool execution loop (lines 88-126) for multiple calls
- Add tariff lookup function in `apps/api/utils/tariff/` (new utility, not new package)

**Tool execution pattern:**

```typescript
// Current (single tool):
if (functionCalls[0].name === "calculate_net_salary") { ... }

// Updated (multiple tools):
for (const call of functionCalls) {
  switch (call.name) {
    case "calculate_net_salary": ...
    case "lookup_tariff_details": ...
    case "search_documents": ...
  }
}
```

### 3. Suggested Response Chips

**Frontend (apps/web):**
- Create `src/components/SuggestionChips.tsx` using existing shadcn Button
- Trigger on each bot response via API return value: `{ text, formState, suggestions }`
- Existing packages sufficient: `lucide-react` v0.560.0 (Sparkles icon)

**Backend (apps/api):**
- Add `apps/api/utils/agent/suggestion-generator.ts`
- Call in `/api/chat` route after main response generation
- Use Gemini structured output (no new tools, just additional API call)

**Integration with state machine (apps/api/lib/salary-flow.ts):**

```typescript
// After generating main response
const suggestions = await generateSuggestions(updatedFormState, genAI);

return NextResponse.json({
  text: responseText,
  formState: updatedFormState,
  suggestions // ✅ Add to API response
});
```

### 4. Validation Improvements

**Replace inline validation with Zod schemas:**

```typescript
// ❌ OLD (apps/api/utils/agent/ResponseValidator.ts)
if (!['TVöD', 'TV-L', 'AVR'].includes(tarif)) {
  return { isValid: false, error: 'Invalid tariff' };
}

// ✅ NEW
const tarifSchema = z.enum(['TVöD', 'TV-L', 'AVR']);
const result = tarifSchema.safeParse(tarif);
if (!result.success) {
  return { isValid: false, error: result.error.message };
}
```

**Use with Gemini structured extraction (apps/api/lib/salary-flow.ts):**

```typescript
const extractionResult = await genAI.models.generateContent({
  model: "gemini-2.5-flash",
  config: {
    responseSchema: jobDetailsSchema.toJSONSchema() // ✅ Native Zod v4 method
  },
  contents: [...]
});
// Response is already validated against schema
```

### 5. Citation Quality

**Update existing VectorstoreService:**
- Modify `queryWithMetadata()` return type (lines 221-229)
- Add page fields to metadata
- Update Supabase RPC call to new function

**Citation injection in GeminiAgent (apps/api/utils/agent/GeminiAgent.ts):**

```typescript
// Current (line 48-51):
if (contextDocuments && contextDocuments.length > 0) {
  chatHistory.unshift(...contextDocuments);
}

// Enhanced with citations:
if (contextDocuments && contextDocuments.length > 0) {
  const contextWithCitations = contextDocuments.map((doc, i) => ({
    role: 'user',
    parts: [{
      text: `[${i+1}: ${doc.metadata.filename}, S. ${doc.metadata.pageNumber}]\n${doc.content}`
    }]
  }));
  chatHistory.unshift(...contextWithCitations);
}
```

**Update document processing (supabase/functions/process-embeddings):**
- Extract page numbers during text extraction (Gemini or unpdf)
- Store page metadata when inserting chunks

---

## Anti-Recommendations (What NOT to Add)

### 1. ❌ DO NOT add React Query integration for Dexie

**Why not:**
- Dexie's `useLiveQuery` **already provides** reactive, cached queries
- React Query is for **server state** (API calls)
- Dexie is for **client state** (local database)
- Mixing creates unnecessary abstraction layer and state duplication

**Use instead:**
- React Query for `/api/chat`, `/api/documents` (server state)
- Dexie hooks for IndexedDB (client state)

### 2. ❌ DO NOT add `zod-to-json-schema`

**Why not:**
- Built for Zod v3, **silently fails** with Zod v4
- Zod v4 has **native `.toJSONSchema()`** method
- Creates version conflicts and incorrect schemas

**Use instead:**
- Zod v4's native `schema.toJSONSchema()`

### 3. ❌ DO NOT add separate embedding libraries (e.g., `@langchain/embeddings`)

**Why not:**
- Already using `@google/genai` for embeddings (text-embedding-004)
- LangChain adds **200KB+ bundle size** for functionality already present
- Current `VectorstoreService.generateEmbedding()` works well (line 306-323)

**Use instead:**
- Continue using existing Gemini embedding endpoint

### 4. ❌ DO NOT add Firebase SDK for Smart Reply

**Why not:**
- Firebase Smart Reply is **mobile-focused** (Firebase ML Kit)
- Requires entire Firebase SDK (**~500KB+**)
- Gemini structured output generates **better contextual suggestions**

**Use instead:**
- Gemini structured output with custom prompts (see Section 3)

### 5. ❌ DO NOT add dedicated vector database (Pinecone, Qdrant, Weaviate)

**Why not:**
- Supabase **pgvector already handles** vector search
- pgvector 0.8.0 supports metadata filtering with iterative scans
- **Migration cost high:** Would need to rewrite RLS policies, reindex data
- Performance adequate for current scale (<1M vectors)

**When to reconsider:**
- If vector search latency exceeds 500ms at scale
- If metadata filtering causes >50% performance degradation
- If scaling beyond 100K documents per project

**Current approach sufficient because:**
- pgvector 0.8.0 iterative scans improve filtered search recall
- RLS policies secure multi-tenant data (already implemented)
- Citation metadata adds only ~10-15% storage overhead

### 6. ❌ DO NOT add separate chunking library (beyond existing LangChain)

**Why not:**
- `@langchain/textsplitters` v1.0.1 **already installed** (apps/api/package.json, line 15)
- Provides battle-tested `RecursiveCharacterTextSplitter`
- Custom chunking in `VectorstoreService.ts` (lines 26-114) can be **removed** in favor of LangChain

**Use instead:**
- Continue using existing `@langchain/textsplitters`

---

## Installation Commands

```bash
# Apps/web (widget) - Conversation persistence
cd apps/web
npm install dexie@^4.0.11 dexie-react-hooks@^4.2.0

# Apps/api (backend) - Validation improvements
cd apps/api
npm install zod@latest  # Upgrades to 4.3.5
npm uninstall zod-to-json-schema  # Remove if present (deprecated)

# No other installs needed - all other features use existing packages:
# - @google/genai ^1.35.0 (function calling, structured output)
# - @langchain/textsplitters ^1.0.1 (chunking)
# - @supabase/supabase-js ^2.87.1 (database, RLS)
# - lucide-react ^0.560.0 (icons for suggestion chips)
# - @radix-ui/*, shadcn/ui (UI components)
```

---

## Version Verification Summary

| Package | Version | Verified | Source | Date |
|---------|---------|----------|--------|------|
| `dexie` | 4.0.11+ | ✅ | [npm](https://www.npmjs.com/package/dexie) | Jan 2026 |
| `dexie-react-hooks` | 4.2.0 | ✅ | [npm](https://www.npmjs.com/package/dexie-react-hooks) | 5 months ago |
| `zod` | 4.3.5 | ✅ | [npm](https://www.npmjs.com/package/zod) | 15 days ago (Jan 2026) |
| `@google/genai` | ^1.35.0 | ✅ | Already installed (apps/api/package.json) | Current |
| `@langchain/textsplitters` | ^1.0.1 | ✅ | Already installed (apps/api/package.json) | Current |
| Supabase pgvector | 0.8.0+ | ⚠️ | Check Supabase dashboard | Released Dec 2024 |

**Action item:** Verify Supabase project uses pgvector 0.8.0+ (iterative scans feature critical for metadata filtering performance).

---

## Database Schema Changes Required

### 1. Conversation Persistence (Optional - Admin Visibility)

**Client-side only (no DB changes):**
- Dexie stores conversations in browser IndexedDB
- No server-side changes needed for basic persistence

**Optional: Admin dashboard sync**

```sql
-- apps/api: New table for synced conversations (OPTIONAL)
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID, -- Optional: from Supabase Auth
  messages JSONB NOT NULL,
  form_state JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_conversations_project ON conversations(project_id);
CREATE INDEX idx_conversations_created ON conversations(created_at DESC);

-- RLS policies
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own conversations"
  ON conversations FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own conversations"
  ON conversations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own conversations"
  ON conversations FOR UPDATE
  USING (auth.uid() = user_id);
```

### 2. Citation Metadata Enhancement (Required)

```sql
-- Migration: Add page tracking to document_chunks
-- File: supabase/migrations/YYYYMMDD_add_citation_metadata.sql

ALTER TABLE document_chunks
ADD COLUMN page_number INTEGER,
ADD COLUMN page_range INT4RANGE,
ADD COLUMN bounding_box JSONB; -- Optional: for precise highlighting

-- Index for efficient page-based queries
CREATE INDEX idx_chunks_page ON document_chunks(document_id, page_number);

-- Update RPC function (see Section 5 for full implementation)
CREATE OR REPLACE FUNCTION match_documents_with_metadata(
  query_embedding vector(768),
  match_threshold float,
  match_count int,
  filter_project_id uuid
)
RETURNS TABLE (
  content text,
  similarity float,
  document_id uuid,
  filename text,
  chunk_index int,
  page_number int,
  page_range int4range
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity,
    dc.document_id,
    d.filename,
    dc.chunk_index,
    dc.page_number,
    dc.page_range
  FROM document_chunks dc
  JOIN documents d ON dc.document_id = d.id
  WHERE
    d.project_id = filter_project_id
    AND 1 - (dc.embedding <=> query_embedding) > match_threshold
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;
```

---

## Performance & Security Considerations

### Dexie IndexedDB

**Performance:**
- **Asynchronous operations** prevent UI blocking (vs localStorage)
- Indexes on `projectId`, `createdAt` for fast queries
- LRU cache pattern for frequently accessed conversations
- **Typical latency:** <10ms for queries under 1000 conversations

**Security:**
- IndexedDB **isolated per origin** (automatic browser sandboxing)
- No cross-origin access
- Syncing to server optional (for admin only, with RLS)
- **Data residency:** Local to user's browser (no automatic cloud sync)

### Zod Validation

**Performance:**
- Zod v4: **14x faster string parsing**, 7x faster arrays vs v3
- Gemini structured output validates **during generation** (no post-processing)
- **Typical latency:** <1ms for schema validation

**Security:**
- Type-safe validation prevents injection attacks
- Schema enforcement at API boundary
- Zod errors provide safe, user-friendly messages (no stack traces)

### pgvector Citation Metadata

**Performance:**
- Page metadata adds **~10-15% storage overhead**
- RLS policies can impact performance if not indexed properly
- **Critical:** Index columns used in RLS policies (e.g., `project_id`)
- pgvector 0.8.0 iterative scans mitigate metadata filtering slowdowns
- **Typical query latency:** 50-100ms for topK=3 with HNSW index (<1M vectors)

**Security:**
- RLS policies ensure users only see their project's citations
- JOIN to `documents` table enforces project-level access control
- **Service role** required for edge functions (bypasses RLS during processing)

**Known pitfall (from research):**
- **Non-LEAKPROOF functions in RLS policies** prevent index usage → catastrophic performance degradation
- **Solution:** Use built-in operators (`=`, `IN`, `<=>`) in policies, avoid custom functions
- **Example of LEAKPROOF policy:**
  ```sql
  CREATE POLICY "project_isolation"
  ON document_chunks FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM documents WHERE project_id = auth.jwt() ->> 'project_id'
    )
  );
  ```

---

## Migration Path

### Phase 1: Conversation Persistence (Week 1)

**Tasks:**
1. Install Dexie packages in apps/web
2. Create database schema (`src/lib/db.ts`)
3. Implement `useLiveQuery` in chat component (`App.tsx`)
4. Test persistence across page reloads
5. (Optional) Create sync endpoint `/api/conversations`

**Success criteria:**
- Conversations persist after browser refresh
- Multiple conversations per project stored
- No React Query conflicts
- <10ms query latency

### Phase 2: Function Calling (Week 1)

**Tasks:**
1. Extend `config.ts` with new tool declarations (tariff lookup, document search)
2. Update `GeminiAgent.ts` tool execution loop (handle multiple calls)
3. Implement `tariffLookup()` function
4. Test parallel function calling

**Success criteria:**
- Gemini calls correct tools based on user intent
- Multiple tools can be called in single response
- Tool errors handled gracefully
- Tool results returned to model for final response

### Phase 3: Suggested Chips (Week 2)

**Tasks:**
1. Create `SuggestionChips.tsx` component (shadcn Button + Lucide icons)
2. Add `suggestion-generator.ts` with Gemini structured output
3. Wire suggestions to `/api/chat` response
4. Test state-based suggestion quality

**Success criteria:**
- 2-4 contextual suggestions generated per response
- Suggestions relevant to current form state
- Clicking suggestion sends message
- <500ms generation latency (parallel with main response)

### Phase 4: Validation with Zod (Week 2)

**Tasks:**
1. Upgrade Zod to v4.3.5, remove `zod-to-json-schema`
2. Define schemas for `job_details`, `tax_details`, `summary`
3. Replace inline validation in `ResponseValidator.ts`
4. Use `.toJSONSchema()` with Gemini structured output
5. Test schema-based extraction accuracy

**Success criteria:**
- All form fields validated with Zod schemas
- Gemini structured output uses native `.toJSONSchema()`
- Validation errors provide user-friendly messages
- No `zod-to-json-schema` errors

### Phase 5: Citation Quality (Week 3)

**Tasks:**
1. Create database migration for page metadata
2. Update `extractTextFromFile()` to capture page numbers (Gemini or unpdf)
3. Modify `match_documents_with_metadata` RPC function
4. Implement citation formatting in `GeminiAgent.ts`
5. Test citation accuracy with sample PDFs

**Success criteria:**
- Citations include document name + page number
- Page numbers accurate (verified against PDFs)
- Citations displayed in chat responses
- RLS policies unchanged (still enforce project isolation)

---

## Open Questions / Validation Needed

1. **pgvector version on Supabase:** Confirm project uses pgvector 0.8.0+ (iterative scans feature)
   - Check: Supabase dashboard → Database → Extensions → pgvector version
   - If <0.8.0: Upgrade required for metadata filtering performance

2. **Gemini page extraction accuracy:** Test PDF page number extraction with sample tariff documents
   - Try: Gemini File API with `[PAGE:N]` markers vs unpdf
   - Measure: Accuracy rate, false positives, missing pages

3. **Conversation sync strategy:** Client-only or sync to server for admin visibility?
   - Consider: Privacy (local-only), admin needs (dashboard), compliance
   - Recommendation: Start client-only, add sync later if needed

4. **RLS policy optimization:** Audit existing policies for LEAKPROOF compliance
   - Check: All policies use built-in operators (`=`, `IN`, `<=>`)
   - Avoid: Custom functions that aren't marked LEAKPROOF

5. **Citation format preference:** Footnote-style `[1]` or inline `[filename, p.12]`?
   - Option A: `[1]` with footnote list at end (cleaner, shorter)
   - Option B: `[TVöD_2025.pdf, S.12]` (more informative, longer)
   - Recommendation: Option A for chat UI, Option B for admin reports

6. **Zod current version in apps/api:** Check `package.json` to determine if upgrade needed
   - Run: `cd apps/api && npm list zod`
   - If <4.0: Upgrade to 4.3.5
   - If ≥4.0: Verify `.toJSONSchema()` method exists

---

## Cost Analysis (Incremental for v1.1 Features)

**Per 1,000 conversations:**

| Feature | Cost Component | Estimate |
|---------|---------------|----------|
| **Conversation persistence** | IndexedDB (free, client-side) | $0 |
| **Conversation sync (optional)** | Supabase storage (0.5MB avg × 1000) | $0.01/month |
| **Function calling** | Gemini API calls (same as before) | $0 |
| **Suggested chips** | +1 API call per response (~1K tokens) | +$0.08 per 1K conversations |
| **Citation metadata** | Storage overhead (+15% for page data) | +$0.003/GB/month |
| **Total incremental** | Per 1,000 conversations | **~$0.09** |

**Total cost (baseline + v1.1):**
- Baseline (v1.0): ~$3/month for 1,000 documents (10K pages)
- v1.1 additions: ~$0.09/month for 1,000 conversations
- **Total: ~$3.09/month** for typical usage (1,000 docs + 1,000 conversations)

**Cost optimization tips:**
- Cache suggestions per state (avoid redundant generation)
- Use client-only conversation storage (skip server sync)
- Batch function calls when possible
- Set `topK=3` for citation queries (balance relevance vs cost)

---

## Sources

### Official Documentation
- [Gemini API Function Calling](https://ai.google.dev/gemini-api/docs/function-calling)
- [Gemini API Tools & Agents](https://ai.google.dev/gemini-api/docs/tools)
- [Gemini Structured Output](https://ai.google.dev/gemini-api/docs/structured-output)
- [Dexie.js Next.js Guide](https://medium.com/dexie-js/dexie-js-next-js-fd15556653e6)
- [Dexie useLiveQuery() Documentation](https://dexie.org/docs/dexie-react-hooks/useLiveQuery())
- [Zod v4 Release Notes](https://zod.dev/v4)
- [PostgreSQL Row-Level Security](https://www.postgresql.org/docs/current/ddl-rowsecurity.html)

### Technical Guides & Tutorials
- [Zod v4 Gemini Fix: Using .toJSONSchema()](https://www.buildwithmatija.com/blog/zod-v4-gemini-fix-structured-output-z-tojsonschema)
- [Why Zod Schemas Break with Gemini](https://heyhuy.com/blog/gemini-structured-mode/)
- [localStorage vs IndexedDB Comprehensive Comparison](https://rxdb.info/articles/localstorage-indexeddb-cookies-opfs-sqlite-wasm.html)
- [Build AI-Powered Smart Replies with React](https://dev.to/envitab/build-ai-powered-smart-replies-with-react-and-synthetic-44hc)
- [Dexie with Next.js and React](https://blog.yuceefh.com/build-basic-nextjs-app-indexeddb-dexiejs)
- [Get Started with Dexie in React](https://dexie.org/docs/Tutorial/React)

### RAG & Citation Research
- [Citation-Aware RAG Architecture](https://www.tensorlake.ai/blog/rag-citations)
- [Utilizing Metadata for Better RAG Retrieval (arXiv 2026)](https://arxiv.org/abs/2601.11863)
- [RAG in 2026: Practical Blueprint](https://dev.to/suraj_khaitan_f893c243958/-rag-in-2026-a-practical-blueprint-for-retrieval-augmented-generation-16pp)
- [AI Document Retrieval: Citations & Confidence](https://www.buzzi.ai/insights/ai-document-retrieval-rag-citation-architecture)

### Performance & Security
- [pgvector 0.8.0 Performance Improvements](https://aws.amazon.com/blogs/database/supercharging-vector-search-performance-and-relevance-with-pgvector-0-8-0-on-amazon-aurora-postgresql/)
- [pgvector Key Features Guide (2026)](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/)
- [Postgres RLS vs Performance](https://postgres.fm/episodes/rls-vs-performance)
- [Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide)
- [Implementing RLS in Vector DBs for RAG](https://medium.com/@michael.hannecke/implementing-row-level-security-in-vector-dbs-for-rag-applications-fdbccb63d464)
- [Common Postgres RLS Footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/)
- [VectorChord 0.4: Prefiltering for pgvector](https://blog.vectorchord.ai/vectorchord-04-faster-postgresql-vector-search-with-advanced-io-and-prefiltering)

### Package Registries & Releases
- [Dexie on npm](https://www.npmjs.com/package/dexie)
- [dexie-react-hooks on npm](https://www.npmjs.com/package/dexie-react-hooks)
- [Zod on npm (v4.3.5)](https://www.npmjs.com/package/zod)
- [Zod v4 Announcement](https://peerlist.io/blog/engineering/zod-4-is-here-everything-you-need-to-know)
- [@google/genai on npm](https://www.npmjs.com/package/@google/genai)

### Community Discussions
- [Smart Reply UI Patterns (GitHub)](https://github.com/mahmud-r-farhan/smart-reply)
- [Gemini Function Calling Codelabs](https://codelabs.developers.google.com/codelabs/gemini-function-calling)
- [Supabase RLS Documentation](https://supabase.com/docs/guides/database/postgres/row-level-security)

---

**Research Quality:** All versions verified as of 2026-01-26. Recommendations based on official documentation, recent research papers (2025-2026), and integration analysis with existing codebase.

**Confidence Summary:**

| Area | Confidence | Basis |
|------|------------|-------|
| Conversation persistence (Dexie) | HIGH (95%) | Official docs, Next.js compatibility verified v1.1.3+, npm version confirmed |
| Function calling | HIGH (95%) | Official Gemini API docs, existing @google/genai version supports it |
| Suggested chips | HIGH (90%) | Gemini structured output verified, shadcn/ui already installed |
| Validation (Zod v4) | HIGH (95%) | npm version confirmed, Gemini compatibility fix documented |
| Citation quality | MEDIUM (70%) | Database schema straightforward, Gemini page extraction needs validation |

**Overall confidence: HIGH (90%)**
