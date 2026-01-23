import { createClient } from "@/utils/supabase/server";

// Custom error class for upload errors with structured data
export class DocumentUploadError extends Error {
    constructor(
        public code: string,
        message: string,
        public rolledBack: boolean = false
    ) {
        super(message);
        this.name = 'DocumentUploadError';
    }
}

// Error codes
export const ERROR_CODES = {
    SIZE_LIMIT: 'ERR_SIZE_LIMIT',
    INVALID_TYPE: 'ERR_INVALID_TYPE',
    STORAGE: 'ERR_STORAGE',
    DATABASE: 'ERR_DATABASE',
} as const;

// Constants
const MAX_FILE_SIZE = 52428800; // 50MB in bytes
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'text/plain',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
    'application/vnd.ms-excel', // xls
];

export async function uploadDocumentService(
    file: File | Blob,
    fileName: string,
    mimeType: string,
    projectId: string | null,
    userId: string
) {
    const supabase = await createClient(); // Note: This uses cookies from the request context

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
        throw new DocumentUploadError(
            ERROR_CODES.SIZE_LIMIT,
            `File size exceeds 50MB limit. File size: ${(file.size / 1048576).toFixed(2)}MB`
        );
    }

    // Validate MIME type
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new DocumentUploadError(
            ERROR_CODES.INVALID_TYPE,
            `Invalid file type: ${mimeType}. Allowed types: PDF, TXT, CSV, XLS, XLSX`
        );
    }

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
        throw new DocumentUploadError(
            ERROR_CODES.STORAGE,
            `Storage upload failed: ${storageError.message}`
        );
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

        // Clean up storage if DB insert fails (rollback)
        console.log(`Attempting rollback: removing storage file at ${storagePath}`);
        try {
            const { error: removeError } = await supabase.storage
                .from('project-files')
                .remove([storagePath]);

            if (removeError) {
                console.error("Rollback failed - could not remove storage file:", removeError);
            } else {
                console.log("Rollback successful - storage file removed");
            }
        } catch (rollbackError) {
            console.error("Rollback exception:", rollbackError);
        }

        throw new DocumentUploadError(
            ERROR_CODES.DATABASE,
            `Database error: ${dbError.message}`,
            true // rolledBack flag
        );
    }

    // 3. Trigger Extraction Process (Background)
    // Trigger is now handled by Supabase Edge Function listening to DB changes or status
    // or we just leave it as 'pending' and the edge function picks it up.
    
    return document;
}

export async function deleteDocumentService(documentId: string, userId: string) {
    const supabase = await createClient();

    // 1. Fetch document (including storage_path)
    // RLS ensures we can only select if we are a member of the project
    const { data: document, error: fetchError } = await supabase
        .from("documents")
        .select("id, storage_path")
        .eq("id", documentId)
        .single();

    if (fetchError || !document) {
        throw new Error("Document not found");
    }

    const storagePath = document.storage_path;

    // 2. Delete from DB FIRST (cascade deletes chunks via FK)
    const { error: deleteError, count } = await supabase
        .from("documents")
        .delete({ count: 'exact' })
        .eq("id", documentId);

    if (deleteError) {
        throw new Error(`Database error: ${deleteError.message}`);
    }

    if (count === 0) {
        throw new Error("Failed to delete document: Permission denied or not found");
    }

    // 3. Delete from Storage AFTER DB success
    // If this fails, we have orphaned storage file (acceptable - can clean up later)
    // But we do NOT have orphaned DB record (critical - avoided)
    if (storagePath) {
        try {
            const { error: storageError } = await supabase.storage
                .from('project-files')
                .remove([storagePath]);

            if (storageError) {
                console.warn(`Storage cleanup failed for ${storagePath}: ${storageError.message}`);
                // Log but don't throw - DB record is already deleted
            }
        } catch (e) {
            console.warn(`Storage cleanup exception for ${storagePath}:`, e);
            // Log but don't throw
        }
    }

    return true;
}

