# Coding Conventions

**Analysis Date:** 2026-01-23

## Naming Patterns

**Files:**
- Component files: PascalCase with `.tsx` extension (e.g., `MessageBubble.tsx`, `SalaryResult.tsx`)
- Utility/service files: camelCase with `.ts` extension (e.g., `salary-flow.ts`, `GeminiAgent.ts`)
- Configuration files: lowercase with hyphens (e.g., `eslint.config.mjs`)
- Class-based modules: PascalCase (e.g., `SalaryStateMachine`, `GeminiAgent`, `TaxWrapper`)
- Directories: lowercase with hyphens (e.g., `utils/agent`, `lib/vectorstore`, `components/ui`)

**Functions:**
- Regular functions: camelCase (e.g., `sendMessage()`, `getProgress()`, `validateField()`)
- Private methods: camelCase with underscore prefix (e.g., `_recursiveSplit()`, `getMissingFields()`)
- Static methods: camelCase (e.g., `isPhaseComplete()`, `formatSummary()`)
- Async functions: camelCase prefix, clearly indicate async nature (e.g., `async analyzeIntent()`, `async uploadDocumentAction()`)

**Variables:**
- Local variables: camelCase (e.g., `nextState`, `currentYear`, `inputValue`, `isLoading`)
- Constants: UPPER_SNAKE_CASE (e.g., `REQUIREMENTS`, `FIELD_LABELS`, `INITIAL_MESSAGE_TEXT`)
- React hooks state: camelCase (e.g., `const [messages, setMessages]`, `const [progress, setProgress]`)
- Boolean variables: prefix with `is`, `has`, `can` (e.g., `isBot`, `hasChildren`, `canTransition`)

**Types:**
- Interface names: PascalCase with `I` prefix optional (e.g., `FormState`, `Message`, `MessageBubbleProps`, `ValidationResult`)
- Type aliases: PascalCase (e.g., `UserIntent`, `SectionType`, `StepResult`, `SalaryInput`)
- Union/discriminated types: PascalCase (e.g., `'data_provision' | 'question' | 'modification' | 'confirmation' | 'unclear'`)
- Props interfaces: suffix with `Props` (e.g., `MessageBubbleProps`, `AppProps`)

**Database:**
- Database fields: snake_case (e.g., `ip_address`, `public_key`, `allowed_origins`, `gemini_api_key`, `created_at`)

## Code Style

**Formatting:**
- Line length: Soft limit ~100 characters
- Indentation: 2 spaces (configured in Tailwind/PostCSS)
- Semicolons: Required at end of statements
- Trailing commas: Enabled for multi-line objects/arrays
- No explicit semicolons after type/interface declarations in some contexts

**Linting:**
- Tool: ESLint with Next.js config (`eslint-config-next`)
- Config location: `apps/api/eslint.config.mjs`
- Extends: `eslint-config-next/core-web-vitals` and `eslint-config-next/typescript`
- Ignores: `.next/`, `out/`, `build/`, `next-env.d.ts`
- Disable rules available via `// eslint-disable-next-line @typescript-eslint/no-explicit-any` for specific cases (e.g., flexible type handling in SDK compatibility code)

**TypeScript:**
- Strict mode: Enabled (TypeScript 5.x)
- Target: ES2020+ (Next.js 16.1.2 compatible)
- Module resolution: Node (modern)
- JSX: Enabled for React components
- Import style: ES6 modules (`import`/`export`)

## Import Organization

**Order:**
1. External library imports (`react`, `next`, `@google/genai`, `@supabase/supabase-js`, third-party)
2. Internal utility imports (`../utils`, `../lib`, `../types`)
3. Component imports (`../components`)
4. Relative imports (at same level or parent)
5. Type imports (explicit `import type` or `type { ... } from`)

**Example (from `apps/api/app/api/chat/route.ts`):**
```typescript
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GeminiAgent } from "../../../utils/agent/GeminiAgent";
import { Content } from "@google/genai";
import type { FormState, UserIntent } from "../../../types/form";
import { ConversationAnalyzer, type IntentAnalysis } from "../../../utils/agent/ConversationAnalyzer";
import { VectorstoreService } from "../../../lib/vectorstore/VectorstoreService";
```

**Path Aliases:**
- Not extensively used; relative paths preferred for clarity
- Absolute imports via `@/` in some contexts (Supabase client wrapper)
- Most cross-directory imports use relative paths with `../` navigation

**Type Imports:**
- Use explicit `import type` for type-only imports to reduce bundle size
- Inline type imports: `import type { FormState } from "..."`
- Mixed imports: can combine `import { Class }` and `import type { Type }` in single statement

## Error Handling

**Patterns:**
- Explicit try-catch blocks in async functions
- Throw descriptive Error objects with context: `throw new Error("Unauthorized")`
- Error logging via `console.error("[Context] Error message", error)` with context prefix
- Return error objects in server actions: `{ success: true }` or `{ error: error.message }`
- Silent failure with logging: catch and log, continue gracefully in non-critical paths
- Validation errors include field context: returned as `ValidationResult` objects with `valid`, `error`, and optional `normalizedValue`

**Example (from `apps/api/app/actions/documents.ts`):**
```typescript
try {
    if (!user) throw new Error("Unauthorized");
    if (!file) throw new Error("No file provided");
    // ... operation
    return { success: true };
} catch (error: any) {
    console.error("Upload Action Error", error);
    return { error: error.message };
}
```

**API Error Responses:**
- Status codes: 401 (Unauthorized), 403 (Forbidden), 429 (Rate Limited), 500 (Internal)
- Response format: `{ error: string }` JSON
- Example: `NextResponse.json({ error: "Project ID is required" }, { status: 401 })`

## Logging

**Framework:** `console` object (no external logging library)

**Patterns:**
- Context prefix in square brackets: `console.log("[GeminiAgent] Message")`
- Error logs with context: `console.error("[StateMachine] Error description", error)`
- Info/debug logs for flow tracking: `console.log("[StateMachine] Intent detected")`
- Structured context keys: `[ComponentName]`, `[FunctionName]`, `[ProcessName]`

**Level Convention:**
- `console.log()`: Flow tracking, normal operations
- `console.error()`: Exceptions, validation failures, critical issues
- `console.warn()`: Deprecated usage, potential issues (not heavily used)

**Example (from `apps/api/app/api/chat/route.ts`):**
```typescript
console.log(`[StateMachine] Intent detected: ${intentAnalysis.intent}`);
console.log('[StateMachine] Calculating salary with input:', salaryInput);
console.error('[StateMachine] Calculation error:', calcError);
```

## Comments

**When to Comment:**
- Complex algorithm or state machine transitions: provide high-level explanation
- Non-obvious intent: explain "why" not "what" (code should be readable)
- Workarounds or hacks: explain context and intent
- German-specific logic: document assumptions (e.g., tax calculations, tariff mappings)
- Compatibility notes: explain SDK version quirks or fallbacks

**JSDoc/TSDoc:**
- Used extensively for public methods and classes
- Format: `/** description */` with `@param` and `@returns` tags
- Single-line: `/** Brief description */` for simple functions
- Multi-line for complex signatures

**Example (from `apps/api/lib/salary-flow.ts`):**
```typescript
/**
 * Check if all required fields for the current phase are complete
 * @param currentState The current form state
 * @returns True if the current phase is complete
 */
static isPhaseComplete(currentState: FormState): boolean {
```

**Inline Comments:**
- Minimal; prefer self-documenting code
- Used for non-obvious business logic: `// Stay in JOB_DETAILS if fields missing`
- Prefix comment with purpose: `// NOTE:`, `// HACK:`, `// TODO:`, `// FIXME:`

**Example (from `apps/api/utils/tax/TaxWrapper.ts`):**
```typescript
// 1. Map User Input to BMF Input
const taxInput = this.mapInput(input);

// 2. Calculate Tax (handles year-specific logic)
let taxOutput: TaxOutput;
```

## Function Design

**Size:**
- Preferred: < 50 lines for readability
- Acceptable: < 100 lines for complex operations
- Very long functions (200+ lines): candidate for refactoring/breaking down

**Parameters:**
- Maximum 3-4 positional parameters; use objects for more
- Type all parameters explicitly
- Required before optional in signature
- Consider destructuring for objects

**Example (good):**
```typescript
async validate(
    field: string,
    rawValue: any,
    projectId: string
): Promise<ValidationResult>
```

**Return Values:**
- Explicit return type always specified
- Return early for error/edge cases
- Use union types for multiple return forms (e.g., `Result | null`)
- Async functions always return `Promise<T>`

**Design Patterns:**
- Static methods for state machines: `SalaryStateMachine.isPhaseComplete()`
- Constructor-based initialization for services: `new GeminiAgent()`, `new TaxWrapper()`
- Avoid side effects; prefer immutability (e.g., clone state: `JSON.parse(JSON.stringify(obj))`)

## Module Design

**Exports:**
- Named exports preferred for utilities: `export class ServiceName`, `export function actionName()`
- Default export for React components: `export default function ComponentName()`
- Type exports: use explicit `export type`

**Barrel Files:**
- Not extensively used; direct imports preferred
- When used, re-export from subdirectory: `export { Class } from './file'`

**Example (from `apps/api/utils/tax/index.ts`):**
```typescript
export { TaxWrapper } from './TaxWrapper';
export type { SalaryInput, TaxResult } from './types';
```

**Class Structure:**
- Private fields: underscore prefix is optional; use `private` keyword
- Constructor: initialize dependencies, validate inputs
- Public methods: document with JSDoc, implement core logic
- Private methods: underscore prefix or `private` keyword

**Example (from `apps/api/utils/agent/GeminiAgent.ts`):**
```typescript
export class GeminiAgent {
    private client: GoogleGenAI;
    private taxWrapper: TaxWrapper;

    constructor() {
        this.client = getGeminiClient();
        this.taxWrapper = new TaxWrapper();
    }

    async sendMessage(...): Promise<string> { ... }
}
```

## React Component Conventions

**Functional Components:**
- Use `React.FC<Props>` type annotation
- Destructure props in signature
- Export as default or named

**Example (from `apps/web/components/MessageBubble.tsx`):**
```typescript
interface MessageBubbleProps {
  message: Message;
  onOptionSelected?: (option: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    onOptionSelected
}) => {
    // component logic
}
```

**Hooks:**
- Use standard hooks from React (`useState`, `useEffect`, `useRef`)
- Call hooks at top level; no conditional calls
- useState for local state, useRef for DOM refs
- useEffect for side effects with proper cleanup

**Tailwind Styling:**
- Use Tailwind 4 utility classes
- CSS-in-JS: CSS variables for theme colors: `var(--primary-color)`, `var(--primary-light)`
- Conditional classes via template strings: `` `${condition ? 'class' : 'other'}` ``

**Props Validation:**
- Type props via interface
- Optional props: use `?` syntax
- Callbacks: type as function signatures

## Server Actions & API Routes

**Server Actions:**
- Filename suffix: `.ts` in `actions/` directory
- Prefix: `"use server"` directive at top
- Return format: `{ success: true }` or `{ error: string }`
- Naming: suffix with `Action` (e.g., `uploadDocumentAction()`)

**API Routes:**
- Location: `app/api/*/route.ts`
- Named exports: `export async function GET/POST/OPTIONS(request: Request)`
- Return: `NextResponse.json()` with status codes
- CORS: implement in OPTIONS handler

**Example (from `apps/api/app/api/chat/route.ts`):**
```typescript
export async function POST(request: Request) {
    try {
        // business logic
        return NextResponse.json({ text: "...", formState: ... });
    } catch (error) {
        console.error("[Error]", error);
        return NextResponse.json({ error: "..." }, { status: 500 });
    }
}

export async function OPTIONS(request: Request) {
    return NextResponse.json({}, { status: 200 });
}
```

---

*Convention analysis: 2026-01-23*
