import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/utils/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";
import { VectorstoreService } from "@/lib/vectorstore/VectorstoreService";

function getGeminiClient() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("Missing GEMINI_API_KEY environment variable");
    }
    return new GoogleGenAI({ apiKey });
}

export async function uploadDocumentService(
    file: File | Blob, 
    fileName: string, 
    mimeType: string,
    projectId: string | null,
    userId: string
) {
    const supabase = await createClient(); // Note: This uses cookies from the request context

    // 1. Upload to Supabase Storage
    // Use 'global' folder if no projectId, otherwise projectId folder
    const folder = projectId || 'global';
    const storagePath = `${folder}/${fileName}`;
    
    const { data: uploadData, error: storageError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
            upsert: true,
            contentType: mimeType
        });

    if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // 2. Save to DB (Parent Document)
    // Initialize with 'pending' status
    const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert({
            // user_id removed
            project_id: projectId, // Can be null for global docs
            filename: fileName,
            mime_type: mimeType,
            storage_path: storagePath,
            storage_object_id: (uploadData as any).id,
            status: 'pending' // Initial status
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Insert Error:", dbError);
        // Clean up storage if DB insert fails
        await supabase.storage.from('project-files').remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
    }

    // 3. Trigger Extraction Process (Background)
    // We explicitly DO NOT await this to return the response immediately (Fire and forget)
    // Note: In serverless environments, this might be terminated early. 
    // Ideally use a queue or Next.js experimental `after()`.
    // For now, we behave as requested: trigger processing as a background task.
    reprocessDocumentService(document.id).catch(err => {
        console.error("Background processing failed:", err);
        // Attempt to update status to error if possible, but context might be lost
    });

    return document;
}

export async function deleteDocumentService(documentId: string, userId: string) {
    const supabase = await createClient();
    
    // Fetch document to get google name
    // RLS ensures we can only select if we are a member of the project
    const { data: document, error: fetchError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();

    if (fetchError || !document) {
        throw new Error("Document not found");
    }

    // Removed manual user_id check as RLS handles it via project membership
    
    // Delete from Google
    const client = getGeminiClient();
    try {
        await client.files.delete({ name: document.google_file_name });
    } catch (apiError: any) {
        console.warn("Failed to delete file from Google:", apiError);
        // non-blocking
    }

    // Delete from Storage
    if (document.storage_path) {
        await supabase.storage.from('project-files').remove([document.storage_path]);
    }

    // Delete from DB
    const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

    if (deleteError) {
        throw new Error(`Database error: ${deleteError.message}`);
    }

    return true;
}

export async function reprocessDocumentService(documentId: string) {
    const supabase = await createClient();

    // 1. Fetch Document
    const { data: document, error: fetchError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();

    if (fetchError || !document) {
        throw new Error("Document not found");
    }

    console.log(`Reprocessing document: ${document.filename} (${document.id})`);

    // Set status to Processing
    await supabase.from("documents").update({ status: 'processing' }).eq('id', documentId);

    try {
        // 2. Download from Supabase Storage
        if (!document.storage_path) {
            throw new Error("Document has no storage path");
        }

        const { data: fileBlob, error: downloadError } = await supabase
            .storage
            .from('project-files')
            .download(document.storage_path);

        if (downloadError || !fileBlob) {
            throw new Error(`Failed to download file from storage: ${downloadError?.message}`);
        }

        // 3. Delete existing chunks (Start fresh)
        const { error: chunkDeleteError } = await supabase
            .from("document_chunks")
            .delete()
            .eq("document_id", documentId);
        
        if (chunkDeleteError) {
            throw new Error(`Failed to clear existing chunks: ${chunkDeleteError.message}`);
        }

        // 4. Run Extraction Pipeline (Gemini)
        const client = getGeminiClient();
        const arrayBuffer = await fileBlob.arrayBuffer();
        
        // Upload to Google (Ephemeral)
        const uploadResult = await client.files.upload({
            file: new Blob([arrayBuffer]),
            config: {
                mimeType: document.mime_type || 'application/pdf',
                displayName: document.filename
            }
        });

        if (!uploadResult.uri) {
            throw new Error("Failed to upload to Gemini for extraction");
        }

        // Initialize Vectorstore
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
        const geminiKey = process.env.GEMINI_API_KEY;

        if (!supabaseUrl || !supabaseKey || !geminiKey) {
                throw new Error("Missing server configuration for vector processing");
        }

        const vectorService = new VectorstoreService(supabaseUrl, supabaseKey, geminiKey);

        // Extract
        const content = await vectorService.extractTextFromFile(uploadResult.uri, document.mime_type || 'application/pdf');

        // Chunk & Embed
        // Use recursive splitting with 1000 char chunks and 200 char overlap
        const chunks = vectorService.splitTextIntoChunks(content, 1000, 200);
        console.log(`Reprocessed: Generated ${chunks.length} chunks`);

        const chunkDataArray = [];
        
        // Generate embeddings in batches to improve speed but avoid rate limits
        // Batch size of 10 parallel requests
        const BATCH_SIZE = 10;
        for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
            const batch = chunks.slice(i, i + BATCH_SIZE);
            console.log(`Processing batch ${i / BATCH_SIZE + 1}/${Math.ceil(chunks.length / BATCH_SIZE)}`);
            
            const batchPromises = batch.map(async (chunkText, batchIndex) => {
                try {
                    const embedding = await vectorService.generateEmbedding(chunkText);
                    return {
                        document_id: document.id,
                        chunk_index: i + batchIndex,
                        content: chunkText,
                        embedding: embedding,
                        token_count: Math.ceil(chunkText.length / 4)
                    };
                } catch (e) {
                    console.error(`Failed to embed chunk ${i + batchIndex}`, e);
                    return null;
                }
            });

            const batchResults = await Promise.all(batchPromises);
            // Filter out failures
            const validResults = batchResults.filter(r => r !== null);
            chunkDataArray.push(...validResults);
        }

        if (chunkDataArray.length === 0) {
            throw new Error("Failed to generate any embeddings");
        }

        // Batch insert chunks (Supabase handles large batches well, but let's be safe and chunk inserts too if huge)
        // 300 rows is fine for single insert usually.
        const { error: insertError, count } = await supabase.from("document_chunks")
            .insert(chunkDataArray); // Using default client configuration
        
        console.log(`Inserted ${chunkDataArray.length} chunks into DB. Error:`, insertError);

        if (insertError) {
             throw new Error(`Failed to insert chunks: ${insertError.message}`);
        }

        // Cleanup Google File
        try { await client.files.delete({ name: uploadResult.name! }); } catch {}

        // Set status to Embedded
        await supabase.from("documents").update({ status: 'embedded' }).eq('id', documentId);

        return { success: true, chunkCount: chunks.length };

    } catch (error: any) {
        console.error("Reprocessing failed:", error);
        // Set status to Error
        await supabase.from("documents").update({ status: 'error' }).eq('id', documentId);
        throw new Error(`Reprocessing failed: ${error.message}`);
    }
}
