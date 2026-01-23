# Codebase Concerns

**Analysis Date:** 2026-01-23

## Tech Debt

**Excessive Type Safety Bypasses in GeminiAgent:**
- Issue: Heavy use of `as any` and `eslint-disable` comments to work around SDK incompatibilities
- Files: `apps/api/utils/agent/GeminiAgent.ts` (lines 33-85)
- Impact: Reduces type safety, increases risk of runtime errors when SDK APIs change. Message history parsing is brittle due to handling multiple SDK response formats
- Fix approach: Define proper TypeScript interfaces for expected message/response shapes. Create an adapter layer to normalize different SDK versions instead of defensive type casts

**Incomplete Tax Calculation Logic in TaxWrapper:**
- Issue: Multiple "Simplification" comments and unresolved BMF parameter mappings, particularly for church tax rates, Sachsen-Anhalt special handling, and PVA child discount logic
- Files: `apps/api/utils/tax/TaxWrapper.ts` (lines 60-170, 221-274)
- Impact: Tax calculations may be inaccurate for edge cases (8% church tax in Bayern/BW, Sachsen pension rates, multiple children discounts). Results could be incorrect for 10-15% of users
- Fix approach: Complete BMF specification mapping. Add comprehensive unit tests with known reference tax calculations from official BMF tables for all regions and scenarios

**Unverified Salary Estimation Hardcoding:**
- Issue: `estimateYearlySalary()` in chat route uses hardcoded 2025/2026 salary tables that may be outdated or incorrect
- Files: `apps/api/app/api/chat/route.ts` (lines 677-755)
- Impact: Displayed salary figures in chat and calculations may not match actual TVöD/TV-L/AVR tariffs. Users may make employment decisions based on incorrect numbers
- Fix approach: Replace hardcoded tables with external tariff data source (BMF/public sector tariff API). Add monthly update mechanism and version tracking

## Known Bugs

**Silent Gemini API Failures in Chat Endpoint:**
- Symptoms: Request logs inserted without awaiting (.then() instead of await), making failures invisible
- Files: `apps/api/app/api/chat/route.ts` (line 66-69)
- Trigger: Any rate-limiting or API logging failure causes orphaned promises without error tracking
- Workaround: Manually query request_logs table to verify entries; monitor Vercel logs for unhandled promise rejections
- Fix approach: Await database inserts, wrap in try-catch, handle failures gracefully instead of fire-and-forget

**JSON Extraction Vulnerability in Modification Handler:**
- Symptoms: Response from Gemini wrapped with markdown codeblocks is parsed without proper error handling
- Files: `apps/api/app/api/chat/route.ts` (line 408)
- Trigger: If Gemini returns malformed JSON or non-JSON text, `.parse()` throws synchronously
- Workaround: None; would crash request
- Fix approach: Validate JSON response before parsing; provide fallback prompt if parsing fails

**Incomplete Vector Search Fallback:**
- Symptoms: When document matching fails, generic response is returned without context
- Files: `apps/api/lib/vectorstore/VectorstoreService.ts` (line 179)
- Trigger: RPC `match_documents` query returns no results or errors
- Workaround: Users must rephrase questions to match document content
- Fix approach: Implement fallback RAG with broader matching threshold or alternative search strategy

## Security Considerations

**Exposed Secrets in .env.local (Committed to Git):**
- Risk: `SUPABASE_SERVICE_ROLE_KEY` and `VERCEL_TOKEN` are visible in plaintext in repository `.env` file
- Files: Root `.env.local` file
- Current mitigation: Keys appear to be rotation candidates based on naming, but direct exposure is critical
- Recommendations: Immediately rotate keys. Add `.env.local` to `.gitignore`. Use Vercel/Supabase environment variable management only. Implement pre-commit hook to block secret commits

**Supabase Credentials in Client Code:**
- Risk: `NEXT_PUBLIC_SUPABASE_ANON_KEY` is intentionally public but combined with Row-Level Security (RLS), which provides insufficient isolation
- Files: `apps/api/utils/supabase/client.ts`, `apps/web` widget
- Current mitigation: RLS policies on tables, but relying entirely on database-level protection
- Recommendations: Implement API key per-project in `projects` table with rate limiting by key (already partially done). Rotate keys monthly. Add IP whitelisting for web widget origins (partially implemented)

**Weak Origin Validation in Chat Endpoint:**
- Risk: Origin header can be spoofed; whitelisting check doesn't account for null/missing origin
- Files: `apps/api/app/api/chat/route.ts` (lines 89-96)
- Current mitigation: Checks allowedOrigins list if present, but skips check if origin is null
- Recommendations: Require origin validation for all non-DEMO projects. Use stricter CORS header comparison. Consider implementing signed request tokens instead of URL origin alone

**Admin Routes Lack Explicit Auth Verification:**
- Risk: Protected routes under `(admin)` directory rely on Next.js middleware, but no explicit auth check in route handlers
- Files: `apps/api/app/(admin)/*` pages
- Current mitigation: Middleware configuration assumed but not visible in provided files
- Recommendations: Add explicit `authRequired()` guard at start of protected server actions. Implement request signing with HMAC for API calls from admin dashboard

## Performance Bottlenecks

**Chat Endpoint Performs Three Sequential LLM Calls:**
- Problem: In modification flow, multiple Gemini calls happen sequentially (extract → validate → regenerate summary)
- Files: `apps/api/app/api/chat/route.ts` (lines 379-470)
- Cause: Intent detection, extraction, and response generation each invoke the model separately instead of combining prompts
- Improvement path: Batch prompts where possible. Use streaming responses for real-time feedback. Cache validation rules to avoid redundant LLM calls

**VectorstoreService In-Memory Cache Can Grow Unbounded:**
- Problem: Cache entries with 24-hour TTL are only cleaned up when size exceeds 100, causing memory leak on high-traffic instances
- Files: `apps/api/lib/vectorstore/VectorstoreService.ts` (lines 195-200)
- Cause: Simple size limit without TTL-based cleanup or LRU eviction
- Improvement path: Implement proper cache eviction with periodic cleanup. Consider Redis for distributed caching across Vercel serverless instances (currently won't work in edge functions)

**Text Extraction from Documents Uses Inefficient Chunking:**
- Problem: Recursive splitting logic is O(n²) in worst case due to segment re-checking
- Files: `apps/api/lib/vectorstore/VectorstoreService.ts` (lines 35-114)
- Cause: Algorithm recalculates overlaps and segment boundaries multiple times
- Improvement path: Use proven chunk-with-overlap library (LangChain, Llama Index). Profile with large PDFs (>10MB)

## Fragile Areas

**State Machine in Chat Route is Mixed Concern:**
- Files: `apps/api/app/api/chat/route.ts` (880 lines)
- Why fragile: Single file handles routing, state machine logic, intent analysis, validation, and database operations. No separation of concerns. Tests would be integration-only
- Safe modification: Extract state machine to pure function without side effects. Create separate service layer for database operations. Break into smaller route handlers per state
- Test coverage: None visible; entire flow relies on manual testing and production feedback

**TaxWrapper Depends on Undocumented BMF Specification:**
- Files: `apps/api/utils/tax/TaxWrapper.ts`, `Lohnsteuer2025.ts`, `Lohnsteuer2026.ts`
- Why fragile: Heavy reliance on implicit knowledge of BMF XML schemas and calculation rules. Comments show uncertainty ("Wait, BMF logic...?" "Simplification...?"). No specification document or test cases reference official BMF values
- Safe modification: Add comprehensive BMF reference documentation as comments. Create test cases using official BMF calculator outputs. Version tax logic by year with detailed changelogs
- Test coverage: No unit tests for tax calculations visible. Critical for compliance

**Form State Mutation Through Deep Clone:**
- Files: `apps/api/app/api/chat/route.ts` (line 136), `apps/api/lib/salary-flow.ts` (line 205)
- Why fragile: Form state is mutated after JSON.parse(JSON.stringify(...)) cloning. No type safety on mutations. Validation errors field is ad-hoc Record<string, string>
- Safe modification: Use immutable state management (Immer). Define strict FormState mutators. Add schema validation with Zod
- Test coverage: No tests for state transitions visible

**ResponseValidator LLM Validation Has Silent Failures:**
- Files: `apps/api/utils/agent/ResponseValidator.ts`
- Why fragile: LLM validation result extraction not visible (file truncated at line 100). Previous pattern shows defensive type casts. If LLM returns unexpected format, validation would silently pass or fail
- Safe modification: Define response schema with JSON mode. Add assertions for expected return structure
- Test coverage: None visible

## Scaling Limits

**Supabase RPC for Vector Search Not Optimized:**
- Current capacity: `match_documents` RPC likely does brute-force similarity search, O(n) per query
- Limit: With >1000 documents, query times exceed 1 second. At 100 concurrent users, Supabase connection limits (5 per free tier) would be exhausted
- Scaling path: Migrate to dedicated vector database (Pinecone, Weaviate) or use Supabase pgvector with proper HNSW indexing. Cache embedding model responses

**Request Logging to Supabase for Rate Limiting:**
- Current capacity: Logging every request to database works for <100 req/min
- Limit: Database writes become bottleneck. Rate limit check does COUNT query per request = N+1 problem
- Scaling path: Use in-memory rate limiter (Redis) with Vercel middleware. Only log to database asynchronously. Consider API Gateway rate limiting instead

**Single Gemini Client Instance:**
- Current capacity: `getGeminiClient()` creates single reusable instance
- Limit: If client has connection pooling limits, concurrent requests may queue. No retry logic or circuit breaker
- Scaling path: Implement client pool with connection management. Add exponential backoff for Gemini API rate limiting (429 responses). Consider fallback to Claude or other models

**File Storage Via Supabase Storage:**
- Current capacity: Widget file and documents served from Supabase storage, not CDN
- Limit: Large PDF downloads (>50MB) may timeout. No compression. Storage egress costs scale linearly with users
- Scaling path: Integrate with Cloud Storage CDN (Cloudflare R2, AWS CloudFront). Compress PDFs on upload. Implement lazy loading for document preview

## Dependencies at Risk

**Google GenAI SDK Version Unstable:**
- Risk: SDK is relatively new with breaking changes between versions (as evidenced by multiple `any` type casts to handle format variations)
- Impact: Major version bumps could break entire chat functionality. No lock to specific version in package.json visible
- Migration plan: Pin SDK to specific version. Monitor upstream changes. Create wrapper interfaces to isolate SDK from business logic. Have fallback LLM provider ready (e.g., OpenAI)

**Supabase JS Client Major Version Approach:**
- Risk: Using `^2.87.1` allows breaking changes on 3.x release
- Impact: RLS policies might change. Function signatures might shift
- Migration plan: Lock to 2.x until 3.x stability proven. Test database migrations before upgrading

## Missing Critical Features

**No Audit Logging for Salary Calculations:**
- Problem: `salary_inquiries` table records final result but not the conversation history, intent analysis, or validation steps
- Blocks: Inability to debug user complaints about incorrect calculations. No regulatory compliance trail
- Recommendation: Save full conversation context and calculation breakdown to database. Implement user-facing calculation explanation

**No Error Recovery or Rollback for Failed Calculations:**
- Problem: If calculation fails at line 358, state moves to completed but netto/brutto might be 0 or NaN
- Blocks: Users can't rerun calculation or go back to modify inputs
- Recommendation: Add explicit error state to FormState. Implement "go back" button in completed state

**No Export/Share Functionality:**
- Problem: Calculation results only visible in chat
- Blocks: Users can't download PDF or email results. No way to share with employers/accountants
- Recommendation: Add PDF export with official formatting. Implement share links with read-only access

**No Offline Support for Embedded Widget:**
- Problem: Widget requires network connection for every message
- Blocks: Use cases where users have intermittent connectivity (e.g., rural areas)
- Recommendation: Implement service worker for widget. Cache conversations locally with sync-on-reconnect

## Test Coverage Gaps

**No Unit Tests for State Machine Logic:**
- What's not tested: All transitions in salary-flow.ts, progress calculation, field label mapping
- Files: `apps/api/lib/salary-flow.ts` (305 lines, zero test files)
- Risk: State machine could enter invalid states undetected. Progress calculation might display incorrect percentages. This is core logic
- Priority: High

**No Integration Tests for Tax Calculation:**
- What's not tested: End-to-end tax calculation against real BMF tables. Church tax rate variations. Regional differences (Sachsen vs. West)
- Files: `apps/api/utils/tax/` (entire folder)
- Risk: Tax calculations could be off by 5-10% for certain regions without anyone noticing
- Priority: High

**No Tests for Chat Endpoint Edge Cases:**
- What's not tested: Malformed JSON responses from Gemini, network timeouts, missing environment variables, rate limit exceeded, database connection failures
- Files: `apps/api/app/api/chat/route.ts` (880 lines, zero test files)
- Risk: Production errors would be discovered by users
- Priority: High

**No Tests for Document Upload and Embedding:**
- What's not tested: Large file handling, unsupported MIME types, vector storage failure, duplicate document handling
- Files: `apps/api/app/actions/documents.ts` (needs visibility)
- Risk: Silent failures when uploading documents could result in RAG being unavailable
- Priority: Medium

**No Tests for Widget Embedding and CORS:**
- What's not tested: Widget loading in different domains, origin validation logic, embedding script injection
- Files: `apps/web/widget.tsx`
- Risk: Widget might not load for legitimate origins or could be embedded on malicious sites
- Priority: Medium

**No Snapshot or Regression Tests for UI:**
- What's not tested: ChatBot component rendering, form states, error message display, progress indicator accuracy
- Files: `apps/web/App.tsx`, `apps/web/components/`
- Risk: UI changes could break accessibility or visual consistency without detection
- Priority: Low

---

*Concerns audit: 2026-01-23*
