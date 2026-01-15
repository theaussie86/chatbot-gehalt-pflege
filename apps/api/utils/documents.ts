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
    const client = getGeminiClient();
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

    // 4. Save to DB (Parent Document) FIRST
    // This ensures we have a record even if extraction fails
    const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert({
            // user_id removed
            project_id: projectId, // Can be null for global docs
            filename: fileName,
            mime_type: mimeType,
            storage_path: storagePath,
            storage_object_id: (uploadData as any).id, // Save link to storage object
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Insert Error:", dbError);
        // Clean up storage if DB insert fails
        await supabase.storage.from('project-files').remove([storagePath]);
        throw new Error(`Database error: ${dbError.message}`);
    }

    // 3. Independent Extraction Process
    // We don't await this to block the response, or we catch errors to ensure the document persists
    // For now, we'll await but catch errors so the user gets a success response with a warning if extraction fails
    try {
        // Upload to Google for Extraction (Ephemeral)
        const arrayBuffer = await file.arrayBuffer();
        const uploadResult = await client.files.upload({
            file: new Blob([arrayBuffer]),
            config: {
                mimeType: mimeType,
                displayName: fileName
            }
        });

        if (!uploadResult.uri) {
            console.error("Failed to upload file to Gemini for extraction");
        } else {
             // Initialize VectorstoreService
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
            const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
            const geminiKey = process.env.GEMINI_API_KEY;

            if (supabaseUrl && supabaseKey && geminiKey) {
                const vectorService = new VectorstoreService(
                    supabaseUrl,
                    supabaseKey, 
                    geminiKey
                );

                const content = await vectorService.extractTextFromFile(uploadResult.uri, mimeType);
                
                // Update document with Google file info
                // Columns removed, so we skip update of uri/name
                 /* await supabase.from("documents").update({
                    google_file_uri: uploadResult.uri,
                    google_file_name: uploadResult.name
                }).eq('id', document.id); */

                // --- 5. Chunking & Embedding (Moved inside try block) ---
                const chunks = vectorService.splitTextIntoChunks(content, 1000);
                
                for (const chunkText of chunks) {
                    const embedding = await vectorService.generateEmbedding(chunkText);
                    
                    await supabase.from("document_chunks")
                        .insert({
                            document_id: document.id,
                            content: chunkText,
                            embedding: embedding,
                            token_count: chunkText.length / 4 // Approx
                        });
                }

                // Cleanup after successful processing
                 try { await client.files.delete({ name: uploadResult.name! }); } catch {}
            }
        }
    } catch (processError) {
        console.error("Extraction/Embedding Warning (Document saved but not processed):", processError);
        // Use a notification or log but don't fail the upload
    }

    return document; // Return the created document
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
    try {
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
        const chunks = vectorService.splitTextIntoChunks(content, 1000);
        console.log(`Reprocessed: Generated ${chunks.length} chunks`);

        for (const chunkText of chunks) {
            const embedding = await vectorService.generateEmbedding(chunkText);
            
            await supabase.from("document_chunks")
                .insert({
                    document_id: document.id,
                    content: chunkText,
                    embedding: embedding,
                    token_count: chunkText.length / 4
                });
        }

        // Cleanup Google File
        try { await client.files.delete({ name: uploadResult.name! }); } catch {}

        return { success: true, chunkCount: chunks.length };

    } catch (error: any) {
        console.error("Reprocessing failed:", error);
        throw new Error(`Reprocessing failed: ${error.message}`);
    }
}
