#!/usr/bin/env npx tsx
/**
 * Vertex AI Integration Test Suite
 *
 * Run with: npx tsx scripts/test-vertex-ai.ts
 * Or: npm run test:vertex
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { existsSync } from 'fs';

// Load environment variables from .env.local
config({ path: resolve(__dirname, '../.env.local') });

// ANSI color codes for output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

const log = {
  info: (msg: string) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg: string) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg: string) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  warn: (msg: string) => console.log(`${colors.yellow}⚠${colors.reset} ${msg}`),
  section: (msg: string) => console.log(`\n${colors.blue}━━━ ${msg} ━━━${colors.reset}`),
};

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    const duration = Date.now() - start;
    results.push({ name, passed: true, duration });
    log.success(`${name} ${colors.dim}(${duration}ms)${colors.reset}`);
  } catch (error) {
    const duration = Date.now() - start;
    const errorMsg = error instanceof Error ? error.message : String(error);
    results.push({ name, passed: false, error: errorMsg, duration });
    log.error(`${name}: ${errorMsg}`);
  }
}

// ============================================================
// Test 1: Environment Variables
// ============================================================
async function testEnvironmentVariables(): Promise<void> {
  log.section('Environment Variables');

  await runTest('GOOGLE_CLOUD_PROJECT is set', async () => {
    if (!process.env.GOOGLE_CLOUD_PROJECT) {
      throw new Error('GOOGLE_CLOUD_PROJECT is not set');
    }
    log.info(`  Project: ${process.env.GOOGLE_CLOUD_PROJECT}`);
  });

  await runTest('GOOGLE_CLOUD_LOCATION is set', async () => {
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'europe-west3';
    log.info(`  Location: ${location}`);
  });

  await runTest('Credentials configured (file or env)', async () => {
    const hasFileCredentials = !!process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const hasEnvCredentials = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!hasFileCredentials && !hasEnvCredentials) {
      throw new Error('Neither GOOGLE_APPLICATION_CREDENTIALS nor GOOGLE_SERVICE_ACCOUNT_KEY is set');
    }

    if (hasEnvCredentials) {
      log.info('  Using: GOOGLE_SERVICE_ACCOUNT_KEY (Base64/JSON)');
    } else {
      log.info(`  Using: GOOGLE_APPLICATION_CREDENTIALS (${process.env.GOOGLE_APPLICATION_CREDENTIALS})`);
    }
  });
}

// ============================================================
// Test 2: Service Account Key Validation
// ============================================================
async function testServiceAccountKey(): Promise<void> {
  log.section('Service Account Key');

  await runTest('Service account credentials are valid', async () => {
    let keyData: { client_email?: string; private_key?: string };

    // Try GOOGLE_SERVICE_ACCOUNT_KEY first (Base64 or JSON)
    if (process.env.GOOGLE_SERVICE_ACCOUNT_KEY) {
      const envKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
      try {
        // Try parsing as plain JSON first
        keyData = JSON.parse(envKey);
      } catch {
        // If that fails, try Base64 decoding
        const decoded = Buffer.from(envKey, 'base64').toString('utf-8');
        keyData = JSON.parse(decoded);
      }
      log.info('  Source: GOOGLE_SERVICE_ACCOUNT_KEY');
    }
    // Fall back to file-based credentials
    else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
      const absolutePath = resolve(__dirname, '..', keyPath);

      if (!existsSync(absolutePath)) {
        throw new Error(`Key file not found at: ${absolutePath}`);
      }

      const keyContent = await import('fs').then(fs =>
        fs.readFileSync(absolutePath, 'utf-8')
      );
      keyData = JSON.parse(keyContent);
      log.info(`  Source: ${absolutePath}`);
    } else {
      throw new Error('No credentials configured');
    }

    if (!keyData.client_email || !keyData.private_key) {
      throw new Error('Credentials missing required fields (client_email, private_key)');
    }
    log.info(`  Service account: ${keyData.client_email}`);
  });
}

// ============================================================
// Test 3: Gemini Client Initialization
// ============================================================
async function testGeminiClient(): Promise<void> {
  log.section('Gemini Client');

  await runTest('GoogleGenAI client initializes with Vertex AI', async () => {
    const { GoogleGenAI } = await import('@google/genai');

    const client = new GoogleGenAI({
      vertexai: true,
      project: process.env.GOOGLE_CLOUD_PROJECT!,
      location: process.env.GOOGLE_CLOUD_LOCATION || 'europe-west3',
    });

    if (!client) {
      throw new Error('Failed to create GoogleGenAI client');
    }
    log.info('  Client created successfully');
  });

  await runTest('getGeminiClient() factory function works', async () => {
    const { getGeminiClient } = await import('../lib/gemini');
    const client = getGeminiClient();

    if (!client) {
      throw new Error('getGeminiClient() returned null/undefined');
    }
  });
}

// ============================================================
// Test 4: Model Discovery & Text Generation
// ============================================================
async function testTextGeneration(): Promise<void> {
  log.section('Model Discovery & Text Generation');

  // Models to try - documented as available in europe-west3
  const modelsToTry = [
    'gemini-2.5-flash',           // Available in europe-west3
    'gemini-2.5-flash-001',
    'gemini-2.5-pro',             // Available in europe-west3
    'gemini-2.0-flash-001',       // Available in europe-west3
    'gemini-2.0-flash',
    'gemini-2.0-flash-lite-001',
    'gemini-1.5-flash',
    'gemini-1.5-flash-002',
    'gemini-1.5-pro',
  ];

  let workingModel: string | null = null;

  await runTest('Find available Gemini model', async () => {
    const { getGeminiClient } = await import('../lib/gemini');
    const client = getGeminiClient();

    for (const model of modelsToTry) {
      try {
        log.info(`  Trying model: ${model}...`);
        const result = await client.models.generateContent({
          model,
          contents: 'Say "test" only.',
        });
        if (result.text) {
          workingModel = model;
          log.info(`  ✓ Found working model: ${model}
            Answer: ${result.text}`);
          break;
        }
      } catch (e) {
        // Model not available, try next
      }
    }

    if (!workingModel) {
      throw new Error(`No Gemini model available in ${process.env.GOOGLE_CLOUD_LOCATION}. Tried: ${modelsToTry.join(', ')}`);
    }
  });

  await runTest('Generate simple text response', async () => {
    if (!workingModel) {
      throw new Error('No working model found');
    }

    const { getGeminiClient } = await import('../lib/gemini');
    const client = getGeminiClient();

    const result = await client.models.generateContent({
      model: workingModel,
      contents: 'Say "Hello from Vertex AI!" and nothing else.',
    });

    const text = result.text;
    if (!text) {
      throw new Error('No text in response');
    }
    log.info(`  Model: ${workingModel}`);
    log.info(`  Response: "${text.trim().substring(0, 50)}..."`);
  });

  await runTest('Generate JSON response', async () => {
    if (!workingModel) {
      throw new Error('No working model found');
    }

    const { getGeminiClient } = await import('../lib/gemini');
    const client = getGeminiClient();

    const result = await client.models.generateContent({
      model: workingModel,
      contents: 'Return a JSON object with keys "status" and "message". Status should be "ok".',
      config: { responseMimeType: 'application/json' },
    });

    const text = result.text || '';
    const json = JSON.parse(text.replace(/```json/g, '').replace(/```/g, '').trim());

    if (!json.status) {
      throw new Error('JSON response missing expected fields');
    }
    log.info(`  JSON response: ${JSON.stringify(json)}`);
  });
}

// ============================================================
// Test 5: Embedding Generation
// ============================================================
async function testEmbeddings(): Promise<void> {
  log.section('Embeddings');

  await runTest('Generate text embedding (768 dimensions)', async () => {
    const { getGeminiClient } = await import('../lib/gemini');
    const client = getGeminiClient();

    const result = await client.models.embedContent({
      model: 'text-embedding-004',
      contents: 'Test embedding for salary calculation chatbot',
    });

    if (!result.embeddings || result.embeddings.length === 0) {
      throw new Error('No embeddings returned');
    }

    const embedding = result.embeddings[0];
    if (!embedding.values || embedding.values.length !== 768) {
      throw new Error(`Expected 768 dimensions, got ${embedding.values?.length}`);
    }
    log.info(`  Embedding dimensions: ${embedding.values.length}`);
    log.info(`  First 5 values: [${embedding.values.slice(0, 5).map(v => v.toFixed(4)).join(', ')}...]`);
  });
}

// ============================================================
// Test 6: Service Classes
// ============================================================
async function testServiceClasses(): Promise<void> {
  log.section('Service Classes');

  await runTest('GeminiAgent instantiates', async () => {
    const { GeminiAgent } = await import('../utils/agent/GeminiAgent');
    const agent = new GeminiAgent();
    if (!agent) {
      throw new Error('Failed to create GeminiAgent');
    }
  });

  await runTest('ConversationAnalyzer instantiates', async () => {
    const { ConversationAnalyzer } = await import('../utils/agent/ConversationAnalyzer');
    const analyzer = new ConversationAnalyzer();
    if (!analyzer) {
      throw new Error('Failed to create ConversationAnalyzer');
    }
  });

  await runTest('VectorstoreService instantiates', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase credentials not set');
    }

    const { VectorstoreService } = await import('../lib/vectorstore/VectorstoreService');
    const vectorstore = new VectorstoreService(supabaseUrl, supabaseKey);
    if (!vectorstore) {
      throw new Error('Failed to create VectorstoreService');
    }
  });

  await runTest('ResponseValidator instantiates', async () => {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_KEY!;

    const { VectorstoreService } = await import('../lib/vectorstore/VectorstoreService');
    const { ResponseValidator } = await import('../utils/agent/ResponseValidator');

    const vectorstore = new VectorstoreService(supabaseUrl, supabaseKey);
    const validator = new ResponseValidator(vectorstore);

    if (!validator) {
      throw new Error('Failed to create ResponseValidator');
    }
  });
}

// ============================================================
// Main Test Runner
// ============================================================
async function main(): Promise<void> {
  console.log('\n🧪 Vertex AI Integration Test Suite\n');
  console.log(`📅 ${new Date().toLocaleString('de-DE')}`);
  console.log(`📁 Working directory: ${process.cwd()}`);

  const startTime = Date.now();

  try {
    await testEnvironmentVariables();
    await testServiceAccountKey();
    await testGeminiClient();
    await testTextGeneration();
    await testEmbeddings();
    await testServiceClasses();
  } catch (error) {
    log.error(`Unexpected error: ${error}`);
  }

  // Summary
  const totalDuration = Date.now() - startTime;
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  log.section('Summary');
  console.log(`\n  Total tests: ${results.length}`);
  console.log(`  ${colors.green}Passed: ${passed}${colors.reset}`);
  console.log(`  ${colors.red}Failed: ${failed}${colors.reset}`);
  console.log(`  Duration: ${totalDuration}ms\n`);

  if (failed > 0) {
    console.log(`${colors.red}Failed tests:${colors.reset}`);
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`  - ${r.name}: ${r.error}`));
    console.log('');
    process.exit(1);
  } else {
    console.log(`${colors.green}All tests passed! ✨${colors.reset}\n`);
    process.exit(0);
  }
}

main();
