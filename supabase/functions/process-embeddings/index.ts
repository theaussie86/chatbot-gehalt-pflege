import { createClient } from "jsr:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters";

// --- Configuration ---
const GEMINI_MODEL_EXTRACT = "gemini-2.5-flash";
const GEMINI_MODEL_EMBED = "text-embedding-004";

// Supported file types for processing
const SUPPORTED_MIME_TYPES = [
  'application/pdf',
  'text/plain',
  'text/markdown',
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
] as const;

type SupportedMimeType = typeof SUPPORTED_MIME_TYPES[number];

/**
 * Extract embedding values with multiple fallback paths for SDK version compatibility.
 * EDGE-01: Handles both v0.x format (embeddings[0].values) and v1.x format (embedding.values)
 */
function extractEmbeddingValues(embedResult: any): number[] | null {
  // Try multiple response formats (SDK version variations)
  const values =
    embedResult?.embedding?.values ||        // v1.x format (singular)
    embedResult?.embeddings?.[0]?.values ||  // v0.x format (array)
    embedResult?.values ||                    // Direct format
    null;

  // Validate the result
  if (!values || !Array.isArray(values) || values.length === 0) {
    console.error('Invalid embedding response structure:', JSON.stringify(embedResult, null, 2));
    return null;
  }

  // Validate dimension (text-embedding-004 should be 768)
  if (values.length !== 768) {
    console.warn(`Unexpected embedding dimension: ${values.length} (expected 768)`);
  }

  return values;
}

/**
 * Get extraction prompt customized for file type.
 * Spreadsheets get markdown table conversion, other files get standard text extraction.
 */
function getExtractionPrompt(mimeType: string): string {
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel') || mimeType === 'text/csv') {
    return `Extract all content from this spreadsheet.
Convert tables to markdown table format with | separators.
Preserve headers and data structure.
Return only the extracted content, no explanations.`;
  }

  return `Extract all the text from this document.
Return only the text content.
Do not include any markdown formatting or introductory text, just the raw content.`;
}

// --- Types ---
interface DocumentRecord {
  id: string;
  project_id: string | null;
  filename: string;
  mime_type: string;
  storage_path: string;
  status: string;
  google_file_name?: string;
  content?: string;
}

interface WebhookPayload {
  type: "INSERT" | "UPDATE";
  table: string;
  record: DocumentRecord;
  schema: string;
  old_record: null | DocumentRecord;
}

// --- Main Handler ---
Deno.serve(async (req) => {
  // Declare at function scope - BEFORE try block for access in catch/finally
  let documentId: string | null = null;
  let uploadedFile: { name: string; uri: string; mimeType: string } | null = null;
  let currentStage = 'init';

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const payload: WebhookPayload = await req.json();
    documentId = payload.record.id;  // Store immediately for error handling
    const document = payload.record;

    // Only process on specific trigger conditions
    // 1. INSERT with status 'pending'
    // 2. UPDATE where status changed to 'pending' (re-process)
    // Actually, simple trigger usually sends every INSERT. We should check status.
    if (document.status !== "pending") {
      return new Response(JSON.stringify({ message: "Skipping, status not pending" }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`Processing document ${document.id} (${document.filename})`);

    // 1. Update Status to Processing with initial stage
    currentStage = 'downloading';
    await supabase
      .from("documents")
      .update({ status: "processing", processing_stage: "downloading file" })
      .eq("id", document.id);

    // 2. Download from Storage
    currentStage = 'downloading';
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // EDGE-03: Validate MIME type is supported
    // EDGE-01: Use fileBlob.type (not .mime_type) with fallback to document.mime_type
    const mimeType = fileBlob.type || document.mime_type;

    if (!SUPPORTED_MIME_TYPES.includes(mimeType as SupportedMimeType)) {
      throw new Error(
        `Unsupported file type: ${mimeType}. ` +
        `Supported formats: PDF, plain text (.txt, .md), spreadsheets (.csv, .xlsx)`
      );
    }

    // 3. Upload to Gemini for Extraction
    currentStage = 'uploading_gemini';
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
    uploadedFile = await genAI.files.upload({
      file: new File([fileBlob], document.filename, { type: mimeType }),
      config: {
        mimeType: mimeType,
        displayName: document.filename,
      },
    });

    console.log(`Uploaded to Gemini: ${uploadedFile.uri}`);

    // 4. Extract Text
    currentStage = 'extracting_text';
    await supabase
      .from("documents")
      .update({ processing_stage: "extracting text" })
      .eq("id", document.id);

    // EDGE-03: Use file-type specific extraction prompt
    const extractionPrompt = getExtractionPrompt(mimeType);

    const extractResult = await genAI.models.generateContent({
      model: GEMINI_MODEL_EXTRACT,
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: uploadedFile.mimeType,
                fileUri: uploadedFile.uri,
              },
            },
            {
              text: extractionPrompt,
            },
          ],
        },
      ],
    });

    const textContent = extractResult.text || "";
    console.log(`Extracted text length: ${textContent.length}`);

    // EDGE-03: Heuristic to detect image-only PDFs
    // If extracted text is very short relative to file size, it's likely image-only
    const bytesPerChar = fileBlob.size / Math.max(textContent.length, 1);
    if (bytesPerChar > 1000 && textContent.trim().length < 100) {
      throw new Error(
        "This PDF appears to contain only images. " +
        "Text-based PDFs are required for embedding. " +
        "Please upload a PDF with selectable text."
      );
    }

    // Validate we got meaningful content
    if (!textContent || textContent.trim().length < 50) {
      throw new Error(
        "No text extracted from document. " +
        "This may be a scanned PDF containing only images. " +
        "Please upload a text-based PDF."
      );
    }

    // 5. Chunk Text
    currentStage = 'chunking';
    // CONTEXT.md: Target chunk size 1000-3000 chars, ~100 char overlap
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 2000,        // Target middle of 1000-3000 range
      chunkOverlap: 100,      // ~100 char overlap per CONTEXT.md
      separators: [
        "\n\n",   // Paragraph breaks first (semantic)
        "\n",     // Line breaks
        ". ",     // Sentences
        ", ",     // Clauses
        " ",      // Words
        ""        // Characters (last resort)
      ],
    });
    const chunks = await splitter.splitText(textContent);
    console.log(`Generated ${chunks.length} chunks`);

    if (chunks.length === 0) {
      throw new Error("Document produced no chunks after splitting");
    }

    // 6. Generate Embeddings & Insert
    currentStage = 'embedding';
    await supabase
      .from("documents")
      .update({ processing_stage: "embedding chunks" })
      .eq("id", document.id);

    // Delete old chunks first
    await supabase.from("document_chunks").delete().eq("document_id", document.id);

    const chunkDataArray = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (chunkText, batchIndex) => {
            const absoluteIndex = i + batchIndex;
            try {
                console.log(`Embedding chunk ${absoluteIndex + 1}/${chunks.length}`);

                const embedResult = await genAI.models.embedContent({
                    model: GEMINI_MODEL_EMBED,
                    contents: chunkText,
                });

                // Use defensive extraction with multiple fallback paths
                const values = extractEmbeddingValues(embedResult);
                if (!values) {
                    throw new Error(`Failed to extract embedding for chunk ${absoluteIndex + 1}: invalid response structure`);
                }

                return {
                    document_id: document.id,
                    chunk_index: absoluteIndex,
                    content: chunkText,
                    embedding: values,
                    token_count: Math.ceil(chunkText.length / 4) // Rough estimate
                };
            } catch (e) {
                console.error(`Failed to embed chunk ${absoluteIndex + 1}:`, e);
                const error = e as Error & { index?: number };
                error.index = absoluteIndex; // Attach index for error reporting
                throw error;
            }
        });

        // Use Promise.allSettled instead of Promise.all to capture all results
        const batchResults = await Promise.allSettled(batchPromises);

        // Separate successful and failed results
        type ChunkData = {
          document_id: string;
          chunk_index: number;
          content: string;
          embedding: number[];
          token_count: number;
        };
        const successful: ChunkData[] = [];
        const failed: { index: number; error: string }[] = [];

        for (const result of batchResults) {
          if (result.status === 'fulfilled' && result.value !== null) {
            successful.push(result.value);
          } else if (result.status === 'rejected') {
            const reason = result.reason as Error & { index?: number };
            failed.push({
              index: reason?.index ?? -1,
              error: reason?.message ?? 'Unknown error'
            });
          }
        }

        // ALL-OR-NOTHING: If ANY chunk fails, fail the entire document
        if (failed.length > 0) {
          throw new Error(
            `Embedding failed for ${failed.length} of ${batch.length} chunks in batch. ` +
            `First failure: ${failed[0].error}`
          );
        }

        chunkDataArray.push(...successful);
    }

    if (chunkDataArray.length > 0) {
        currentStage = 'inserting';
        await supabase
          .from("documents")
          .update({ processing_stage: "inserting chunks" })
          .eq("id", document.id);

        const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(chunkDataArray);

        if (insertError) throw insertError;
    }

    // 7. Update Status with chunk count (cleanup moved to finally block)
    await supabase
      .from("documents")
      .update({
        status: "embedded",
        chunk_count: chunkDataArray.length,
        processing_stage: null  // Clear processing stage on completion
      })
      .eq("id", document.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing document:", error);

    // EDGE-02: Use pre-stored documentId (request body already consumed)
    if (documentId) {
      try {
        // 1. Fetch current error_details to build history
        const { data: currentDoc } = await supabase
          .from("documents")
          .select("error_details")
          .eq("id", documentId)
          .single();

        // 2. Build error history array
        let errorHistory: any[] = [];
        if (Array.isArray(currentDoc?.error_details)) {
          // Already in array format
          errorHistory = currentDoc.error_details;
        } else if (currentDoc?.error_details && typeof currentDoc.error_details === 'object') {
          // Convert legacy single error to array format
          errorHistory = [{ attempt: 1, ...currentDoc.error_details }];
        }

        // 3. Append new error to history
        const newError = {
          attempt: errorHistory.length + 1,
          code: "PROCESSING_ERROR",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
          stage: currentStage
        };
        errorHistory.push(newError);

        // 4. Update document with error history array
        await supabase
          .from("documents")
          .update({
            status: "error",
            error_details: errorHistory
          })
          .eq("id", documentId);
      } catch (updateError) {
        console.error("Failed to update document status to error:", updateError);
      }
    }

    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  } finally {
    // EDGE-03: Always cleanup Gemini files, even on error
    if (uploadedFile?.name) {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
      if (geminiApiKey) {
        try {
          const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
          await genAI.files.delete({ name: uploadedFile.name });
          console.log(`Cleaned up Gemini file: ${uploadedFile.name}`);
        } catch (cleanupError) {
          // Log but don't throw - cleanup failure shouldn't mask original error
          console.warn(`Failed to cleanup Gemini file ${uploadedFile.name}:`, cleanupError);
        }
      }
    }
  }
});
