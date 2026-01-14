# PRD: AI-Guided Salary Interview with State Machine Integration

## Introduction

Combine the conversational AI agent with the strict state machine guardrails to create a smooth, guided salary interview experience. The system will maintain conversational flexibility while ensuring all required data is collected systematically. Users should only answer simple questions they know off the top of their head, while the AI handles validation, enrichment, and translation of responses into structured data using vectorstore knowledge and tax calculation tools.

## Goals

- Guide users through a 3-phase salary interview (Job Details → Tax Details → Summary) with conversational AI
- Maintain strict state machine transitions while allowing natural conversation flow
- Keep cognitive load minimal by asking only simple, easily-answerable questions
- Leverage vectorstore (RAG) for answering user questions and validating responses
- Automatically extract, validate, and enrich user responses before state transitions
- Enable answer modifications only during the summary/confirmation phase
- Complete end-to-end flow: interview → calculation → database storage

## User Stories

### US-001: Conversational Flow with State Machine Guardrails
**Description:** As a user, I want to have a natural conversation with the AI while being guided through the salary calculation process, so that I don't feel restricted by a rigid form.

**Acceptance Criteria:**
- [ ] AI agent accepts free-form user input at any state
- [ ] State machine tracks current section and missing fields
- [ ] Agent can deviate from the interview to answer user questions
- [ ] After answering user questions, agent automatically returns to collecting missing fields
- [ ] State transitions only occur when all required fields for current section are collected
- [ ] Typecheck passes

### US-002: Intelligent Question Handling with Vectorstore
**Description:** As a user, I want to ask questions about salary terms or tax details during the interview, so that I can make informed responses without leaving the chat.

**Acceptance Criteria:**
- [ ] Agent detects when user asks a question vs. provides data
- [ ] Agent queries vectorstore (RAG documents) to answer user questions
- [ ] Agent provides concise, relevant answers from vectorstore
- [ ] After answering, agent smoothly transitions back to the interview flow
- [ ] User questions do not affect FormState or trigger premature state transitions
- [ ] Typecheck passes

### US-003: Ambiguity Handling with Same-Turn Clarification
**Description:** As a user, I want to receive immediate clarification requests when my answer is unclear, so that I can correct it right away without confusion.

**Acceptance Criteria:**
- [ ] Agent detects ambiguous or invalid responses during extraction phase
- [ ] Agent asks for clarification in the same conversational turn (no state transition)
- [ ] Clarification requests are specific and reference the problematic input
- [ ] Agent suggests examples or valid options when appropriate
- [ ] FormState remains unchanged until valid data is provided
- [ ] Typecheck passes

### US-004: Response Validation and Enrichment
**Description:** As a user, I want my responses to be automatically validated and enriched, so that the salary calculation is accurate without me having to know technical details.

**Acceptance Criteria:**
- [ ] Agent extracts field values from conversational responses using LLM
- [ ] Agent validates extracted values against expected formats/enums
- [ ] Agent queries vectorstore to enrich responses (e.g., "TVöD" → "tvoed", "Klasse 1" → "1")
- [ ] Invalid values trigger clarification requests (US-003)
- [ ] Valid, enriched values are stored in FormState before state transition
- [ ] Typecheck passes

### US-005: Answer Modification in Summary Phase
**Description:** As a user, I want to review and modify my answers during the summary phase, so that I can correct any mistakes before final calculation.

**Acceptance Criteria:**
- [ ] In summary state, agent displays all collected data (job_details + tax_details)
- [ ] User can request changes to specific fields (e.g., "Actually, I work 35 hours")
- [ ] Agent detects modification requests and updates FormState accordingly
- [ ] Modified values are re-validated and re-enriched
- [ ] Agent asks for confirmation again after modifications
- [ ] Typecheck passes

### US-006: Simple, Low-Cognitive-Load Questions
**Description:** As a user, I want to be asked simple questions that I can answer without thinking hard, so that the interview feels effortless.

**Acceptance Criteria:**
- [ ] Agent asks about user-friendly concepts (e.g., "job role" not "Entgeltgruppe P7")
- [ ] Questions are phrased in everyday language, not technical jargon
- [ ] Agent translates user-friendly responses to technical fields internally
- [ ] Each question focuses on one piece of information at a time
- [ ] Agent provides examples when questions might be unclear
- [ ] Typecheck passes

### US-007: Phase-Appropriate System Instructions
**Description:** As a developer, I need the state machine to provide phase-appropriate instructions to the agent, so that the conversation stays on track.

**Acceptance Criteria:**
- [ ] State machine returns `systemInstructions` with each `getNextStep()` call
- [ ] Instructions specify which fields are still missing in current phase
- [ ] Instructions guide agent on when to transition to next phase
- [ ] Instructions are injected into agent's prompt generation
- [ ] Agent follows instructions while maintaining conversational tone
- [ ] Typecheck passes

### US-008: Calculation and Database Storage
**Description:** As a user, I want my salary calculated and saved automatically after confirmation, so that I can see the results and access them later.

**Acceptance Criteria:**
- [ ] In summary state, agent detects user confirmation (e.g., "yes", "calculate", "go")
- [ ] Agent calls `calculate_net_salary` tool with all collected FormState data
- [ ] Agent receives calculation results (brutto, netto, taxes, etc.)
- [ ] Agent saves calculation results to `salary_inquiries` table via existing logic
- [ ] Agent displays formatted results to user with breakdown
- [ ] State machine transitions to COMPLETED state
- [ ] Typecheck passes

### US-009: Progress Tracking
**Description:** As a user, I want to see how far along I am in the interview process, so that I know what to expect.

**Acceptance Criteria:**
- [ ] Agent calculates completion percentage based on FormState.missingFields
- [ ] Agent includes `[PROGRESS: 0-100]` marker in responses
- [ ] Progress is calculated as: `(totalRequiredFields - missingFields.length) / totalRequiredFields * 100`
- [ ] Progress updates after each successful data extraction
- [ ] Frontend can parse and display progress indicator
- [ ] Typecheck passes

### US-010: Hybrid Flow Architecture
**Description:** As a developer, I need a clear separation between state machine logic and agent intelligence, so that the system is maintainable and extensible.

**Acceptance Criteria:**
- [ ] State machine handles: transitions, validation, required fields tracking
- [ ] Agent handles: conversation, extraction, clarification, vectorstore queries
- [ ] Route handler orchestrates: extraction → state machine → response generation
- [ ] Each component has a single, clear responsibility
- [ ] Code is organized into logical modules/files
- [ ] Typecheck passes

## Functional Requirements

### State Machine (Guardrails)

- **FR-1:** State machine must define required fields for each section:
  - `job_details`: tarif, experience, hours, state
  - `tax_details`: taxClass, churchTax, numberOfChildren
  - `summary`: (no additional fields)

- **FR-2:** State machine must track current section and missing fields in FormState

- **FR-3:** State machine must transition to next section only when current section's required fields are complete

- **FR-4:** State machine must provide system instructions for each state with missing field information

- **FR-5:** State machine must support state transitions: JOB_DETAILS → TAX_DETAILS → SUMMARY → COMPLETED

### AI Agent (Conversational Intelligence)

- **FR-6:** Agent must detect when user input contains data vs. questions

- **FR-7:** Agent must query vectorstore (RAG documents) when user asks questions

- **FR-8:** Agent must extract field values from conversational user input using LLM

- **FR-9:** Agent must validate extracted values against expected formats/types

- **FR-10:** Agent must enrich extracted values using vectorstore (e.g., normalize "TVöD" → "tvoed")

- **FR-11:** Agent must detect ambiguous/invalid responses and request clarification in the same turn

- **FR-12:** Agent must ask questions in user-friendly, everyday language (no technical jargon)

- **FR-13:** Agent must translate user-friendly responses to technical field values internally

- **FR-14:** Agent must maintain conversational tone while following state machine instructions

### Summary and Modification Phase

- **FR-15:** In summary state, agent must display all collected data in human-readable format

- **FR-16:** Agent must detect modification requests and update specific FormState fields

- **FR-17:** Agent must re-validate and re-enrich modified values

- **FR-18:** Agent must ask for confirmation again after modifications

- **FR-19:** Agent must detect confirmation signals (e.g., "yes", "calculate", "go ahead")

### Calculation and Storage

- **FR-20:** Upon confirmation, agent must call `calculate_net_salary` tool with FormState data

- **FR-21:** Agent must map FormState fields to tool parameters:
  - Extract yearlySalary from tarif + group + experience + hours
  - Map taxClass, year, hasChildren, childCount, churchTax, state, birthYear

- **FR-22:** Agent must save calculation results to `salary_inquiries` table

- **FR-23:** Agent must display formatted calculation results to user

- **FR-24:** State machine must transition to COMPLETED state after successful calculation

### Progress Tracking

- **FR-25:** Agent must calculate and include `[PROGRESS: N]` in responses where N = completion percentage

- **FR-26:** Progress calculation: `(totalRequiredFields - missingFields.length) / totalRequiredFields * 100`

## Non-Goals (Out of Scope)

- Multi-language support beyond German (current implementation is German-only)
- Voice input/output capabilities
- Integration with external HR systems or payroll services
- Historical salary comparison or trends analysis
- Personalized recommendations based on user profiles
- Multi-user or team-based salary calculations
- Export to PDF or other document formats (only database storage)
- Real-time calculation updates as user types
- Undo/redo functionality for answer modifications

## Design Considerations

### Conversation Flow Example

**Phase 1: Job Details**
```
Agent: Hallo! Ich helfe dir bei der Gehaltsberechnung. Lass uns starten.
       Was arbeitest du? (z.B. Pflegehelfer, Pflegefachkraft, Stationsleitung)
       [PROGRESS: 0]

User:  Ich bin Pflegefachfrau

Agent: Super! Wie lange arbeitest du schon in diesem Beruf?
       [PROGRESS: 25]

User:  Seit 5 Jahren

Agent: Klasse. Arbeitest du Vollzeit oder Teilzeit? Wie viele Stunden pro Woche?
       [PROGRESS: 50]

User:  Vollzeit, 38,5 Stunden

Agent: In welchem Bundesland arbeitest du?
       [PROGRESS: 75]

User:  Nordrhein-Westfalen
```

**Phase 2: Tax Details**
```
Agent: Perfekt! Jetzt noch ein paar Fragen für die Netto-Berechnung.
       Bist du verheiratet oder ledig?
       [PROGRESS: 80]

User:  Was bedeutet das für die Steuer? <-- USER QUESTION

Agent: Gerne erkläre ich das: Ledig bedeutet Steuerklasse 1, verheiratet
       normalerweise Klasse 4/4 oder 3/5. Steuerklasse 1 hat höhere
       Abzüge als Klasse 3. Also, bist du verheiratet oder ledig?

User:  Verheiratet

Agent: Hast du Kinder?
       [PROGRESS: 90]

User:  Ja, zwei

Agent: Zahlst du Kirchensteuer?
       [PROGRESS: 95]

User:  Nein
```

**Phase 3: Summary**
```
Agent: Super! Lass mich zusammenfassen:
       - Pflegefachkraft mit 5 Jahren Erfahrung
       - Vollzeit (38,5h/Woche) in NRW
       - Verheiratet mit 2 Kindern, keine Kirchensteuer

       Soll ich die Berechnung durchführen?
       [PROGRESS: 100]

User:  Moment, ich arbeite nur 35 Stunden <-- MODIFICATION

Agent: Kein Problem, ich korrigiere das:
       - Pflegefachkraft mit 5 Jahren Erfahrung
       - Teilzeit (35h/Woche) in NRW
       - Verheiratet mit 2 Kindern, keine Kirchensteuer

       Passt das jetzt? Soll ich berechnen?

User:  Ja, bitte

Agent: Ich berechne jetzt dein geschätztes Gehalt...
       [Calls calculate_net_salary tool]

       Hier ist deine Berechnung für 2026:
       💰 Bruttogehalt: 3.450,00 €/Monat
       🏠 Nettogehalt: 2.380,50 €/Monat
       📊 Steuern: 420,00 €
       📊 Sozialabgaben: 649,50 €

       Die Berechnung wurde gespeichert!
```

### Ambiguity Handling Example

```
User:  Ich arbeite in der Pflege

Agent: Das ist super! Kannst du mir etwas genauer sagen, was du machst?
       Bist du z.B.:
       - Pflegehelfer/in (ohne Ausbildung oder 1 Jahr)
       - Pflegefachkraft (3 Jahre Ausbildung)
       - Stationsleitung oder andere Führungsposition?
```

### Vectorstore Query Example

```
User:  Was ist der Unterschied zwischen TVöD und TV-L?

Agent: [Queries vectorstore with: "difference TVöD TV-L"]
       Der TVöD (Tarifvertrag öffentlicher Dienst) gilt für Bund und
       Kommunen, der TV-L für die Länder. Die Gehaltstabellen sind
       ähnlich, aber leicht unterschiedlich. Für Pflegekräfte ist
       meist der TVöD relevant.

       Arbeitest du im öffentlichen Dienst?
```

## Technical Considerations

### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Chat API Route Handler                   │
│  /apps/api/app/api/chat/route.ts                           │
└───────────┬─────────────────────────────────────────┬───────┘
            │                                         │
            ├─ Security Checks (Rate Limiting, CORS) │
            ├─ RAG Document Injection                 │
            │                                         │
            ▼                                         ▼
┌───────────────────────┐              ┌──────────────────────┐
│  State Machine Flow   │              │   Agent Flow         │
│  (currentFormState)   │              │   (Legacy)           │
└───────┬───────────────┘              └──────────────────────┘
        │
        ├─ 1. EXTRACTION PHASE
        │    └─ LLM extracts values from user message
        │       based on missingFields
        │
        ├─ 2. STATE MACHINE LOGIC
        │    └─ SalaryStateMachine.getNextStep()
        │       - Check missing fields
        │       - Transition if complete
        │       - Return systemInstructions
        │
        └─ 3. RESPONSE GENERATION
             └─ LLM generates conversational response
                based on systemInstructions
```

### State Machine Integration Points

1. **Extraction Phase** (Line 144-177 in route.ts):
   - Enhance to detect: data vs. question vs. modification
   - Add vectorstore enrichment for extracted values
   - Add validation logic with clarification handling

2. **State Machine Logic** (Line 179-181 in route.ts):
   - Remains unchanged - pure transition logic
   - Returns: nextState, shouldExtend, systemInstructions

3. **Response Generation** (Line 183-196 in route.ts):
   - Enhance prompt to:
     - Distinguish question-answering from data collection
     - Include vectorstore context when needed
     - Format summary data in human-readable way
     - Detect confirmation signals in summary state

### New Components to Add

1. **ConversationAnalyzer** (utils/agent/ConversationAnalyzer.ts):
   ```typescript
   class ConversationAnalyzer {
     async analyzeIntent(message: string, currentState: FormState):
       Promise<'data' | 'question' | 'modification' | 'confirmation'>
   }
   ```

2. **VectorstoreService** (utils/vectorstore/VectorstoreService.ts):
   ```typescript
   class VectorstoreService {
     async query(question: string): Promise<string>
     async enrich(field: string, value: string): Promise<string>
   }
   ```

3. **ResponseValidator** (utils/agent/ResponseValidator.ts):
   ```typescript
   class ResponseValidator {
     validate(field: string, value: any): { valid: boolean, error?: string }
     async enrichWithVectorstore(field: string, value: string): Promise<string>
   }
   ```

### Existing Components to Enhance

1. **SalaryStateMachine** (lib/salary-flow.ts):
   - Add `isComplete()` method to check if all data collected
   - Add `canTransition()` method for validation before transition
   - Add progress calculation helper

2. **GeminiAgent** (utils/agent/GeminiAgent.ts):
   - Add vectorstore integration for RAG queries
   - Add conversation history management for context
   - Keep tool execution logic unchanged

3. **FormState Type** (types/form.ts):
   - Add `conversationContext?: string[]` for tracking question history
   - Add `userIntent?: string` for current turn intent
   - Consider adding `validationErrors?: Record<string, string>`

### Database Schema

The existing `salary_inquiries` table handles storage. Ensure it includes:
- All FormState.data fields (job_details + tax_details)
- Calculation results (brutto, netto, taxes, etc.)
- Timestamp and projectId for tracking

### Performance Considerations

- **Vectorstore Queries**: Cache frequent questions (e.g., "What is TVöD?") for 24h
- **LLM Calls**: Current implementation makes 2 calls per turn (extraction + response). Consider combining into single call with structured output for optimization.
- **State Persistence**: FormState is sent from frontend. Consider session storage if frontend is stateless.

## Success Metrics

- **Completion Rate**: >80% of users complete the full interview flow
- **Average Interview Duration**: <3 minutes from start to calculation
- **Clarification Request Rate**: <20% of turns require clarification
- **User Question Rate**: Users ask questions in ~30% of interviews (indicates engagement and trust)
- **Modification Rate**: <10% of users modify answers in summary phase (indicates accurate extraction)
- **Data Accuracy**: >95% of extracted values are correctly validated and enriched

## Open Questions

1. **Vectorstore Implementation**:
   - Are documents already embedded in Supabase vector store?
   - Or using Gemini Files API only for context injection?
   - Do we need semantic search capabilities or is file context injection sufficient?

2. **Session Management**:
   - How is FormState persisted between turns? Frontend state only?
   - Should we implement server-side session storage for reliability?

3. **Error Recovery**:
   - What happens if LLM extraction fails repeatedly for same field?
   - Should we fall back to structured form input after N failed attempts?

4. **Multi-Tariff Support**:
   - Current system mentions TVöD-P (Pflege) only
   - Are other tariffs (TV-L, AVR, etc.) in scope for this feature?
   - Do different tariffs require different conversation flows?

5. **Confirmation Detection**:
   - What phrases should trigger calculation? ("yes", "ja", "berechnen", "go", etc.)
   - Should we use LLM to detect confirmation intent or keyword matching?

6. **Progress Display**:
   - Should progress be linear or phase-based? (e.g., "Phase 1/3" vs "60% complete")
   - Should frontend parse `[PROGRESS: N]` marker or receive separate field?

## Implementation Notes

### Phase 1: Foundation (Conversation Analysis)
- Implement ConversationAnalyzer to detect intent
- Update extraction phase to handle questions vs. data
- Add basic vectorstore query for user questions

### Phase 2: Validation and Enrichment
- Implement ResponseValidator with vectorstore enrichment
- Add clarification logic to extraction phase
- Update response generation to include validation feedback

### Phase 3: Summary and Modification
- Enhance summary state to display collected data
- Add modification detection and field update logic
- Implement confirmation detection

### Phase 4: Calculation Integration
- Map FormState to calculate_net_salary tool parameters
- Add calculation trigger in summary state
- Format and display results

### Phase 5: Polish and Optimization
- Add progress tracking throughout flow
- Optimize LLM calls (consider combined extraction+response)
- Add caching for frequent vectorstore queries
- Comprehensive testing of edge cases
