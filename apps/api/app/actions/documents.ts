'use server'

import { createClient } from "@/utils/supabase/server";
import { deleteDocumentService, uploadDocumentService } from "@/utils/documents";
import { revalidatePath } from "next/cache";

export async function uploadDocumentAction(formData: FormData) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        const file = formData.get("file") as File;
        const projectId = formData.get("projectId") as string | null;
        // const isGlobal = formData.get("isGlobal") === "true"; // Deprecated/Removed

        if (!file) throw new Error("No file provided");
        // if (!projectId) throw new Error("Project ID is required"); // Removed check to allow global docs

        await uploadDocumentService(
            file,
            file.name,
            file.type || "application/pdf",
            projectId || null, 
            user.id
        );

        if (projectId) {
            revalidatePath(`/projects/${projectId}`);
        }
        revalidatePath('/documents'); // Revalidate global list
        return { success: true };
    } catch (error: any) {
        console.error("Upload Action Error", error);
        return { error: error.message };
    }
}

export async function deleteDocumentAction(documentId: string, projectId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        await deleteDocumentService(documentId, user.id);

        revalidatePath(`/projects/${projectId}`);
        return { success: true };
    } catch (error: any) {
         console.error("Delete Action Error", error);
         return { error: error.message };
    }
}

export async function getDocumentDownloadUrlAction(documentId: string) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        // RLS ensures we only see documents we have access to
        const { data: document, error: fetchError } = await supabase
            .from("documents")
            .select("storage_path") // removed user_id from select
            .eq("id", documentId)
            .single();

        if (fetchError || !document) {
            throw new Error("Document not found");
        }

        // Removed manual user_id check

        if (!document.storage_path) {
            throw new Error("Document has no storage path");
        }

        const { data, error } = await supabase.storage
            .from('project-files')
            .createSignedUrl(document.storage_path, 3600); // 1 hour

        if (error) {
            throw new Error(`Storage error: ${error.message}`);
        }

        return { url: data.signedUrl };
    } catch (error: any) {
        console.error("Download URL Action Error", error);
        return { error: error.message };
    }
}

export async function reprocessDocumentAction(documentId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized' };
    }

    try {
        const { reprocessDocumentService } = await import('@/utils/documents');
        const result = await reprocessDocumentService(documentId);
        
        revalidatePath('/documents');
        revalidatePath('/admin/documents');
        return { success: true, count: result.chunkCount };
    } catch (error: any) {
        console.error("Reprocess action failed:", error);
        return { error: error.message };
    }
}
