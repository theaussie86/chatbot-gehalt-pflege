import { createClient } from "jsr:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters";

// --- Configuration ---
const GEMINI_MODEL_EXTRACT = "gemini-2.5-flash";
const GEMINI_MODEL_EMBED = "text-embedding-004";

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
  let uploadedFile: { file: { name: string; uri: string; mimeType: string } } | null = null;
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

    // 3. Upload to Gemini for Extraction
    currentStage = 'uploading_gemini';
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

    // Convert Blob to ArrayBuffer then to base64 or upload directly via Files API
    // The Google GenAI NodeJS SDK supports File/Blob in some envs, but in Deno we might need to be careful.
    // The previous code used `client.files.upload`. Let's use the same.

    // Note: client.files.upload expects a `Blob` or `File`.
    // In Deno, `fileBlob` is a Blob.
    // EDGE-01: Use fileBlob.type (not .mime_type) with fallback to document.mime_type
    const mimeType = fileBlob.type || document.mime_type;
    uploadedFile = await genAI.files.upload({
      file: new File([fileBlob], document.filename, { type: mimeType }),
      config: {
        mimeType: mimeType,
        displayName: document.filename,
      },
    });

    console.log(`Uploaded to Gemini: ${uploadedFile.file.uri}`);

    // 4. Extract Text
    currentStage = 'extracting_text';
    await supabase
      .from("documents")
      .update({ processing_stage: "extracting text" })
      .eq("id", document.id);

    const extractResult = await genAI.models.generateContent({
      model: GEMINI_MODEL_EXTRACT,
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: uploadedFile.file.mimeType,
                fileUri: uploadedFile.file.uri,
              },
            },
            {
              text: "Extract all the text from this document. Return only the text content. Do not include any markdown formatting or introductory text, just the raw content.",
            },
          ],
        },
      ],
    });

    const textContent = extractResult.text || "";
    console.log(`Extracted text length: ${textContent.length}`);

    if (!textContent) {
      throw new Error("No text extracted from document");
    }

    // 5. Chunk Text
    currentStage = 'chunking';
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(textContent);
    console.log(`Generated ${chunks.length} chunks`);

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
        await supabase
          .from("documents")
          .update({
            status: "error",
            error_details: {
              code: "PROCESSING_ERROR",
              message: error instanceof Error ? error.message : String(error),
              timestamp: new Date().toISOString(),
              stage: currentStage
            }
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
    if (uploadedFile?.file?.name) {
      const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
      if (geminiApiKey) {
        try {
          const genAI = new GoogleGenAI({ apiKey: geminiApiKey });
          await genAI.files.delete({ name: uploadedFile.file.name });
          console.log(`Cleaned up Gemini file: ${uploadedFile.file.name}`);
        } catch (cleanupError) {
          // Log but don't throw - cleanup failure shouldn't mask original error
          console.warn(`Failed to cleanup Gemini file ${uploadedFile.file.name}:`, cleanupError);
        }
      }
    }
  }
});
