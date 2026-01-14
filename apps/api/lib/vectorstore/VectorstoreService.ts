import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from '@google/generative-ai';

export class VectorstoreService {
  private supabase: SupabaseClient;
  private genAI: GoogleGenerativeAI;
  private cache: Map<string, { answer: string; timestamp: number }>;

  constructor(supabaseUrl: string, supabaseKey: string, geminiApiKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.genAI = new GoogleGenerativeAI(geminiApiKey);
    this.cache = new Map();
  }

  /**
   * Query vectorstore for user questions using semantic search
   * @param question The user's question
   * @param projectId The project ID for filtering
   * @param topK Number of top results to return (default: 3)
   * @returns Concatenated relevant content from documents
   */
  async query(question: string, projectId: string, topK = 3): Promise<string> {
    // Check cache first (24-hour TTL for frequently asked questions)
    const cacheKey = `${projectId}:${question}`;
    const cached = this.cache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < 86400000) {
      console.log('[VectorstoreService] Cache hit for question:', question.substring(0, 50));
      return cached.answer;
    }

    try {
      // 1. Generate embedding for question
      const embedding = await this.generateEmbedding(question);

      // 2. Semantic search in vectorstore
      const { data: results, error } = await this.supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: topK,
        filter_project_id: projectId
      });

      if (error) {
        console.error('[VectorstoreService] Search error:', error);
        return "Ich habe dazu keine spezifischen Informationen in meinen Dokumenten.";
      }

      // 3. Combine results into context
      if (!results || results.length === 0) {
        return "Ich habe dazu keine spezifischen Informationen in meinen Dokumenten.";
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const answer = results.map((r: any) => r.content).join('\n\n');

      // Cache the result
      this.cache.set(cacheKey, { answer, timestamp: Date.now() });

      // Clean up old cache entries (simple LRU)
      if (this.cache.size > 100) {
        const oldestKey = this.cache.keys().next().value;
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }

      return answer;

    } catch (error) {
      console.error('[VectorstoreService] Query failed:', error);
      return "Entschuldigung, ich konnte deine Frage momentan nicht beantworten.";
    }
  }

  /**
   * Enrich/validate extracted values using vectorstore context
   * @param field The field name being validated
   * @param rawValue The raw value from user input
   * @param projectId The project ID for filtering
   * @returns Enriched/normalized value or original if no context found
   */
  async enrichValue(field: string, rawValue: string, projectId: string): Promise<string> {
    try {
      const enrichmentQuery = `Normalize and validate: ${field} = "${rawValue}"`;
      const embedding = await this.generateEmbedding(enrichmentQuery);

      const { data: results, error } = await this.supabase.rpc('match_documents', {
        query_embedding: embedding,
        match_threshold: 0.6, // Lower threshold for enrichment
        match_count: 1,
        filter_project_id: projectId
      });

      if (error || !results || results.length === 0) {
        return rawValue; // Return original if no enrichment context found
      }

      // If found relevant context, it can be used by the validator
      // For now, return the original value as enrichment happens in ResponseValidator
      return rawValue;

    } catch (error) {
      console.error('[VectorstoreService] Enrichment failed:', error);
      return rawValue; // Fallback to original value
    }
  }

  /**
   * Generate embedding for text using Gemini's embedding model
   * @param text The text to embed
   * @returns Embedding vector as number array
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use Gemini's text-embedding-004 model (768 dimensions)
      const model = this.genAI.getGenerativeModel({ model: 'text-embedding-004' });

      const result = await model.embedContent(text);
      return result.embedding.values;

    } catch (error) {
      console.error('[VectorstoreService] Embedding generation failed:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  /**
   * Clear the query cache (useful for testing or when documents are updated)
   */
  clearCache(): void {
    this.cache.clear();
    console.log('[VectorstoreService] Cache cleared');
  }

  /**
   * Get cache statistics (useful for monitoring)
   */
  getCacheStats(): { size: number; entries: string[] } {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.keys())
    };
  }
}
