import { createClient } from "@/utils/supabase/server";

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
    // Trigger is now handled by Supabase Edge Function listening to DB changes or status
    // or we just leave it as 'pending' and the edge function picks it up.
    
    return document;
}

export async function deleteDocumentService(documentId: string, userId: string) {
    const supabase = await createClient();
    
    // Fetch document
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
    

    // Delete from Storage
    if (document.storage_path) {
        await supabase.storage.from('project-files').remove([document.storage_path]);
    }

    // Delete from DB
    const { error: deleteError, count } = await supabase
        .from("documents")
        .delete({ count: 'exact' })
        .eq("id", documentId);

    if (deleteError) {
        throw new Error(`Database error: ${deleteError.message}`);
    }

    if (count === 0) {
        throw new Error("Failed to delete document: 0 rows deleted (Permission denied or not found)");
    }

    return true;
}

