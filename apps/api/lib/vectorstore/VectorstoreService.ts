import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';

export class VectorstoreService {
  private supabase: SupabaseClient;
  private genAI: GoogleGenAI;
  private cache: Map<string, { answer: string; timestamp: number }>;

  constructor(supabaseUrl: string, supabaseKey: string, geminiApiKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.genAI = new GoogleGenAI({ apiKey: geminiApiKey });
    this.cache = new Map();
  }

  /**
   * Split text into chunks for better RAG performance
   * @param text Full text content
   * @param chunkSize Target size of each chunk (default 1000)
   * @returns Array of text chunks
   */
  public splitTextIntoChunks(text: string, chunkSize: number = 1000): string[] {
    const chunks: string[] = [];
    let currentChunk = "";
    
    // Simple splitting by paragraphs first
    const paragraphs = text.split(/\n\s*\n/);
    
    for (const paragraph of paragraphs) {
      if ((currentChunk.length + paragraph.length) > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = "";
      }
      currentChunk += (currentChunk ? "\n\n" : "") + paragraph;
    }
    
    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }
    
    return chunks;
  }

  /**
   * Extract text from a file using Gemini (multimodal capabilities)
   * @param fileUri The URI of the file in Google File API
   * @param mimeType The MIME type of the file
   * @returns Extracted text content
   */
  async extractTextFromFile(fileUri: string, mimeType: string): Promise<string> {
    try {
      // Use Gemini 1.5 Flash for efficient text extraction
      const result = await this.genAI.models.generateContent({
        model: "gemini-1.5-flash",
        contents: [
          {
            parts: [
              {
                fileData: {
                  mimeType: mimeType,
                  fileUri: fileUri
                }
              },
              { text: "Extract all the text from this document. Return only the text content." }
            ]
          }
        ]
      });
      return result.text || "";
    } catch (error) {
      console.error('[VectorstoreService] Text extraction failed:', error);
      throw new Error('Failed to extract text from file');
    }
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
      const answer = results.map((r: any) => r.content).join('\n\n---\n\n');

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
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      // Use Gemini's text-embedding-004 model (768 dimensions)
      const result = await this.genAI.models.embedContent({
        model: 'text-embedding-004',
        contents: text
      });

      if (result.embeddings && result.embeddings.length > 0 && result.embeddings[0].values) {
          return result.embeddings[0].values;
      }
      throw new Error('No embedding returned');

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
