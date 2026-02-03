import { inngest } from "../client";
import { createClient } from "@supabase/supabase-js";
import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { getGeminiClient } from "@/lib/gemini";

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
 * For PDFs, requests page markers to enable citation quality.
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

  // For PDFs, request page markers for citation tracking
  if (mimeType === "application/pdf") {
    return `Extract all the text from this PDF document.
IMPORTANT: Prefix each page's content with [PAGE:N] where N is the page number.
Start with [PAGE:1] for the first page, [PAGE:2] for the second, and so on.
Return only the text content with page markers.
Do not include any markdown formatting or introductory text, just the raw content with page markers.

Example format:
[PAGE:1]
Content from page 1...
[PAGE:2]
Content from page 2...`;
  }

  // For non-PDF documents (plain text, markdown), no page markers
  return `Extract all the text from this document.
Return only the text content.
Do not include any markdown formatting or introductory text, just the raw content.`;
}

// --- Page Marker Parsing ---

/**
 * Represents content from a single page with its page number.
 */
interface PagedContent {
  pageNumber: number | null;
  content: string;
}

/**
 * Parse [PAGE:N] markers from extracted text.
 * Returns array of page content objects.
 * If no markers found, returns single entry with pageNumber: null.
 */
function parsePageMarkers(text: string): PagedContent[] {
  // Regex to match [PAGE:N] markers and capture following content
  const pageMarkerRegex = /\[PAGE:(\d+)\]/g;

  const pages: PagedContent[] = [];
  let lastIndex = 0;
  let lastPageNumber: number | null = null;
  let match: RegExpExecArray | null;

  // Find all page markers
  const matches: { pageNumber: number; index: number }[] = [];
  while ((match = pageMarkerRegex.exec(text)) !== null) {
    matches.push({
      pageNumber: parseInt(match[1], 10),
      index: match.index,
    });
  }

  // If no markers found, return single entry with null page
  if (matches.length === 0) {
    return [{ pageNumber: null, content: text.trim() }];
  }

  // Check for content before first marker
  if (matches[0].index > 0) {
    const beforeContent = text.substring(0, matches[0].index).trim();
    if (beforeContent.length > 0) {
      pages.push({ pageNumber: null, content: beforeContent });
    }
  }

  // Extract content between markers
  for (let i = 0; i < matches.length; i++) {
    const currentMatch = matches[i];
    const markerEndIndex = currentMatch.index + `[PAGE:${currentMatch.pageNumber}]`.length;

    // Content ends at next marker or end of string
    const contentEndIndex = i + 1 < matches.length ? matches[i + 1].index : text.length;
    const content = text.substring(markerEndIndex, contentEndIndex).trim();

    if (content.length > 0) {
      pages.push({
        pageNumber: currentMatch.pageNumber,
        content,
      });
    }
  }

  return pages;
}

/**
 * Represents a text chunk with page boundary information.
 */
interface PagedChunk {
  content: string;
  pageStart: number | null;
  pageEnd: number | null;
}

/**
 * Split text into chunks while tracking page boundaries.
 * Uses RecursiveCharacterTextSplitter internally but preserves page info.
 */
async function splitTextWithPageTracking(
  pagedContent: PagedContent[],
  chunkSize: number = 2000,
  chunkOverlap: number = 100
): Promise<PagedChunk[]> {
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ["\n\n", "\n", ". ", ", ", " ", ""],
  });

  const pagedChunks: PagedChunk[] = [];

  // If we have page data, process page by page and track boundaries
  const hasPageData = pagedContent.some(p => p.pageNumber !== null);

  if (!hasPageData) {
    // No page markers - split normally without page tracking
    const fullText = pagedContent.map(p => p.content).join("\n\n");
    const chunks = await splitter.splitText(fullText);
    return chunks.map(content => ({
      content,
      pageStart: null,
      pageEnd: null,
    }));
  }

  // Build a map of character positions to page numbers
  let fullText = "";
  const positionToPage: { start: number; end: number; page: number | null }[] = [];

  for (const page of pagedContent) {
    const start = fullText.length;
    fullText += page.content + "\n\n";
    const end = fullText.length;
    positionToPage.push({ start, end, page: page.pageNumber });
  }

  // Split the full text
  const chunks = await splitter.splitText(fullText);

  // For each chunk, determine which pages it spans
  let searchStart = 0;
  for (const chunkContent of chunks) {
    // Find chunk position in full text (search from last position for efficiency)
    const chunkStart = fullText.indexOf(chunkContent, searchStart);
    if (chunkStart === -1) {
      // Fallback: chunk may have been modified, search from beginning
      const fallbackStart = fullText.indexOf(chunkContent);
      if (fallbackStart === -1) {
        // Can't find chunk - add without page info
        pagedChunks.push({
          content: chunkContent,
          pageStart: null,
          pageEnd: null,
        });
        continue;
      }
    }

    const actualStart = chunkStart !== -1 ? chunkStart : fullText.indexOf(chunkContent);
    const chunkEnd = actualStart + chunkContent.length;
    searchStart = actualStart; // Start next search from here

    // Find pages that this chunk spans
    let pageStart: number | null = null;
    let pageEnd: number | null = null;

    for (const pos of positionToPage) {
      // Check if chunk overlaps with this page's content
      if (actualStart < pos.end && chunkEnd > pos.start) {
        if (pos.page !== null) {
          if (pageStart === null) {
            pageStart = pos.page;
          }
          pageEnd = pos.page;
        }
      }
    }

    pagedChunks.push({
      content: chunkContent,
      pageStart,
      pageEnd: pageEnd !== pageStart ? pageEnd : pageStart, // Same as start if single page
    });
  }

  return pagedChunks;
}

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error("Missing Supabase environment variables");
  }
  return createClient(url, key);
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

      // Step 2: Extract text using Gemini with inline base64 data (Vertex AI compatible)
      const textContent = await step.run("extract-text", async () => {
        const supabase = getSupabaseClient();
        const genAI = getGeminiClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "extracting text" })
          .eq("id", documentId);

        console.log(`Extracting text from ${filename} (${fileBlob.size} bytes)`);

        // Extract text using inline base64 data (Vertex AI doesn't support file uploads)
        const extractionPrompt = getExtractionPrompt(fileBlob.mimeType);
        const extractResult = await genAI.models.generateContent({
          model: GEMINI_MODEL_EXTRACT,
          contents: [
            {
              role: "user",
              parts: [
                {
                  inlineData: {
                    mimeType: fileBlob.mimeType,
                    data: fileBlob.base64,
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
      });

      // Step 3: Parse page markers and chunk text with page tracking
      const pagedChunks = await step.run("chunk-text", async () => {
        const supabase = getSupabaseClient();

        await supabase
          .from("documents")
          .update({ processing_stage: "chunking text" })
          .eq("id", documentId);

        // Parse page markers from extracted text
        const pagedContent = parsePageMarkers(textContent);
        const hasPageMarkers = pagedContent.some(p => p.pageNumber !== null);
        console.log(`Parsed ${pagedContent.length} page sections, hasPageMarkers: ${hasPageMarkers}`);

        // Split text into chunks while tracking page boundaries
        const result = await splitTextWithPageTracking(pagedContent, 2000, 100);
        console.log(`Generated ${result.length} chunks with page tracking`);

        if (result.length === 0) {
          throw new Error("Document produced no chunks after splitting");
        }

        return result;
      });

      // Step 4: Generate embeddings with page data
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
          page_start: number | null;
          page_end: number | null;
        }[] = [];

        const BATCH_SIZE = 10;

        for (let i = 0; i < pagedChunks.length; i += BATCH_SIZE) {
          const batch = pagedChunks.slice(i, i + BATCH_SIZE);

          const batchPromises = batch.map(async (chunk, batchIndex) => {
            const absoluteIndex = i + batchIndex;
            console.log(`Embedding chunk ${absoluteIndex + 1}/${pagedChunks.length}`);

            const embedResult = await genAI.models.embedContent({
              model: GEMINI_MODEL_EMBED,
              contents: chunk.content,
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
              content: chunk.content,
              embedding: values,
              token_count: Math.ceil(chunk.content.length / 4),
              page_start: chunk.pageStart,
              page_end: chunk.pageEnd,
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

      // Step 5: Insert chunks and finalize with page data flag
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

        // Determine if page extraction succeeded
        // has_page_data = true if any chunk has page data, false otherwise
        const hasPageData = chunkDataArray.some(
          chunk => chunk.page_start !== null || chunk.page_end !== null
        );

        // Update final status with has_page_data flag
        await supabase
          .from("documents")
          .update({
            status: "embedded",
            chunk_count: chunkDataArray.length,
            processing_stage: null,
            has_page_data: hasPageData,
          })
          .eq("id", documentId);

        console.log(
          `Document ${documentId} processed successfully with ${chunkDataArray.length} chunks, has_page_data: ${hasPageData}`
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
