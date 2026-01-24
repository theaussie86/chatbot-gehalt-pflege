'use client';

import { useState, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { uploadDocumentAction, deleteDocumentAction, createDocumentRecordAction } from '@/app/actions/documents';
import { createClient } from '@/utils/supabase/client';

// Files larger than 1MB use direct browser upload to bypass Next.js server action limit
const DIRECT_UPLOAD_THRESHOLD = 1 * 1024 * 1024;
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
// Download icon component
const DownloadIcon = ({ className }: { className?: string }) => (
    <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
);

// Status badge icons (14x14)
const ClockIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const SpinnerIcon = () => (
    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
);

const CheckCircleIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

const XCircleIcon = () => (
    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
);

// Status badge component with icon + text
const StatusBadge = ({ status, processingStage }: { status: 'pending' | 'processing' | 'embedded' | 'error'; processingStage?: string | null }) => {
    const configs: Record<string, { icon: React.ReactElement; text: string; bgColor: string; textColor: string; pulse?: boolean }> = {
        pending: {
            icon: <ClockIcon />,
            text: 'Pending',
            bgColor: 'bg-slate-100',
            textColor: 'text-slate-600'
        },
        processing: {
            icon: <SpinnerIcon />,
            text: 'Processing',
            bgColor: 'bg-sky-100',
            textColor: 'text-sky-700',
            pulse: true
        },
        embedded: {
            icon: <CheckCircleIcon />,
            text: 'Embedded',
            bgColor: 'bg-emerald-100',
            textColor: 'text-emerald-700'
        },
        error: {
            icon: <XCircleIcon />,
            text: 'Error',
            bgColor: 'bg-rose-100',
            textColor: 'text-rose-700'
        }
    };

    const config = configs[status];

    return (
        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${config.bgColor} ${config.textColor} ${config.pulse ? 'animate-pulse' : ''}`}>
            {config.icon}
            {config.text}
            {status === 'processing' && processingStage && (
                <span className="text-sky-600 ml-0.5">({processingStage})</span>
            )}
        </span>
    );
};

// Filter chips component
const FilterChips = ({
    activeFilters,
    onToggle,
    statusCounts,
    totalCount
}: {
    activeFilters: Set<string>;
    onToggle: (status: string) => void;
    statusCounts: { pending: number; processing: number; embedded: number; error: number };
    totalCount: number;
}) => {
    const chips = [
        { key: 'all', label: 'All', count: totalCount, color: 'gray' },
        { key: 'pending', label: 'Pending', count: statusCounts.pending, color: 'slate' },
        { key: 'processing', label: 'Processing', count: statusCounts.processing, color: 'sky' },
        { key: 'embedded', label: 'Embedded', count: statusCounts.embedded, color: 'emerald' },
        { key: 'error', label: 'Error', count: statusCounts.error, color: 'rose' }
    ];

    const getChipClasses = (key: string, color: string) => {
        const isActive = key === 'all' ? activeFilters.size === 0 : activeFilters.has(key);

        if (isActive) {
            const activeColors: Record<string, string> = {
                gray: 'bg-gray-100 border-gray-300 text-gray-700',
                slate: 'bg-slate-100 border-slate-300 text-slate-700',
                sky: 'bg-sky-100 border-sky-300 text-sky-700',
                emerald: 'bg-emerald-100 border-emerald-300 text-emerald-700',
                rose: 'bg-rose-100 border-rose-300 text-rose-700'
            };
            return `${activeColors[color]} font-medium`;
        }

        return 'border-gray-300 text-gray-600 hover:border-gray-400 bg-white';
    };

    return (
        <div className="flex flex-wrap gap-2 mb-4">
            {chips.map(chip => (
                <button
                    key={chip.key}
                    onClick={() => onToggle(chip.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${getChipClasses(chip.key, chip.color)}`}
                >
                    {chip.label}
                    <span className="font-semibold">({chip.count})</span>
                </button>
            ))}
        </div>
    );
};

// Document details panel component
const DocumentDetailsPanel = ({
    document,
    onDownload,
    onDelete,
}: {
    document: Document;
    onDownload: () => void;
    onDelete: () => void;
}) => {
    const formatDate = (dateString: string) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    return (
        <div className="space-y-6 py-4">
            {/* Filename */}
            <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100 break-words">
                    {document.filename}
                </h3>
            </div>

            {/* Status */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Status</p>
                <StatusBadge status={document.status} processingStage={document.processing_stage} />
            </div>

            {/* Chunk Count (only for embedded documents) */}
            {document.status === 'embedded' && document.chunk_count != null && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Chunks</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                        {document.chunk_count} chunks created
                    </p>
                </div>
            )}

            {/* Upload Date */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Uploaded</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {formatDate(document.created_at)}
                </p>
            </div>

            {/* MIME Type */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">File Type</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {document.mime_type}
                </p>
            </div>

            {/* Project Association */}
            <div className="space-y-2">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Project</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {document.project_id || 'Global'}
                </p>
            </div>

            {/* Error Details (only if status is error) */}
            {document.status === 'error' && document.error_details && (
                <div className="space-y-2">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Error Details</p>
                    <div className="bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg p-4 space-y-2">
                        {document.error_details.message && (
                            <p className="text-sm text-rose-700 dark:text-rose-300 font-medium">
                                {document.error_details.message}
                            </p>
                        )}
                        {document.error_details.code && (
                            <p className="text-xs text-rose-600 dark:text-rose-400">
                                <span className="font-medium">Code:</span> {document.error_details.code}
                            </p>
                        )}
                        {document.error_details.stage && (
                            <p className="text-xs text-rose-600 dark:text-rose-400">
                                <span className="font-medium">Failed at:</span> {document.error_details.stage}
                            </p>
                        )}
                        {document.error_details.timestamp && (
                            <p className="text-xs text-rose-600 dark:text-rose-400">
                                <span className="font-medium">Time:</span> {formatDate(document.error_details.timestamp)}
                            </p>
                        )}
                    </div>
                </div>
            )}

            {/* Action Buttons */}
            <div className="pt-4 border-t dark:border-gray-700 flex gap-2">
                <Button
                    onClick={onDownload}
                    variant="outline"
                    className="flex-1"
                >
                    Download
                </Button>
                <Button
                    onClick={onDelete}
                    variant="destructive"
                    className="flex-1"
                >
                    Delete
                </Button>
            </div>
        </div>
    );
};

interface Document {
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    project_id?: string | null;
    storage_path?: string;
    status: 'pending' | 'processing' | 'embedded' | 'error';
    chunk_count?: number | null;
    processing_stage?: string | null;
    error_details?: {
        code?: string;
        message?: string;
        timestamp?: string;
        stage?: string;
        details?: any;
    } | null;
}

interface DocumentManagerProps {
    projectId?: string; // Optional: If provided, filters uploads to this project. If null, global.
    documents: Document[];
}

export default function DocumentManager({ projectId, documents }: DocumentManagerProps) {
    const router = useRouter();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Local documents state for realtime updates
    const [localDocuments, setLocalDocuments] = useState<Document[]>(documents);

    // Batch upload state
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
    const [currentFileName, setCurrentFileName] = useState('');

    // Drag-drop state
    const [isDragActive, setIsDragActive] = useState(false);

    // Failed files tracking for retry
    const [failedFiles, setFailedFiles] = useState<File[]>([]);

    // Filter state
    const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

    // Selected document for details panel
    const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);

    // Checkbox selection state
    const [selectedDocuments, setSelectedDocuments] = useState<Set<string>>(new Set());

    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        type: 'delete' | 'reprocess';
        documentId: string;
    }>({ isOpen: false, type: 'delete', documentId: '' });

    // Bulk delete state
    const [isBulkDeleteOpen, setIsBulkDeleteOpen] = useState(false);
    const [isBulkDeleting, setIsBulkDeleting] = useState(false);

    // URL cache with expiry tracking
    const [urlCache, setUrlCache] = useState<Map<string, { url: string, expiresAt: number }>>(new Map());

    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");

    // Sync localDocuments when props change
    useEffect(() => {
        setLocalDocuments(documents);
    }, [documents]);

    // Set up Supabase realtime subscription
    useEffect(() => {
        const supabase = createClient();

        const channel = supabase
            .channel('documents-changes')
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'documents'
                },
                (payload) => {
                    const updated = payload.new as Document;

                    // Update local state
                    setLocalDocuments(prev =>
                        prev.map(doc => doc.id === updated.id ? { ...doc, ...updated } : doc)
                    );

                    // Update selected document if it's the one that changed
                    setSelectedDocument(prev =>
                        prev?.id === updated.id ? { ...prev, ...updated } : prev
                    );

                    // Show toast notification for status changes
                    if (updated.status === 'embedded') {
                        toast.success(`"${updated.filename}" processing complete`);
                    } else if (updated.status === 'error') {
                        toast.error(`"${updated.filename}" processing failed`);
                    } else if (updated.status === 'processing') {
                        toast.info(`"${updated.filename}" is now processing`);
                    }
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'documents'
                },
                (payload) => {
                    const deleted = payload.old as { id: string };
                    setLocalDocuments(prev => prev.filter(doc => doc.id !== deleted.id));
                    // Close panel if deleted document was selected
                    setSelectedDocument(prev => prev?.id === deleted.id ? null : prev);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'documents'
                },
                (payload) => {
                    const newDoc = payload.new as Document;
                    // Prepend new document to list
                    setLocalDocuments(prev => [newDoc, ...prev]);
                    toast.info(`New document: "${newDoc.filename}"`);
                }
            )
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, []);

    // Compute status counts
    const statusCounts = useMemo(() => {
        const counts = { pending: 0, processing: 0, embedded: 0, error: 0 };
        localDocuments.forEach(doc => {
            if (doc.status in counts) counts[doc.status as keyof typeof counts]++;
        });
        return counts;
    }, [localDocuments]);

    // Compute filtered documents
    const filteredDocuments = useMemo(() => {
        if (activeFilters.size === 0) return localDocuments;
        return localDocuments.filter(doc => activeFilters.has(doc.status));
    }, [localDocuments, activeFilters]);

    // Toggle filter handler
    const handleFilterToggle = (status: string) => {
        if (status === 'all') {
            setActiveFilters(new Set());
        } else {
            setActiveFilters(prev => {
                const newFilters = new Set(prev);
                if (newFilters.has(status)) {
                    newFilters.delete(status);
                } else {
                    newFilters.add(status);
                }
                return newFilters;
            });
        }
    };

    // Selection helpers
    const toggleSelection = (docId: string) => {
        setSelectedDocuments(prev => {
            const next = new Set(prev);
            if (next.has(docId)) {
                next.delete(docId);
            } else {
                next.add(docId);
            }
            return next;
        });
    };

    const toggleSelectAll = () => {
        if (selectedDocuments.size === filteredDocuments.length) {
            setSelectedDocuments(new Set());
        } else {
            setSelectedDocuments(new Set(filteredDocuments.map(d => d.id)));
        }
    };

    const isAllSelected = filteredDocuments.length > 0 &&
        selectedDocuments.size === filteredDocuments.length;
    const isSomeSelected = selectedDocuments.size > 0 && !isAllSelected;

    // Drag handlers
    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(true);
    };

    const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
    };

    const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);

        const files = Array.from(e.dataTransfer.files);
        if (files.length > 0) {
            await processFiles(files);
        }
    };

    const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = Array.from(e.target.files || []);
        if (files.length > 0) {
            await processFiles(files);
        }
    };

    const handleDropZoneClick = () => {
        document.getElementById('file-input')?.click();
    };

    // Retry upload for a single file
    async function retryUpload(file: File) {
        const toastId = toast.loading(`Retrying ${file.name}...`);

        let result: { error?: string; code?: string; rolledBack?: boolean; success?: boolean };

        if (file.size > DIRECT_UPLOAD_THRESHOLD) {
            // Large file: direct browser upload
            result = await uploadDirectToBrowser(file);
        } else {
            // Small file: server action
            const singleFormData = new FormData();
            singleFormData.append('file', file);
            if (projectId) {
                singleFormData.append('projectId', projectId);
            }
            result = await uploadDocumentAction(singleFormData);
        }

        if (result.error) {
            showErrorToast(file, result, toastId);
        } else {
            toast.success(`${file.name} uploaded successfully`, { id: toastId });
            // Remove from failed files
            setFailedFiles(prev => prev.filter(f => f !== file));
            router.refresh();
        }
    }

    // Retry all failed uploads
    async function retryAllFailed() {
        const filesToRetry = [...failedFiles];
        setFailedFiles([]);

        for (const file of filesToRetry) {
            await retryUpload(file);
        }
    }

    // Show error toast with rollback message and retry button
    function showErrorToast(file: File, result: any, existingToastId?: string | number) {
        const toastId = existingToastId || toast.loading('Upload failed. Cleaning up...');

        // Brief delay to show cleanup message (rollback already happened server-side)
        setTimeout(() => {
            const errorMessage = result.rolledBack
                ? `${result.error} (${result.code}). File removed.`
                : `${result.error} (${result.code})`;

            toast.error(errorMessage, {
                id: toastId,
                action: {
                    label: 'Retry',
                    onClick: () => retryUpload(file)
                },
                duration: 10000
            });
        }, 500);
    }

    // Process multiple files sequentially
    async function processFiles(files: File[]) {
        setIsUploading(true);
        setUploadError(null);
        setTotalFiles(files.length);
        setCompletedFiles(0);

        let successCount = 0;
        const newFailedFiles: File[] = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            setCurrentFileName(file.name);
            setCompletedFiles(i);

            let result: { error?: string; code?: string; rolledBack?: boolean; success?: boolean };

            if (file.size > DIRECT_UPLOAD_THRESHOLD) {
                // Large file: upload directly to Supabase Storage, then create DB record
                result = await uploadDirectToBrowser(file);
            } else {
                // Small file: use server action (includes file in request body)
                const singleFormData = new FormData();
                singleFormData.append('file', file);
                if (projectId) {
                    singleFormData.append('projectId', projectId);
                }
                result = await uploadDocumentAction(singleFormData);
            }

            if (result.error) {
                newFailedFiles.push(file);
                showErrorToast(file, result);
            } else {
                successCount++;
            }
        }

        setCompletedFiles(files.length);

        if (successCount > 0) {
            toast.success(`${successCount} of ${files.length} document(s) uploaded successfully`);
            router.refresh();
        }

        // Update failed files list
        setFailedFiles(prev => [...prev, ...newFailedFiles]);

        // Reset state
        setIsUploading(false);
        setTotalFiles(0);
        setCompletedFiles(0);
        setCurrentFileName('');

        // Reset file input
        const fileInput = document.getElementById('file-input') as HTMLInputElement;
        if (fileInput) {
            fileInput.value = '';
        }
    }

    async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        const form = e.currentTarget;
        const fileInput = form.elements.namedItem('file') as HTMLInputElement;
        const files = Array.from(fileInput.files || []);

        if (files.length === 0) {
            setUploadError("Please select at least one file.");
            return;
        }

        await processFiles(files);
    }

    // Direct browser upload for large files (bypasses Next.js server action size limit)
    async function uploadDirectToBrowser(file: File): Promise<{ error?: string; code?: string; rolledBack?: boolean; success?: boolean }> {
        const supabase = createClient();
        const folder = projectId || 'global';
        const storagePath = `${folder}/${file.name}`;

        // 1. Upload directly to Supabase Storage
        const { error: storageError } = await supabase.storage
            .from('project-files')
            .upload(storagePath, file, {
                upsert: true,
                contentType: file.type
            });

        if (storageError) {
            return {
                error: `Storage upload failed: ${storageError.message}`,
                code: 'ERR_STORAGE'
            };
        }

        // 2. Create DB record via server action (handles rollback if DB fails)
        const result = await createDocumentRecordAction(
            storagePath,
            file.name,
            file.type || 'application/pdf',
            projectId || null
        );

        return result;
    }

    const openDeleteConfirm = (docId: string) => {
        setConfirmState({ isOpen: true, type: 'delete', documentId: docId });
    };

    const openReprocessConfirm = (docId: string) => {
        setConfirmState({ isOpen: true, type: 'reprocess', documentId: docId });
    };

    const handleConfirmAction = async () => {
        setConfirmState(prev => ({ ...prev, isOpen: false }));
        const { type, documentId } = confirmState;

        if (type === 'delete') {
            const result = await deleteDocumentAction(documentId, projectId || '');
            if (result.error) {
                toast.error(`Error deleting document: ${result.error}`);
            } else {
                toast.success("Document deleted successfully");
                router.refresh();
            }
        } else if (type === 'reprocess') {
            const { reprocessDocumentAction } = await import('@/app/actions/documents');
            const toastId = toast.loading("Triggering reprocessing...");
            try {
                const res = await reprocessDocumentAction(documentId);
                if (res.error) {
                    toast.error(`Reprocessing failed: ${res.error}`, { id: toastId });
                } else {
                    toast.success("Reprocessing triggered successfully.", { id: toastId });
                    router.refresh();
                }
            } catch (e: any) {
                 toast.error(`Reprocessing error: ${e.message}`, { id: toastId });
            }
        }
    };

    // Handle view (open in new tab)
    const handleView = async (doc: Document) => {
        const cached = urlCache.get(doc.id);
        if (cached && cached.expiresAt > Date.now()) {
            window.open(cached.url, '_blank');
            return;
        }

        const { getDocumentDownloadUrlAction } = await import('@/app/actions/documents');
        const result = await getDocumentDownloadUrlAction(doc.id);
        if (result.url) {
            setUrlCache(prev => new Map(prev).set(doc.id, { url: result.url, expiresAt: result.expiresAt }));
            window.open(result.url, '_blank');
        } else if (result.error?.includes('expired')) {
            toast.error('Link expired. Click to generate new link.', {
                action: { label: 'Refresh', onClick: () => handleView(doc) }
            });
        } else {
            toast.error(result.error || "Failed to get URL");
        }
    };

    // Handle download (direct download with filename)
    const handleDownload = async (doc: Document) => {
        const { getDocumentDownloadUrlAction } = await import('@/app/actions/documents');
        const result = await getDocumentDownloadUrlAction(doc.id);
        if (result.url) {
            // Fetch as blob to enable cross-origin download with filename
            try {
                const response = await fetch(result.url);
                const blob = await response.blob();
                const blobUrl = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = blobUrl;
                link.download = doc.filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(blobUrl);
            } catch (error) {
                toast.error("Failed to download file");
            }
        } else {
            toast.error(result.error || "Failed to get download URL");
        }
    };
    
    const handleFeedbackSubmit = () => {
        // Implement feedback submission logic here
        console.log("Feedback submitted:", feedbackText);
        setFeedbackText("");
        setIsFeedbackOpen(false);
        toast.success("Your feedback has been received. Thank you!");
    };

    const handleBulkDelete = async () => {
        setIsBulkDeleting(true);
        const toastId = toast.loading(`Deleting ${selectedDocuments.size} documents...`);

        try {
            const { bulkDeleteDocumentsAction } = await import('@/app/actions/documents');
            const result = await bulkDeleteDocumentsAction(Array.from(selectedDocuments));

            if (result.success) {
                toast.success(`Successfully deleted ${result.successCount} documents`, { id: toastId });
            } else {
                toast.warning(
                    `Deleted ${result.successCount}, failed ${result.failCount}`,
                    { id: toastId }
                );
            }

            setSelectedDocuments(new Set());
            setIsBulkDeleteOpen(false);
            router.refresh();
        } catch (error: any) {
            toast.error(`Bulk delete failed: ${error.message}`, { id: toastId });
        } finally {
            setIsBulkDeleting(false);
        }
    };

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mt-6 relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                    {projectId ? "Project Documents" : "All Documents"}
                </h2>
                <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.refresh()}>
                        Refresh List
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setIsFeedbackOpen(true)}>
                        Feedback
                    </Button>
                </div>
            </div>
            
            <div className="mb-6">
                {localDocuments.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 italic">No documents found.</p>
                ) : (
                    <>
                        <FilterChips
                            activeFilters={activeFilters}
                            onToggle={handleFilterToggle}
                            statusCounts={statusCounts}
                            totalCount={localDocuments.length}
                        />

                        {/* Bulk actions toolbar */}
                        {selectedDocuments.size > 0 && (
                            <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg p-3 mb-4">
                                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                                    {selectedDocuments.size} document{selectedDocuments.size !== 1 ? 's' : ''} selected
                                </span>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => setSelectedDocuments(new Set())}
                                    >
                                        Clear selection
                                    </Button>
                                    <Button
                                        variant="destructive"
                                        size="sm"
                                        onClick={() => setIsBulkDeleteOpen(true)}
                                    >
                                        Delete selected
                                    </Button>
                                </div>
                            </div>
                        )}
                        {filteredDocuments.length === 0 ? (
                            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                                <p className="mb-2">No documents match the selected filters.</p>
                                <button
                                    onClick={() => setActiveFilters(new Set())}
                                    className="text-blue-600 hover:underline text-sm"
                                >
                                    Clear filters
                                </button>
                            </div>
                        ) : (
                            <>
                                {/* Select all header */}
                                <div className="flex items-center gap-2 py-2 border-b border-gray-200 dark:border-gray-700">
                                    <input
                                        type="checkbox"
                                        checked={isAllSelected}
                                        ref={(el) => {
                                            if (el) el.indeterminate = isSomeSelected;
                                        }}
                                        onChange={toggleSelectAll}
                                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                    />
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                        {selectedDocuments.size > 0
                                            ? `${selectedDocuments.size} selected`
                                            : `${filteredDocuments.length} documents`}
                                    </span>
                                </div>

                                <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                                    {filteredDocuments.map(doc => (
                                <li
                                    key={doc.id}
                                    onClick={() => setSelectedDocument(doc)}
                                    className="py-3 flex justify-between items-center group cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors duration-300 px-2 -mx-2 rounded"
                                >
                                    <div className="flex items-center space-x-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedDocuments.has(doc.id)}
                                            onChange={(e) => {
                                                e.stopPropagation();
                                                toggleSelection(doc.id);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
                                    </svg>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleView(doc);
                                                }}
                                                className="font-medium text-gray-900 dark:text-gray-200 hover:text-blue-600 hover:underline text-left"
                                            >
                                                {doc.filename}
                                            </button>
                                            <StatusBadge status={doc.status} processingStage={doc.processing_stage} />
                                        </div>
                                        <div className="flex gap-2 items-center mt-1">
                                            <p suppressHydrationWarning className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                                            {!projectId && doc.project_id && (
                                                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 rounded">Project: {doc.project_id}</span>
                                            )}
                                            {!projectId && !doc.project_id && (
                                                <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 rounded">Global</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            handleDownload(doc);
                                        }}
                                        className="text-gray-400 hover:text-blue-600 p-1"
                                        title="Download file"
                                    >
                                        <DownloadIcon className="w-5 h-5" />
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openReprocessConfirm(doc.id);
                                        }}
                                        disabled={doc.status === 'processing'}
                                        className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Reprocess Embeddings"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            openDeleteConfirm(doc.id);
                                        }}
                                        className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Delete Document"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                        </svg>
                                    </button>
                                </div>
                            </li>
                                    ))}
                                </ul>
                            </>
                        )}
                    </>
                )}
            </div>

            <div className="border-t pt-4 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload Documents</h3>

                {/* Failed files summary */}
                {failedFiles.length > 0 && (
                    <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm text-red-700 dark:text-red-300">
                                    {failedFiles.length} file(s) failed to upload
                                </span>
                            </div>
                            <div className="flex gap-2">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={retryAllFailed}
                                    className="text-red-700 border-red-300 hover:bg-red-100 dark:text-red-300 dark:border-red-700 dark:hover:bg-red-900/30"
                                >
                                    Retry All
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setFailedFiles([])}
                                    className="text-gray-600 dark:text-gray-400"
                                >
                                    Dismiss
                                </Button>
                            </div>
                        </div>
                        <ul className="mt-2 ml-7 text-xs text-red-600 dark:text-red-400 space-y-1">
                            {failedFiles.map((file, idx) => (
                                <li key={idx}>{file.name}</li>
                            ))}
                        </ul>
                    </div>
                )}

                {/* Drag-drop zone */}
                <div
                    onClick={handleDropZoneClick}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    className={`
                        relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
                        transition-colors duration-200
                        ${isDragActive
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
                        }
                        ${isUploading ? 'pointer-events-none opacity-75' : ''}
                    `}
                >
                    {/* Hidden file input */}
                    <input
                        id="file-input"
                        type="file"
                        multiple
                        accept="application/pdf,text/plain,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        onChange={handleFileInputChange}
                        className="hidden"
                    />

                    {isUploading ? (
                        <div className="space-y-3">
                            <div className="text-blue-600 dark:text-blue-400 font-medium">
                                Uploading {completedFiles + 1} of {totalFiles}: {currentFileName}
                            </div>
                            {/* Progress bar */}
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5 overflow-hidden">
                                <div
                                    className="bg-blue-600 h-2.5 transition-all duration-300"
                                    style={{ width: `${(completedFiles / totalFiles) * 100}%` }}
                                />
                            </div>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                {completedFiles} of {totalFiles} completed
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            <svg
                                className="mx-auto h-12 w-12 text-gray-400"
                                stroke="currentColor"
                                fill="none"
                                viewBox="0 0 48 48"
                                aria-hidden="true"
                            >
                                <path
                                    d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                                    strokeWidth={2}
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                />
                            </svg>
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                                <span className="font-semibold text-blue-600 dark:text-blue-400">Click to browse</span> or drag and drop
                            </div>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                                PDF, TXT, CSV, XLS, XLSX (max 50MB per file)
                            </p>
                        </div>
                    )}
                </div>

                {uploadError && (
                    <p className="text-red-500 text-sm mt-2">{uploadError}</p>
                )}
            </div>

            {/* Confirmation Dialog (Action) */}
            <AlertDialog open={confirmState.isOpen} onOpenChange={(open) => setConfirmState(prev => ({ ...prev, isOpen: open }))}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                        <AlertDialogDescription>
                            {confirmState.type === 'delete'
                                ? `Delete "${localDocuments.find(d => d.id === confirmState.documentId)?.filename}"? This will remove the file and all embeddings. This action cannot be undone.`
                                : "This will clear all existing embeddings for this document and regenerate them. This process might take a while."
                            }
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleConfirmAction} className={confirmState.type === 'delete' ? "bg-red-600 hover:bg-red-700" : ""}>
                            {confirmState.type === 'delete' ? "Delete" : "Reprocess"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Feedback Dialog */}
             <Dialog open={isFeedbackOpen} onOpenChange={setIsFeedbackOpen}>
                <DialogContent className="sm:max-w-[425px]">
                    <DialogHeader>
                        <DialogTitle>Send Feedback</DialogTitle>
                        <DialogDescription>
                            We'd love to hear your thoughts. Please share your feedback below.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                            <Label htmlFor="feedback">Your Feedback</Label>
                            <Textarea
                                id="feedback"
                                value={feedbackText}
                                onChange={(e) => setFeedbackText(e.target.value)}
                                placeholder="Type your message here..."
                                className="min-h-[100px]"
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button onClick={handleFeedbackSubmit}>Submit Feedback</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Document Details Sheet */}
            <Sheet open={!!selectedDocument} onOpenChange={(open) => !open && setSelectedDocument(null)}>
                <SheetContent className="w-[400px] sm:w-[540px]">
                    <SheetHeader>
                        <SheetTitle>Document Details</SheetTitle>
                        <SheetDescription>View document information and status</SheetDescription>
                    </SheetHeader>
                    {selectedDocument && (
                        <DocumentDetailsPanel
                            document={selectedDocument}
                            onDownload={() => {
                                handleDownload(selectedDocument);
                            }}
                            onDelete={() => {
                                openDeleteConfirm(selectedDocument.id);
                                setSelectedDocument(null);
                            }}
                        />
                    )}
                </SheetContent>
            </Sheet>

            {/* Bulk Delete Confirmation Dialog */}
            <AlertDialog open={isBulkDeleteOpen} onOpenChange={setIsBulkDeleteOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete {selectedDocuments.size} documents?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the selected documents and all their embeddings.
                            This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isBulkDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBulkDelete}
                            disabled={isBulkDeleting}
                            className="bg-red-600 hover:bg-red-700"
                        >
                            {isBulkDeleting ? 'Deleting...' : `Delete ${selectedDocuments.size} documents`}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
