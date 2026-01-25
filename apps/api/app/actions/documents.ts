'use server'

import { createClient } from "@/utils/supabase/server";
import { deleteDocumentService, uploadDocumentService, DocumentUploadError } from "@/utils/documents";
import { revalidatePath } from "next/cache";
import { VectorstoreService } from "@/lib/vectorstore/VectorstoreService";
import { inngest } from "@/lib/inngest/client";

function getVectorstoreForCacheInvalidation(): VectorstoreService | null {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_KEY;
    if (!url || !key) {
        console.warn('[RAG] Missing env vars for cache invalidation');
        return null;
    }
    return new VectorstoreService(url, key);
}

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

        // Invalidate RAG cache after document deletion
        const vectorstore = getVectorstoreForCacheInvalidation();
        if (vectorstore) {
            vectorstore.clearCache();
            console.log('[RAG] Cache invalidated after document deletion');
        }

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

        // Trigger Inngest processing for the new document
        await inngest.send({
            name: "document/process",
            data: {
                documentId: document.id,
                projectId: projectId,
                filename: filename,
                mimeType: mimeType,
                storagePath: storagePath,
            },
        });

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
        // 1. Fetch current document to get existing error_details and required fields
        const { data: doc } = await supabase
            .from("documents")
            .select("error_details, project_id, filename, mime_type, storage_path")
            .eq("id", documentId)
            .single();

        // 2. Build error history array from existing error_details
        let errorHistory: any[] = [];
        if (Array.isArray(doc?.error_details)) {
            // Already in array format
            errorHistory = doc.error_details;
        } else if (doc?.error_details && typeof doc.error_details === 'object') {
            // Convert legacy single error object to array format
            errorHistory = [{ attempt: 1, ...doc.error_details }];
        }
        // If null/undefined, errorHistory remains empty array

        // 3. Delete existing chunks before resetting status
        await supabase
            .from("document_chunks")
            .delete()
            .eq("document_id", documentId);

        // 4. Update document with reset state, preserving error history
        const { error } = await supabase
            .from("documents")
            .update({
                status: 'pending',
                chunk_count: null,
                processing_stage: null,
                error_details: errorHistory.length > 0 ? errorHistory : null
            })
            .eq("id", documentId);

        if (error) throw error;

        // Trigger Inngest to reprocess the document
        if (doc) {
            await inngest.send({
                name: "document/process",
                data: {
                    documentId: documentId,
                    projectId: doc.project_id,
                    filename: doc.filename,
                    mimeType: doc.mime_type,
                    storagePath: doc.storage_path,
                },
            });
        }

        // Invalidate RAG cache after reprocess to clear stale answers
        const vectorstore = getVectorstoreForCacheInvalidation();
        if (vectorstore) {
            vectorstore.clearCache();
            console.log('[RAG] Cache invalidated after document reprocess');
        }

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

    // Invalidate RAG cache after bulk delete
    if (results.some(r => r.success)) {
        const vectorstore = getVectorstoreForCacheInvalidation();
        if (vectorstore) {
            vectorstore.clearCache();
            console.log('[RAG] Cache invalidated after bulk delete');
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
