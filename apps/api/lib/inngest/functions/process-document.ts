import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenAI } from "@google/genai";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";

// --- Configuration ---
const GEMINI_MODEL_EXTRACT = "gemini-2.5-flash";
const GEMINI_MODEL_EMBED = "text-embedding-004";

const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;

type SupportedMimeType = (typeof SUPPORTED_MIME_TYPES)[number];

/**
 * Extract embedding values with multiple fallback paths for SDK version compatibility.
 */
function extractEmbeddingValues(embedResult: any): number[] | null {
  const values =
    embedResult?.embedding?.values ||
    embedResult?.embeddings?.[0]?.values ||
    embedResult?.values ||
    null;

  if (!values || !Array.isArray(values) || values.length === 0) {
    console.error(
      "Invalid embedding response structure:",
      JSON.stringify(embedResult, null, 2)
    );
    return null;
  }

  if (values.length !== 768) {
    console.warn(`Unexpected embedding dimension: ${values.length} (expected 768)`);
  }

  return values;
}

/**
 * Get extraction prompt customized for file type.
 */
function getExtractionPrompt(mimeType: string): string {
  if (
    mimeType.includes("spreadsheet") ||
    mimeType.includes("excel") ||
    mimeType === "text/csv"
  ) {
    return `Extract all content from this spreadsheet.
Convert tables to markdown table format with | separators.
Preserve headers and data structure.
Return only the extracted content, no explanations.`;
  }

  return `Extract all the text from this document.
Return only the text content.
Do not include any markdown formatting or introductory text, just the raw content.`;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }
  return createClient(url, key);
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing GEMINI_API_KEY");
  }
  return new GoogleGenAI({ apiKey });
}

export const processDocument = inngest.createFunction(
  {
    id: "process-document",
    retries: 3,
  },
  { event: "document/process" },
  async ({ event, step }) => {
    const { documentId, filename, mimeType, storagePath } = event.data;

    try {
      // Step 1: Download file from Supabase Storage
      const fileBlob = await step.run("download-file", async () => {
        const supabase = getSupabaseClient();

        // Update status to processing
        await supabase
          .from("documents")
          .update({ status: "processing", processing_stage: "downloading file" })
          .eq("id", documentId);

        const { data, error } = await supabase.storage
          .from("project-files")
          .download(storagePath);

        if (error || !data) {
          throw new Error(`Failed to download file: ${error?.message}`);
        }

        // Validate MIME type
        const actualMimeType = data.type || mimeType;
        if (!SUPPORTED_MIME_TYPES.includes(actualMimeType as SupportedMimeType)) {
          throw new Error(
            `Unsupported file type: ${actualMimeType}. ` +
              `Supported formats: PDF, plain text (.txt, .md), spreadsheets (.csv, .xlsx)`
          );
        }

        // Convert blob to base64 for serialization between steps
        const arrayBuffer = await data.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString("base64");

        return {
          base64,
          size: data.size,
          mimeType: actualMimeType,
        };
      });

      // Step 2: Extract text using Gemini
      const textContent = await step.run("extract-text", async () => {
        const supabase = getSupabaseClient();
        const genAI = getGeminiClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "extracting text" })
          .eq("id", documentId);

        // Reconstruct blob from base64
        const buffer = Buffer.from(fileBlob.base64, "base64");
        const blob = new Blob([buffer], { type: fileBlob.mimeType });

        // Upload to Gemini
        const geminiFile = await genAI.files.upload({
          file: new File([blob], filename, { type: fileBlob.mimeType }),
          config: {
            mimeType: fileBlob.mimeType,
            displayName: filename,
          },
        });

        if (!geminiFile.uri || !geminiFile.mimeType) {
          throw new Error("Failed to upload file to Gemini: missing URI or mimeType");
        }

        console.log(`Uploaded to Gemini: ${geminiFile.uri}`);

        try {
          // Extract text
          const extractionPrompt = getExtractionPrompt(fileBlob.mimeType);
          const extractResult = await genAI.models.generateContent({
            model: GEMINI_MODEL_EXTRACT,
            contents: [
              {
                parts: [
                  {
                    fileData: {
                      mimeType: geminiFile.mimeType,
                      fileUri: geminiFile.uri,
                    },
                  },
                  { text: extractionPrompt },
                ],
              },
            ],
          });

          const text = extractResult.text || "";
          console.log(`Extracted text length: ${text.length}`);

          // Validate extracted content
          const bytesPerChar = fileBlob.size / Math.max(text.length, 1);
          if (bytesPerChar > 1000 && text.trim().length < 100) {
            throw new Error(
              "This PDF appears to contain only images. " +
                "Text-based PDFs are required for embedding. " +
                "Please upload a PDF with selectable text."
            );
          }

          if (!text || text.trim().length < 50) {
            throw new Error(
              "No text extracted from document. " +
                "This may be a scanned PDF containing only images. " +
                "Please upload a text-based PDF."
            );
          }

          return text;
        } finally {
          // Always cleanup Gemini file
          if (geminiFile.name) {
            try {
              await genAI.files.delete({ name: geminiFile.name });
              console.log(`Cleaned up Gemini file: ${geminiFile.name}`);
            } catch (cleanupError) {
              console.warn(`Failed to cleanup Gemini file:`, cleanupError);
            }
          }
        }
      });

      // Step 3: Chunk text
      const chunks = await step.run("chunk-text", async () => {
        const supabase = getSupabaseClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "chunking text" })
          .eq("id", documentId);

        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 2000,
          chunkOverlap: 100,
          separators: ["\n\n", "\n", ". ", ", ", " ", ""],
        });

        const result = await splitter.splitText(textContent);
        console.log(`Generated ${result.length} chunks`);

        if (result.length === 0) {
          throw new Error("Document produced no chunks after splitting");
        }

        return result;
      });

      // Step 4: Generate embeddings
      const chunkDataArray = await step.run("generate-embeddings", async () => {
        const supabase = getSupabaseClient();
        const genAI = getGeminiClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "embedding chunks" })
          .eq("id", documentId);

        // Delete old chunks first
        await supabase.from("document_chunks").delete().eq("document_id", documentId);

        const results: {
          document_id: string;
          chunk_index: number;
          content: string;
          embedding: number[];
          token_count: number;
        }[] = [];

        const BATCH_SIZE = 10;

        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
          const batch = chunks.slice(i, i + BATCH_SIZE);

          const batchPromises = batch.map(async (chunkText, batchIndex) => {
            const absoluteIndex = i + batchIndex;
            console.log(`Embedding chunk ${absoluteIndex + 1}/${chunks.length}`);

            const embedResult = await genAI.models.embedContent({
              model: GEMINI_MODEL_EMBED,
              contents: chunkText,
            });

            const values = extractEmbeddingValues(embedResult);
            if (!values) {
              throw new Error(
                `Failed to extract embedding for chunk ${absoluteIndex + 1}: invalid response structure`
              );
            }

            return {
              document_id: documentId,
              chunk_index: absoluteIndex,
              content: chunkText,
              embedding: values,
              token_count: Math.ceil(chunkText.length / 4),
            };
          });

          const batchResults = await Promise.allSettled(batchPromises);

          for (const result of batchResults) {
            if (result.status === "fulfilled" && result.value !== null) {
              results.push(result.value);
            } else if (result.status === "rejected") {
              throw new Error(
                `Embedding failed: ${result.reason?.message ?? "Unknown error"}`
              );
            }
          }
        }

        return results;
      });

      // Step 5: Insert chunks and finalize
      await step.run("insert-chunks", async () => {
        const supabase = getSupabaseClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "inserting chunks" })
          .eq("id", documentId);

        if (chunkDataArray.length > 0) {
          const { error: insertError } = await supabase
            .from("document_chunks")
            .insert(chunkDataArray);

          if (insertError) {
            throw new Error(`Failed to insert chunks: ${insertError.message}`);
          }
        }

        // Update final status
        await supabase
          .from("documents")
          .update({
            status: "embedded",
            chunk_count: chunkDataArray.length,
            processing_stage: null,
          })
          .eq("id", documentId);

        console.log(
          `Document ${documentId} processed successfully with ${chunkDataArray.length} chunks`
        );
      });

      return { success: true, chunkCount: chunkDataArray.length };
    } catch (error) {
      console.error("Error processing document:", error);

      // Update document with error status
      const supabase = getSupabaseClient();

      try {
        const { data: currentDoc } = await supabase
          .from("documents")
          .select("error_details")
          .eq("id", documentId)
          .single();

        let errorHistory: any[] = [];
        if (Array.isArray(currentDoc?.error_details)) {
          errorHistory = currentDoc.error_details;
        } else if (currentDoc?.error_details && typeof currentDoc.error_details === "object") {
          errorHistory = [{ attempt: 1, ...currentDoc.error_details }];
        }

        const newError = {
          attempt: errorHistory.length + 1,
          code: "PROCESSING_ERROR",
          message: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        };
        errorHistory.push(newError);

        await supabase
          .from("documents")
          .update({
            status: "error",
            error_details: errorHistory,
          })
          .eq("id", documentId);
      } catch (updateError) {
        console.error("Failed to update document status to error:", updateError);
      }

      throw error;
    }
  }
);
