'use server'

import { createClient } from "@/utils/supabase/server";
import { deleteDocumentService, uploadDocumentService, DocumentUploadError } from "@/utils/documents";
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

        // Handle structured DocumentUploadError
        if (error instanceof DocumentUploadError) {
            return {
                error: error.message,
                code: error.code,
                rolledBack: error.rolledBack
            };
        }

        // Handle generic errors
        return {
            error: error.message || "Unknown error occurred",
            code: "ERR_UNKNOWN"
        };
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
            .createSignedUrl(document.storage_path, 300); // 5 minutes

        if (error) {
            throw new Error(`Storage error: ${error.message}`);
        }

        return {
            url: data.signedUrl,
            expiresAt: Date.now() + 300 * 1000 // 5 minutes from now
        };
    } catch (error: any) {
        console.error("Download URL Action Error", error);
        return { error: error.message };
    }
}

// Create document record after direct browser upload (for files > 1MB)
export async function createDocumentRecordAction(
    storagePath: string,
    filename: string,
    mimeType: string,
    projectId: string | null
) {
    try {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Unauthorized");

        const { data: document, error: dbError } = await supabase
            .from("documents")
            .insert({
                storage_path: storagePath,
                filename: filename,
                mime_type: mimeType,
                project_id: projectId || null,
                status: 'pending'
            })
            .select()
            .single();

        if (dbError) {
            // If DB insert fails, we need to clean up the storage file
            // that was uploaded directly by the browser
            console.error("DB insert failed after direct upload, cleaning up storage:", storagePath);
            try {
                await supabase.storage
                    .from('project-files')
                    .remove([storagePath]);
                console.log("Storage cleanup successful for:", storagePath);
            } catch (cleanupError) {
                console.error("Storage cleanup failed:", cleanupError);
            }
            throw new Error(`Database error: ${dbError.message}`);
        }

        if (projectId) {
            revalidatePath(`/projects/${projectId}`);
        }
        revalidatePath('/documents');
        return { success: true, document };
    } catch (error: any) {
        console.error("Create Document Record Error", error);
        return {
            error: error.message || "Unknown error occurred",
            code: "ERR_DATABASE",
            rolledBack: true
        };
    }
}

export async function reprocessDocumentAction(documentId: string) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return { error: 'Unauthorized' };
    }

    try {
        // Reset status to 'pending' to trigger the edge function (or whatever mechanism listens for new/pending docs)
        const { error } = await supabase
            .from("documents")
            .update({ status: 'pending' })
            .eq("id", documentId);

        if (error) throw error;

        revalidatePath('/documents');
        revalidatePath('/admin/documents');
        return { success: true };
    } catch (error: any) {
        console.error("Reprocess action failed:", error);
        return { error: error.message };
    }
}

export async function bulkDeleteDocumentsAction(documentIds: string[]) {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
        return {
            success: false,
            successCount: 0,
            failCount: documentIds.length,
            results: documentIds.map(id => ({ id, success: false, error: 'Unauthorized' }))
        };
    }

    const results: { id: string; success: boolean; error?: string }[] = [];

    // Delete sequentially for atomicity per document
    for (const id of documentIds) {
        try {
            // Get document first to find storage path
            const { data: doc } = await supabase
                .from('documents')
                .select('storage_path')
                .eq('id', id)
                .single();

            if (!doc) {
                results.push({ id, success: false, error: 'Document not found' });
                continue;
            }

            // DB-first delete (cascade removes chunks)
            const { error: dbError } = await supabase
                .from('documents')
                .delete()
                .eq('id', id);

            if (dbError) {
                results.push({ id, success: false, error: dbError.message });
                continue;
            }

            // Then delete from storage (orphaned file if this fails is acceptable)
            if (doc.storage_path) {
                const { error: storageError } = await supabase.storage
                    .from('project-files')
                    .remove([doc.storage_path]);

                if (storageError) {
                    console.warn(`Storage cleanup failed for ${id}: ${storageError.message}`);
                }
            }

            results.push({ id, success: true });
        } catch (err: any) {
            results.push({ id, success: false, error: err.message });
        }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    revalidatePath('/documents');
    revalidatePath('/admin/documents');

    return {
        success: failCount === 0,
        successCount,
        failCount,
        results
    };
}
