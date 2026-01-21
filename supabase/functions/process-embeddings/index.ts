import { createClient } from "jsr:@supabase/supabase-js@2";
import { GoogleGenAI } from "npm:@google/genai";
import { RecursiveCharacterTextSplitter } from "npm:@langchain/textsplitters";

// --- Configuration ---
const GEMINI_MODEL_EXTRACT = "gemini-2.5-flash";
const GEMINI_MODEL_EMBED = "text-embedding-004";

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
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  try {
    const payload: WebhookPayload = await req.json();
    const document = payload.record;

    // Only process on specific trigger conditions
    // 1. INSERT with status 'pending'
    // 2. UPDATE where status changed to 'pending' (re-process)
    // Actually, simple trigger usually sends every INSERT. We should check status.
    if (document.status !== "pending") {
      return new Response(JSON.stringify({ message: "Skipping, status not pending" }), { headers: { "Content-Type": "application/json" } });
    }

    console.log(`Processing document ${document.id} (${document.filename})`);

    // 1. Update Status to Processing
    await supabase
      .from("documents")
      .update({ status: "processing" })
      .eq("id", document.id);

    // 2. Download from Storage
    const { data: fileBlob, error: downloadError } = await supabase.storage
      .from("project-files")
      .download(document.storage_path);

    if (downloadError || !fileBlob) {
      throw new Error(`Failed to download file: ${downloadError?.message}`);
    }

    // 3. Upload to Gemini for Extraction
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) throw new Error("Missing GEMINI_API_KEY");
    const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

    // Convert Blob to ArrayBuffer then to base64 or upload directly via Files API
    // The Google GenAI NodeJS SDK supports File/Blob in some envs, but in Deno we might need to be careful.
    // The previous code used `client.files.upload`. Let's use the same.
    
    // Note: client.files.upload expects a `Blob` or `File`.
    // In Deno, `fileBlob` is a Blob.
    const uploadResult = await genAI.files.upload({
      file: new File([fileBlob], document.filename, { type: fileBlob.mime_type }),
      config: {
        mimeType: fileBlob.mime_type,
        displayName: document.filename,
      },
    });

    console.log(`Uploaded to Gemini: ${uploadResult.uri}`);

    // 4. Extract Text
    const extractResult = await genAI.models.generateContent({
      model: GEMINI_MODEL_EXTRACT,
      contents: [
        {
          parts: [
            {
              fileData: {
                mimeType: uploadResult.file.mimeType,
                fileUri: uploadResult.file.uri,
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
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    const chunks = await splitter.splitText(textContent);
    console.log(`Generated ${chunks.length} chunks`);

    // 6. Generate Embeddings & Insert
    // Delete old chunks first
    await supabase.from("document_chunks").delete().eq("document_id", document.id);

    const chunkDataArray = [];
    const BATCH_SIZE = 10;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE);
        
        const batchPromises = batch.map(async (chunkText, batchIndex) => {
            try {
                const embedResult = await genAI.models.embedContent({
                    model: GEMINI_MODEL_EMBED,
                    contents: chunkText,
                });
                
                // embedContent returns { embeddings: [{ values: [...] }] } or similar depending on SDK version
                // Check SDK response structure carefully.
                // In @google/genai v0.1+, it might be result.embedding.values or result.embeddings[0].values
                // Based on VectorstoreService.ts: result.embeddings[0].values
                const values = embedResult.embeddings?.[0]?.values;

                if (!values) return null;

                return {
                    document_id: document.id,
                    chunk_index: i + batchIndex,
                    content: chunkText,
                    embedding: values,
                    token_count: Math.ceil(chunkText.length / 4) // Rough estimate
                };
            } catch (e) {
                console.error(`Failed to embed chunk ${i + batchIndex}`, e);
                return null;
            }
        });

        const batchResults = await Promise.all(batchPromises);
        const validResults = batchResults.filter((r) => r !== null);
        chunkDataArray.push(...validResults);
    }

    if (chunkDataArray.length > 0) {
        const { error: insertError } = await supabase
        .from("document_chunks")
        .insert(chunkDataArray);

        if (insertError) throw insertError;
    }

    // 7. Cleanup & Update Status
    // Delete from Gemini
    try {
        await genAI.files.delete({ name: uploadResult.file.name });
    } catch (e) {
        console.warn("Failed to delete Gemini file", e);
    }

    await supabase
      .from("documents")
      .update({ status: "embedded" })
      .eq("id", document.id);

    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Error processing document:", error);
    
    // Try to update status to error
    const supabase = createClient(
        Deno.env.get("SUPABASE_URL") ?? "",
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    try {
        const payload: WebhookPayload = await req.json().catch(() => ({ record: {} } as any));
        if (payload?.record?.id) {
            await supabase
                .from("documents")
                .update({ status: "error" }) // Could add a generic error column later
                .eq("id", payload.record.id);
        }
    } catch {}

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
