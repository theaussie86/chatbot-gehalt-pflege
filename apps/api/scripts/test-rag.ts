#!/usr/bin/env npx tsx
/**
 * RAG (Retrieval-Augmented Generation) Test CLI
 *
 * Test vectorstore queries directly without the state machine.
 *
 * Usage:
 *   npx tsx scripts/test-rag.ts "your question here" [projectId]
 *
 * Examples:
 *   npx tsx scripts/test-rag.ts "Was ist TVöD P7?"
 *   npx tsx scripts/test-rag.ts "Wie viel verdient man in Stufe 3?" abc123
 */

import { config } from 'dotenv';
import { resolve } from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../.env.local') });

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printGlobalResults(results: any[], duration: number, colors: any, includeMeta: boolean) {
  console.log(`${colors.blue}━━━ Results (${results.length}) ━━━${colors.reset} ${colors.dim}${duration}ms${colors.reset}\n`);

  if (results.length === 0) {
    console.log(`${colors.yellow}No matching documents found${colors.reset}`);
    return;
  }

  results.forEach((r: any, i: number) => {
    const filename = r.filename || 'unknown';
    const projectName = r.project_name || 'unknown';
    console.log(`${colors.green}[${i + 1}]${colors.reset} ${colors.bold}${filename}${colors.reset} ${colors.dim}(${projectName})${colors.reset}`);
    console.log(`    ${colors.cyan}Similarity:${colors.reset} ${(r.similarity * 100).toFixed(1)}%`);
    if (includeMeta) {
      console.log(`    ${colors.cyan}Chunk:${colors.reset} ${r.chunk_index || 0}`);
      console.log(`    ${colors.cyan}Doc ID:${colors.reset} ${r.document_id}`);
    }
    console.log(`    ${colors.cyan}Content:${colors.reset}`);
    console.log(`    ${colors.dim}${r.content.substring(0, 300)}${r.content.length > 300 ? '...' : ''}${colors.reset}\n`);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function printResults(results: any[], duration: number, colors: any, includeMeta: boolean) {
  console.log(`${colors.blue}━━━ Results (${results.length}) ━━━${colors.reset} ${colors.dim}${duration}ms${colors.reset}\n`);

  if (results.length === 0) {
    console.log(`${colors.yellow}No matching documents found${colors.reset}`);
    return;
  }

  results.forEach((r: any, i: number) => {
    const doc = r.documents as any;
    const filename = doc?.filename || 'unknown';
    const projectName = doc?.projects?.name || 'unknown';
    console.log(`${colors.green}[${i + 1}]${colors.reset} ${colors.bold}${filename}${colors.reset} ${colors.dim}(${projectName})${colors.reset}`);
    console.log(`    ${colors.cyan}Similarity:${colors.reset} ${(r.similarity * 100).toFixed(1)}%`);
    if (includeMeta) {
      console.log(`    ${colors.cyan}Chunk:${colors.reset} ${r.chunk_index || 0}`);
    }
    console.log(`    ${colors.cyan}Content:${colors.reset}`);
    console.log(`    ${colors.dim}${r.content.substring(0, 300)}${r.content.length > 300 ? '...' : ''}${colors.reset}\n`);
  });
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
${colors.bold}RAG Test CLI${colors.reset}

${colors.cyan}Usage:${colors.reset}
  npx tsx scripts/test-rag.ts <question> [projectId] [--top=N] [--threshold=N]

${colors.cyan}Options:${colors.reset}
  --top=N        Number of results (default: 3)
  --threshold=N  Similarity threshold 0-1 (default: 0.5)
  --meta         Include metadata in output
  --global       Search ALL documents across all projects

${colors.cyan}Examples:${colors.reset}
  npx tsx scripts/test-rag.ts "Was ist TVöD P7?"
  npx tsx scripts/test-rag.ts "Gehalt Stufe 3" --top=5
  npx tsx scripts/test-rag.ts "Kirchensteuer" --global --meta
`);
    process.exit(0);
  }

  // Parse arguments
  const question = args.find(a => !a.startsWith('--')) || '';
  const projectIdArg = args.find((a, i) => i > 0 && !a.startsWith('--'));
  const topK = parseInt(args.find(a => a.startsWith('--top='))?.split('=')[1] || '3');
  const threshold = parseFloat(args.find(a => a.startsWith('--threshold='))?.split('=')[1] || '0.5');
  const includeMeta = args.includes('--meta');
  const globalSearch = args.includes('--global');

  // Check env
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error(`${colors.red}✗ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY${colors.reset}`);
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey);

  const { VectorstoreService } = await import('../lib/vectorstore/VectorstoreService');
  const vectorstore = new VectorstoreService(supabaseUrl, supabaseKey);

  // Global search mode - search ALL documents
  if (globalSearch) {
    // Count all documents
    const { count: totalDocs } = await supabase
      .from('documents')
      .select('*', { count: 'exact', head: true });

    const { count: totalChunks } = await supabase
      .from('document_chunks')
      .select('*', { count: 'exact', head: true });

    console.log(`${colors.blue}━━━ RAG Query (GLOBAL) ━━━${colors.reset}`);
    console.log(`${colors.dim}Question:${colors.reset}  ${question}`);
    console.log(`${colors.dim}Documents:${colors.reset} ${totalDocs || 0} (${totalChunks || 0} chunks)`);
    console.log(`${colors.dim}Top K:${colors.reset}     ${topK}`);
    console.log(`${colors.dim}Threshold:${colors.reset} ${threshold}\n`);

    if (!totalChunks || totalChunks === 0) {
      console.log(`${colors.yellow}⚠ No document chunks found. Upload and process documents first.${colors.reset}`);
      process.exit(0);
    }

    const start = Date.now();

    try {
      // Generate embedding for the question
      const embedding = await vectorstore.generateEmbedding(question);

      // Query ALL chunks without project filter
      const { data: results, error } = await supabase.rpc('match_documents_global', {
        query_embedding: embedding,
        match_threshold: threshold,
        match_count: topK
      });

      // If the global function doesn't exist, fall back to direct query
      if (error && error.message.includes('function match_documents_global')) {
        console.log(`${colors.yellow}Creating global search function...${colors.reset}\n`);

        // Direct SQL query as fallback
        const { data: directResults, error: directError } = await supabase
          .from('document_chunks')
          .select(`
            id,
            content,
            chunk_index,
            document_id,
            documents!inner(filename, project_id, projects(name))
          `)
          .limit(topK * 10); // Get more, we'll filter by similarity

        if (directError) throw directError;

        // Calculate similarities manually (inefficient but works without RPC)
        const scoredResults = [];
        for (const chunk of directResults || []) {
          const chunkEmbedding = await supabase
            .from('document_chunks')
            .select('embedding')
            .eq('id', chunk.id)
            .single();

          if (chunkEmbedding.data?.embedding) {
            const similarity = cosineSimilarity(embedding, chunkEmbedding.data.embedding);
            if (similarity >= threshold) {
              scoredResults.push({ ...chunk, similarity });
            }
          }
        }

        scoredResults.sort((a, b) => b.similarity - a.similarity);
        const topResults = scoredResults.slice(0, topK);

        const duration = Date.now() - start;
        printResults(topResults, duration, colors, includeMeta);
      } else if (error) {
        throw error;
      } else {
        const duration = Date.now() - start;
        printGlobalResults(results || [], duration, colors, includeMeta);
      }
    } catch (error) {
      console.error(`${colors.red}✗ Query failed:${colors.reset}`, error);
      process.exit(1);
    }

    return;
  }

  // Project-specific search mode
  const DEFAULT_PROJECT_ID = '122dbfc7-5456-4da6-b4ac-d2909b4f2b94';
  const projectId = projectIdArg || DEFAULT_PROJECT_ID;

  const { data: project } = await supabase
    .from('projects')
    .select('id, name')
    .eq('id', projectId)
    .single();

  if (!project) {
    console.error(`${colors.red}✗ Project not found: ${projectId}${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.dim}Using project: ${project.name}${colors.reset}\n`);

  const { count } = await supabase
    .from('documents')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId);

  console.log(`${colors.blue}━━━ RAG Query ━━━${colors.reset}`);
  console.log(`${colors.dim}Question:${colors.reset}  ${question}`);
  console.log(`${colors.dim}Project:${colors.reset}   ${projectId}`);
  console.log(`${colors.dim}Documents:${colors.reset} ${count || 0}`);
  console.log(`${colors.dim}Top K:${colors.reset}     ${topK}`);
  console.log(`${colors.dim}Threshold:${colors.reset} ${threshold}\n`);

  if (!count || count === 0) {
    console.log(`${colors.yellow}⚠ No documents in this project. Try --global to search all projects.${colors.reset}`);
    process.exit(0);
  }

  const start = Date.now();

  try {
    if (includeMeta) {
      const results = await vectorstore.queryWithMetadata(question, projectId, topK);
      const duration = Date.now() - start;

      console.log(`${colors.blue}━━━ Results (${results.length}) ━━━${colors.reset} ${colors.dim}${duration}ms${colors.reset}\n`);

      if (results.length === 0) {
        console.log(`${colors.yellow}No matching documents found (threshold: ${threshold})${colors.reset}`);
      } else {
        results.forEach((r, i) => {
          console.log(`${colors.green}[${i + 1}]${colors.reset} ${colors.bold}${r.metadata.filename}${colors.reset} ${colors.dim}(chunk ${r.metadata.chunkIndex})${colors.reset}`);
          console.log(`    ${colors.cyan}Similarity:${colors.reset} ${(r.similarity * 100).toFixed(1)}%`);
          console.log(`    ${colors.cyan}Content:${colors.reset}`);
          console.log(`    ${colors.dim}${r.content.substring(0, 300)}${r.content.length > 300 ? '...' : ''}${colors.reset}\n`);
        });
      }
    } else {
      const result = await vectorstore.query(question, projectId, topK);
      const duration = Date.now() - start;

      console.log(`${colors.blue}━━━ Result ━━━${colors.reset} ${colors.dim}${duration}ms${colors.reset}\n`);
      console.log(result);
    }
  } catch (error) {
    console.error(`${colors.red}✗ Query failed:${colors.reset}`, error);
    process.exit(1);
  }
}

main();
