import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI } from '@google/genai';
import { getGeminiClient } from '../gemini';

export class VectorstoreService {
  private supabase: SupabaseClient;
  private genAI: GoogleGenAI;
  private cache: Map<string, { answer: string; timestamp: number }>;

  constructor(supabaseUrl: string, supabaseKey: string) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
    this.genAI = getGeminiClient();
    this.cache = new Map();
  }

  /**
   * Split text into chunks using recursive character splitting.
   * This method tries to split text by separators in order (e.g. \n\n, \n, space)
   * to keep semantically related text together.
   * 
   * @param text Full text content
   * @param chunkSize Target size of each chunk (default 1000 characters)
   * @param chunkOverlap Number of characters to overlap between chunks (default 200)
   * @returns Array of text chunks
   */
  public splitTextIntoChunks(text: string, chunkSize: number = 1000, chunkOverlap: number = 200): string[] {
    if (!text) return [];
    
    // Default separators for recursive splitting
    const separators = ["\n\n", "\n", " ", ""];
    
    return this._recursiveSplit(text, separators, chunkSize, chunkOverlap);
  }

  private _recursiveSplit(text: string, separators: string[], chunkSize: number, chunkOverlap: number): string[] {
    const finalChunks: string[] = [];
    let separator = separators[separators.length - 1];
    let newSeparators: string[] = [];

    // Find the best separator to use
    for (let i = 0; i < separators.length; i++) {
      const s = separators[i];
      if (s === "" || text.includes(s)) {
        separator = s;
        newSeparators = separators.slice(i + 1);
        break;
      }
    }

    // Split text by the chosen separator
    const splits = separator ? text.split(separator) : [text];
    
    // Merge splits into chunks that fit within chunkSize
    let goodSplits: string[] = [];
    
    // If usage of separator is empty string, we split by characters (last resort)
    // If not, we merge meaningful blocks
    
    let currentDoc: string[] = [];
    let totalLength = 0;
    
    for (const d of splits) {
      const dLength = d.length;
      
      if (totalLength + dLength + (currentDoc.length > 0 ? separator.length : 0) > chunkSize) {
        if (totalLength > 0) {
          // If the current chunk is full, push it
          const doc = currentDoc.join(separator);
          if (doc) finalChunks.push(doc);
          
          // Apply overlap: keep last N characters roughly, or last few segments?
          // For simplicity in this logical implementation without heavy deps,
          // we re-initialize currentDoc with valid overlap is non-trivial strictly by "chars" 
          // while maintaining semantic boundaries of *this* separator level.
          // Standard simpler approach: clear most, keep tail if possible?
          // LangChain does a more complex "merge" logic. 
          
          // Let's implement a simplified "sliding window" of segments
          while (totalLength > chunkOverlap || (totalLength > 0 && !(totalLength < chunkSize))) {
             totalLength -= (currentDoc[0].length + (currentDoc.length > 1 ? separator.length : 0));
             currentDoc.shift();
          }
        }
      }
      
      currentDoc.push(d);
      totalLength += dLength + (currentDoc.length > 1 ? separator.length : 0);
      
      // If a single segment is too big even alone, we must recurse on it
      if (dLength > chunkSize && newSeparators.length > 0) {
         // This specific segment is larger than chunk size, split it further
         // Note: we remove it from currentDoc first if it was just added to avoid duplications or mess
         // Actually, if it's too big, the logic above would have triggered a flush of `currentDoc` (excluding this new one).
         // But `currentDoc` *now* contains it. We should arguably split strictly oversized segments.
         
         // Simplified: If we just added a huge segment, and `currentDoc` has ONLY that segment, 
         // we pop it, recurse, and add results.
         if (currentDoc.length === 1) {
            currentDoc.pop();
            const subChunks = this._recursiveSplit(d, newSeparators, chunkSize, chunkOverlap);
            finalChunks.push(...subChunks);
            totalLength = 0; 
         }
      }
    }
    
    // Add remaining
    if (currentDoc.length > 0) {
       const doc = currentDoc.join(separator);
       if (doc) finalChunks.push(doc);
    }
    
    return finalChunks;
  }

  /**
   * Extract text from a file using Gemini (multimodal capabilities)
   * @param fileUri The URI of the file in Google File API
   * @param mimeType The MIME type of the file
   * @returns Extracted text content
   */
  async extractTextFromFile(fileUri: string, mimeType: string): Promise<string> {
    try {
      // Use Gemini 2.5 Flash for efficient text extraction
      const result = await this.genAI.models.generateContent({
        model: "gemini-2.5-flash",
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
   * Query vectorstore with full metadata for citation attribution
   * @param question The user's question
   * @param projectId The project ID for filtering
   * @param topK Number of top results to return (default: 3)
   * @returns Array of results with content, similarity score, and metadata for citations
   */
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
    }
  }>> {
    try {
      // 1. Generate embedding for question
      const embedding = await this.generateEmbedding(question);

      // 2. Semantic search with metadata join
      const { data: results, error } = await this.supabase.rpc('match_documents_with_metadata', {
        query_embedding: embedding,
        match_threshold: 0.7,
        match_count: topK,
        filter_project_id: projectId
      });

      if (error) {
        console.error('[VectorstoreService] Metadata search error:', error);
        return [];
      }

      if (!results || results.length === 0) {
        return [];
      }

      // 3. Format results with metadata
      return results.map((r: any) => ({
        content: r.content,
        similarity: r.similarity,
        metadata: {
          documentId: r.document_id,
          filename: r.filename,
          chunkIndex: r.chunk_index
        }
      }));

    } catch (error) {
      console.error('[VectorstoreService] Query with metadata failed:', error);
      return [];
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
