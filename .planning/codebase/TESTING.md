# Testing Patterns

**Analysis Date:** 2026-01-23

## Test Framework

**Runner:**
- Not detected - No test framework currently configured

**Assertion Library:**
- Not applicable - No testing library present

**Run Commands:**
- Not applicable - No test scripts in package.json

## Test File Organization

**Current Status:**
- No `.test.ts`, `.test.tsx`, `.spec.ts`, or `.spec.tsx` files found in codebase
- No `jest.config.ts`, `vitest.config.ts`, or test configuration files present
- Testing infrastructure is not yet implemented

**Expected Pattern (if implemented):**
- Location: co-located with source files (e.g., `utils/agent/GeminiAgent.test.ts` alongside `utils/agent/GeminiAgent.ts`)
- Naming: `[fileName].test.ts` or `[fileName].spec.ts`
- Structure:
```
apps/api/
├── utils/
│   ├── agent/
│   │   ├── GeminiAgent.ts
│   │   ├── GeminiAgent.test.ts
│   │   ├── ConversationAnalyzer.ts
│   │   └── ConversationAnalyzer.test.ts
│   └── tax/
│       ├── TaxWrapper.ts
│       └── TaxWrapper.test.ts
```

## Test Structure

**When Implemented:**
Tests should follow this structure based on codebase patterns:

```typescript
import { SalaryStateMachine } from './salary-flow';
import { FormState } from './types/form';

describe('SalaryStateMachine', () => {
  describe('isPhaseComplete', () => {
    it('should return true when all required job_details fields are present', () => {
      const state: FormState = {
        section: 'job_details',
        data: {
          job_details: {
            tarif: 'TVöD',
            experience: 'Stufe 3',
            hours: 38.5,
            state: 'Bayern'
          }
        },
        missingFields: []
      };

      expect(SalaryStateMachine.isPhaseComplete(state)).toBe(true);
    });

    it('should return false when required fields are missing', () => {
      const state: FormState = {
        section: 'job_details',
        data: {
          job_details: {
            tarif: 'TVöD'
            // missing: experience, hours, state
          }
        },
        missingFields: ['experience', 'hours', 'state']
      };

      expect(SalaryStateMachine.isPhaseComplete(state)).toBe(false);
    });
  });

  describe('canTransition', () => {
    it('should allow transition from job_details to tax_details when phase is complete', () => {
      const state: FormState = {
        section: 'job_details',
        data: {
          job_details: {
            tarif: 'TVöD',
            experience: 'Stufe 3',
            hours: 38.5,
            state: 'Bayern'
          }
        },
        missingFields: []
      };

      expect(SalaryStateMachine.canTransition(state, 'tax_details')).toBe(true);
    });

    it('should prevent forward transition when phase is incomplete', () => {
      const state: FormState = {
        section: 'job_details',
        data: {
          job_details: { tarif: 'TVöD' }
        },
        missingFields: ['experience', 'hours', 'state']
      };

      expect(SalaryStateMachine.canTransition(state, 'tax_details')).toBe(false);
    });
  });
});
```

**Patterns to Follow:**
- Group related tests in `describe()` blocks
- Use descriptive test names starting with "should"
- Arrange-Act-Assert pattern: setup → execute → verify
- One assertion per test or related assertions in single test
- Setup shared state in `beforeEach()` for repetitive tests
- Teardown in `afterEach()` if needed (e.g., mock cleanup)

## Mocking

**When Implemented - Framework Recommendation:**
- Consider Vitest for better TypeScript support in Next.js 16
- Or Jest with `@testing-library/react` for component testing

**Patterns:**

**Mocking External Services:**
```typescript
// Mock Gemini API
jest.mock('@google/genai', () => ({
  GoogleGenAI: jest.fn().mockImplementation(() => ({
    chats: {
      create: jest.fn().mockReturnValue({
        sendMessage: jest.fn().mockResolvedValue({
          response: {
            candidates: [{ content: { parts: [{ text: 'mocked response' }] } }]
          }
        })
      })
    }
  }))
}));

// Mock Supabase
jest.mock('@supabase/supabase-js', () => ({
  createClient: jest.fn().mockReturnValue({
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({ data: [], error: null })
      })
    })
  }))
}));
```

**What to Mock:**
- External API clients (Gemini, Supabase, Google Cloud)
- Network requests (fetch, axios)
- Database operations
- File system operations
- Date/time (for consistent test results)

**What NOT to Mock:**
- Core business logic classes (e.g., SalaryStateMachine, TaxWrapper)
- Utility functions
- Type definitions
- Local state management
- Simple synchronous functions

**Example - Testing GeminiAgent with mocked client:**
```typescript
import { GeminiAgent } from './GeminiAgent';

jest.mock('../../lib/gemini');

describe('GeminiAgent', () => {
  let agent: GeminiAgent;

  beforeEach(() => {
    jest.clearAllMocks();
    agent = new GeminiAgent();
  });

  it('should send a message and return response text', async () => {
    const mockResponse = 'Hallo! Wie kann ich dir helfen?';

    // Mock implementation
    (agent as any).client.chats.create = jest.fn().mockReturnValue({
      sendMessage: jest.fn().mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: mockResponse }] } }]
        }
      })
    });

    const result = await agent.sendMessage('Hallo', []);
    expect(result).toBe(mockResponse);
  });
});
```

## Fixtures and Factories

**Test Data Pattern:**
```typescript
// fixtures/formState.ts
export const createFormState = (overrides?: Partial<FormState>): FormState => ({
  section: 'job_details',
  data: {
    job_details: {
      tarif: 'TVöD',
      experience: 'Stufe 3',
      hours: 38.5,
      state: 'Bayern'
    }
  },
  missingFields: [],
  ...overrides
});

export const completeJobDetailsState: FormState = {
  section: 'job_details',
  data: {
    job_details: {
      tarif: 'TVöD',
      experience: 'Stufe 3',
      hours: 38.5,
      state: 'Bayern'
    }
  },
  missingFields: []
};

export const incompleteJobDetailsState: FormState = {
  section: 'job_details',
  data: {
    job_details: {
      tarif: 'TVöD'
    }
  },
  missingFields: ['experience', 'hours', 'state']
};
```

**Location:**
- Create `__fixtures__/` or `fixtures/` directory at same level as tests
- Or in test file if reused only locally
- Prefix with fixture type: `mockFormState`, `testSalaryInput`, `stubGeminiResponse`

**Factory Functions:**
- Use for complex object creation
- Allow partial overrides for test variations
- Named with `create` prefix: `createFormState()`, `createSalaryInput()`

## Coverage

**Requirements:**
- Not enforced - No coverage configuration present
- Recommendation: Set minimum 80% coverage for critical paths once testing is implemented

**View Coverage (when testing framework is added):**
```bash
npm run test -- --coverage
# Output: coverage/ directory with HTML report
```

**Critical Areas for Coverage (once implemented):**
- State machine logic: `apps/api/lib/salary-flow.ts` (decision trees)
- Tax calculation: `apps/api/utils/tax/TaxWrapper.ts` (complex math)
- Intent analysis: `apps/api/utils/agent/ConversationAnalyzer.ts` (keyword matching)
- Validation: `apps/api/utils/agent/ResponseValidator.ts` (input handling)
- API routes: `apps/api/app/api/chat/route.ts` (main endpoint)

## Test Types

**Unit Tests:**
- Scope: Individual functions/classes in isolation
- Approach: Mock external dependencies
- Examples:
  - `SalaryStateMachine.isPhaseComplete()` with various FormState inputs
  - `SalaryStateMachine.getMissingFields()` with field combinations
  - `TaxWrapper.calculate()` with known salary inputs
  - `ConversationAnalyzer.detectIntentByKeywords()` with message samples

**Integration Tests:**
- Scope: Multiple components working together
- Approach: Minimal mocking; test real interactions
- Examples:
  - GeminiAgent → TaxWrapper salary calculation flow
  - ConversationAnalyzer → ResponseValidator → FormState update
  - Chat endpoint: request → analysis → calculation → response

**E2E Tests:**
- Framework: Not used
- Approach: When needed, use Playwright or Cypress (not currently configured)
- Scope: Full chat flow from user message to salary result

## Common Patterns

**Async Testing:**
```typescript
// With Vitest/Jest async support
it('should calculate salary asynchronously', async () => {
  const wrapper = new TaxWrapper();
  const input: SalaryInput = {
    yearlySalary: 30000,
    taxClass: 1,
    year: 2025
  };

  const result = await wrapper.calculate(input);

  expect(result.netto).toBeGreaterThan(0);
  expect(result.taxes.lohnsteuer).toBeGreaterThan(0);
});

// Alternatively with .then()
it('should handle promise resolution', () => {
  return agent.sendMessage('test', []).then(response => {
    expect(response).toContain('...');
  });
});
```

**Error Testing:**
```typescript
it('should throw error on missing credentials', () => {
  process.env.GOOGLE_CLOUD_PROJECT = '';

  expect(() => {
    getGeminiClient();
  }).toThrow('GOOGLE_CLOUD_PROJECT environment variable is required');
});

it('should handle validation errors gracefully', async () => {
  const result = await validator.validate('tarif', 'invalid_tariff', 'project-123');

  expect(result.valid).toBe(false);
  expect(result.error).toBeDefined();
});
```

**Testing State Transitions:**
```typescript
it('should transition through complete flow', () => {
  let state = createFormState({ section: 'job_details' });

  // Fill in job details
  state.data.job_details = {
    tarif: 'TVöD',
    experience: 'Stufe 3',
    hours: 38.5,
    state: 'Bayern'
  };
  state.missingFields = [];

  // Check transition
  expect(SalaryStateMachine.canTransition(state, 'tax_details')).toBe(true);

  // Advance
  const step = SalaryStateMachine.getNextStep(state);
  expect(step.nextState.section).toBe('tax_details');
  expect(step.shouldExtend).toBe(true);
});
```

**Snapshot Testing (use sparingly):**
```typescript
it('should format summary consistently', () => {
  const state = completeJobDetailsState;
  const summary = SalaryStateMachine.formatSummary(state);

  expect(summary).toMatchSnapshot();
});
```

## Current Testing Status

**What Exists:**
- No unit tests
- No integration tests
- No E2E tests
- No test framework configuration

**Critical Code Without Tests:**
1. **State Machine Logic** (`apps/api/lib/salary-flow.ts`)
   - Complex transitions and validation rules
   - High impact on user flow

2. **Salary Calculation** (`apps/api/utils/tax/TaxWrapper.ts`)
   - Complex tax/social security calculations
   - Financial accuracy critical

3. **Chat Endpoint** (`apps/api/app/api/chat/route.ts`)
   - Main entry point, multiple security checks
   - Rate limiting, origin validation, RAG injection

4. **Intent Detection** (`apps/api/utils/agent/ConversationAnalyzer.ts`)
   - Keyword matching with fallback to LLM
   - Core to understanding user intent

## Recommendations for Testing Implementation

1. **Start with:** Vitest (better TypeScript support, ESM-native)
2. **Configure:** `vitest.config.ts` at workspace root
3. **Phase 1 - Unit Tests:** State machine, tax calculations, validators
4. **Phase 2 - Integration:** API endpoint with mocked Gemini/Supabase
5. **Phase 3 - E2E:** Full chat flows (optional, Playwright recommended)
6. **Target coverage:** 80% minimum for business logic, 100% for financial calculations

---

*Testing analysis: 2026-01-23*
