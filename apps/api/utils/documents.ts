import { GoogleGenAI } from "@google/genai";
import { createClient } from "@/utils/supabase/server";
import { SupabaseClient } from "@supabase/supabase-js";

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
    const supabase = await createClient(); // Note: This uses cookies from the request context, ensuring caller is authenticated/authorized for RLS if using implicit auth.
    // However, for service-level operations, we might want to pass the client or ensure we have one. 
    // If called from Server Action, 'createClient' works.
    
    // Upload to Google
    const arrayBuffer = await file.arrayBuffer();
    const uploadResult = await client.files.upload({
        file: new Blob([arrayBuffer]),
        config: {
            mimeType: mimeType,
            displayName: fileName
        }
    });

    // Save to DB
    const { data: document, error: dbError } = await supabase
        .from("documents")
        .insert({
            user_id: userId,
            project_id: projectId,
            filename: fileName,
            mime_type: mimeType,
            google_file_uri: uploadResult.uri,
            google_file_name: uploadResult.name
        })
        .select()
        .single();

    if (dbError) {
        console.error("DB Insert Error:", dbError);
        try {
            await client.files.delete({ name: uploadResult.name! });
        } catch (cleanupError) {
            console.error("Failed to cleanup Google File after DB error", cleanupError);
        }
        throw new Error(`Database error: ${dbError.message}`);
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
