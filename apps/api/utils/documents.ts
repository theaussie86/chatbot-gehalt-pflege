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
    const storagePath = `${userId}/${fileName}`;
    const { error: storageError } = await supabase.storage
        .from('project-files')
        .upload(storagePath, file, {
            upsert: true,
            contentType: mimeType
        });

    if (storageError) {
        throw new Error(`Storage upload failed: ${storageError.message}`);
    }

    // 2. Upload to Google for Extraction (Ephemeral)
    const arrayBuffer = await file.arrayBuffer();
    const uploadResult = await client.files.upload({
        file: new Blob([arrayBuffer]),
        config: {
            mimeType: mimeType,
            displayName: fileName
        }
    });

    if (!uploadResult.uri) {
        throw new Error("Failed to upload file to Gemini: No URI returned");
    }

    // Initialize VectorstoreService
    const vectorService = new VectorstoreService(
        process.env.SUPABASE_URL || "",
        process.env.SUPABASE_SERVICE_ROLE_KEY || "", 
        process.env.GEMINI_API_KEY || ""
    );

    let content = "";
    
    try {
        // 3. Extract text
        content = await vectorService.extractTextFromFile(uploadResult.uri, mimeType);
    } catch (processError) {
        console.error("Extraction Error:", processError);
        // Clean up Google file
        try { await client.files.delete({ name: uploadResult.name! }); } catch {}
        throw new Error("Failed to process document content");
    }

    // 4. Save to DB (Parent Document)
    // Note: We are NOT saving 'content' or 'embedding' in the parent table anymore
    // But we update 'storage_path'
    const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert({
            user_id: userId,
            project_id: projectId,
            filename: fileName,
            mime_type: mimeType,
            storage_path: storagePath,
            // We can keep google_file_uri null or store it if we want, but plan said remove/ignore. 
            // The table likely still has constraints if we didn't remove columns. 
            // The columns google_file_name/uri are NOT NULL in original schema. 
            // We should provde dummy values or maintain them if we didn't drop columns.
            // Since we didn't drop them in SQL, we must provide them.
            google_file_uri: uploadResult.uri,
            google_file_name: uploadResult.name
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Insert Error:", dbError);
        try { await client.files.delete({ name: uploadResult.name! }); } catch {}
        throw new Error(`Database error: ${dbError.message}`);
    }

    // 5. Chunking & Embedding
    try {
        const chunks = vectorService.splitTextIntoChunks(content, 1000);
        console.log(`Split document into ${chunks.length} chunks`);

        for (let i = 0; i < chunks.length; i++) {
            const chunkContent = chunks[i];
            const embedding = await vectorService.generateEmbedding(chunkContent);
            
            await supabase.from("document_chunks").insert({
                document_id: document.id,
                chunk_index: i,
                content: chunkContent,
                embedding: embedding
            });
        }
        
        // 6. Cleanup Google File (It's now processed)
        await client.files.delete({ name: uploadResult.name! });

    } catch (chunkError: any) {
         console.error("Chunking/Embedding Error:", chunkError);
         // Optional: Delete the document if chunking fails?
         // For now, we leave the document record but it has no chunks.
         throw new Error(`Failed to process chunks: ${chunkError.message}`);
    }

    return document;
}

export async function deleteDocumentService(documentId: string, userId: string) {
    const supabase = await createClient();
    
    // Fetch document to get google name
    const { data: document, error: fetchError } = await supabase
        .from("documents")
        .select("*")
        .eq("id", documentId)
        .single();

    if (fetchError || !document) {
        throw new Error("Document not found");
    }

    if (document.user_id !== userId) {
        throw new Error("Unauthorized");
    }

    // Delete from Google
    const client = getGeminiClient();
    try {
        await client.files.delete({ name: document.google_file_name });
    } catch (apiError: any) {
        console.warn("Google API Delete Error (might be already deleted):", apiError.message);
    }

    // Delete from DB
    const { error: deleteError } = await supabase
        .from("documents")
        .delete()
        .eq("id", documentId);

    if (deleteError) {
        throw new Error(`Database delete error: ${deleteError.message}`);
    }

    return true;
}
