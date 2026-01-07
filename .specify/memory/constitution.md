<!--
Sync Impact Report:
Version: 1.0.0 (Initial constitution ratification)
Modified Principles: N/A (new constitution)
Added Sections: All (Core Principles, Data & Privacy Requirements, AI System Requirements, Governance)
Removed Sections: N/A
Templates Status:
  ✅ plan-template.md - reviewed, aligns with constitution checks
  ✅ spec-template.md - reviewed, aligns with user story and requirements structure
  ✅ tasks-template.md - reviewed, aligns with testing discipline and dependency management
  ✅ checklist-template.md - reviewed, generic template compatible
  ✅ agent-file-template.md - reviewed, generic template compatible
Follow-up TODOs: None
-->

# Pflege Gehalt Chatbot Constitution

## Core Principles

### I. User Privacy & Data Protection (NON-NEGOTIABLE)

**Rules**:
- Personal salary data MUST be handled according to GDPR requirements
- User conversations MUST NOT be stored without explicit consent
- All API endpoints handling personal data MUST implement proper authentication and authorization
- Rate limiting and API key management MUST be enforced to prevent abuse
- All database tables MUST implement Row Level Security (RLS) policies

**Rationale**: This application processes sensitive financial and employment data for German healthcare workers. Privacy violations could have serious legal and ethical consequences. GDPR compliance is legally mandatory in the EU.

### II. Calculation Accuracy (NON-NEGOTIABLE)

**Rules**:
- All TVöD-Pflege salary calculations MUST be verified against official tables
- Tax calculations MUST use current German tax law parameters
- Changes to calculation logic MUST include test cases with known-correct results
- When tax/salary rules change, old calculation versions MUST be preserved for historical data
- Any calculation uncertainty MUST be communicated clearly to users

**Rationale**: Users depend on accurate salary information for important financial decisions. Incorrect calculations could mislead healthcare workers about their compensation, damaging trust and potentially causing financial harm.

### III. AI Response Reliability

**Rules**:
- LLM responses for salary calculations MUST be validated against deterministic calculation functions
- AI MUST NOT invent salary data or tax rates
- When the AI cannot determine parameters from conversation, it MUST ask clarifying questions
- Document context injected into AI MUST be versioned and traceable
- AI model changes (e.g., Gemini version updates) MUST trigger regression testing

**Rationale**: While AI provides conversational interface benefits, salary calculations require precision. The AI layer must gracefully handle ambiguity and defer to verified calculation logic rather than hallucinating financial data.

### IV. Monorepo Modularity

**Rules**:
- Frontend (`apps/web`) and backend (`apps/api`) MUST remain independently deployable
- Shared code MUST be extracted to workspace packages, not duplicated
- API contracts between web and API apps MUST be explicitly documented
- Environment variables MUST be prefixed by app (`VITE_` for web, no prefix for API)
- Each workspace MUST declare its own dependencies explicitly

**Rationale**: The monorepo structure enables code sharing while maintaining deployment independence. Clear boundaries prevent tight coupling that would complicate scaling or migrating components.

### V. Incremental Development with Testing

**Rules**:
- New features MUST be broken into independently testable user stories with priorities (P1, P2, P3)
- P1 (highest priority) story MUST represent a viable MVP that delivers standalone value
- Integration tests SHOULD be written for critical paths (salary calculations, API endpoints, auth flows)
- Changes to calculation logic or AI prompts MUST include regression test cases
- Deployment SHOULD follow incremental story completion, not "big bang" releases

**Rationale**: Healthcare and financial applications require high reliability. Incremental delivery with testing reduces risk and enables faster feedback loops from users.

### VI. Observability & Debugging

**Rules**:
- All API endpoints MUST log request/response metadata (excluding sensitive PII)
- Calculation errors MUST be logged with sufficient context for reproduction
- AI interactions MUST log prompt/response pairs (with user consent) to improve model performance
- Database queries causing errors MUST be logged with sanitized parameters
- Production errors MUST be traceable to specific code versions via commit SHAs

**Rationale**: AI-powered applications have non-deterministic behavior that requires detailed logging to debug. Salary miscalculations must be reproducible to fix. Observability enables proactive issue detection.

## Data & Privacy Requirements

### Database & Schema Management

- All schema changes MUST be versioned via migrations
- Migration scripts MUST include both up and down paths
- Row Level Security (RLS) policies MUST be defined for all user-facing tables
- Service role access MUST be restricted to server-side code only (never exposed to frontend)
- Sensitive fields (API keys, personal data) MUST be encrypted at rest where applicable

### API Security

- All API routes MUST validate authentication tokens
- Rate limiting MUST be enforced per API key/origin
- CORS MUST be configured to allow only whitelisted origins
- API keys MUST be scoped to specific projects with origin restrictions
- Environment secrets MUST NEVER be committed to version control

## AI System Requirements

### Gemini Integration

- API keys MUST be stored securely in environment variables or secrets management
- File uploads to Gemini Files API MUST implement size and type validation
- Context injected into AI prompts MUST be reviewed for prompt injection vulnerabilities
- AI responses MUST be sanitized before rendering to prevent XSS
- Model parameters (temperature, max tokens) MUST be documented and version-controlled

### Prompt Engineering

- System prompts for salary calculations MUST be tested with edge cases
- Prompt changes MUST be tracked in version control with rationale
- Prompts MUST include instructions to refuse inappropriate requests (e.g., medical advice)
- Year/date context MUST be dynamically injected to keep calculations current
- Fallback responses MUST be defined for when AI cannot extract required parameters

## Governance

### Amendment Process

- Constitution amendments MUST be proposed with clear rationale
- Breaking changes to principles MUST increment MAJOR version
- New principles or expanded guidance MUST increment MINOR version
- Clarifications and typo fixes MUST increment PATCH version
- All amendments MUST update dependent templates for consistency

### Compliance & Review

- All pull requests MUST verify compliance with applicable principles
- Violations of NON-NEGOTIABLE principles MUST be rejected or justified in writing
- New features introducing complexity MUST justify why simpler alternatives are insufficient
- Annual review of AI model performance and calculation accuracy MUST be conducted
- Data retention policies MUST be reviewed quarterly for GDPR compliance

### Versioning Policy

This constitution follows semantic versioning: MAJOR.MINOR.PATCH
- MAJOR: Backward-incompatible changes (e.g., removing a non-negotiable principle)
- MINOR: New principles added or material expansions
- PATCH: Clarifications, wording improvements, non-semantic fixes

**Version**: 1.0.0 | **Ratified**: 2026-01-07 | **Last Amended**: 2026-01-07
