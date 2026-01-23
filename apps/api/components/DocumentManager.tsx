'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { uploadDocumentAction, deleteDocumentAction } from '@/app/actions/documents';
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
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge"; // Ensure this exists or use inline styles if not

interface Document {
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    project_id?: string | null;
    storage_path?: string;
    status: 'pending' | 'processing' | 'embedded' | 'error';
}

interface DocumentManagerProps {
    projectId?: string; // Optional: If provided, filters uploads to this project. If null, global.
    documents: Document[];
}

export default function DocumentManager({ projectId, documents }: DocumentManagerProps) {
    const router = useRouter();
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    // Batch upload state
    const [totalFiles, setTotalFiles] = useState(0);
    const [completedFiles, setCompletedFiles] = useState(0);
    const [currentFileName, setCurrentFileName] = useState('');

    // Drag-drop state
    const [isDragActive, setIsDragActive] = useState(false);

    // Failed files tracking for retry
    const [failedFiles, setFailedFiles] = useState<File[]>([]);

    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        type: 'delete' | 'reprocess';
        documentId: string;
    }>({ isOpen: false, type: 'delete', documentId: '' });

    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");

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
        const singleFormData = new FormData();
        singleFormData.append('file', file);
        if (projectId) {
            singleFormData.append('projectId', projectId);
        }

        const toastId = toast.loading(`Retrying ${file.name}...`);
        const result = await uploadDocumentAction(singleFormData);

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

            const singleFormData = new FormData();
            singleFormData.append('file', file);
            if (projectId) {
                singleFormData.append('projectId', projectId);
            }

            const result = await uploadDocumentAction(singleFormData);

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

    const handleDownload = async (doc: Document) => {
        const { getDocumentDownloadUrlAction } = await import('@/app/actions/documents');
        const result = await getDocumentDownloadUrlAction(doc.id);
        if (result.url) {
            window.open(result.url, '_blank');
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

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'embedded': return 'bg-green-100 text-green-800 hover:bg-green-100';
            case 'processing': return 'bg-blue-100 text-blue-800 hover:bg-blue-100 animate-pulse';
            case 'error': return 'bg-red-100 text-red-800 hover:bg-red-100';
            default: return 'bg-gray-100 text-gray-800 hover:bg-gray-100';
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
                 {documents.length === 0 ? (
                    <p className="text-gray-500 dark:text-gray-400 italic">No documents found.</p>
                ) : (
                    <ul className="divide-y divide-gray-200 dark:divide-gray-700">
                        {documents.map(doc => (
                            <li key={doc.id} className="py-3 flex justify-between items-center group">
                                <div className="flex items-center space-x-3">
                                    <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 2H7a2 2 0 00-2 2v15a2 2 0 002 2z" />
                                    </svg>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <p className="font-medium text-gray-900 dark:text-gray-200">{doc.filename}</p>
                                            <Badge className={getStatusColor(doc.status)} variant="secondary">
                                                {doc.status || 'unknown'}
                                            </Badge>
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
                                        {/* Download Link */}
                                        {doc.storage_path && (
                                            <button
                                                onClick={() => handleDownload(doc)}
                                                className="text-xs text-blue-600 hover:text-blue-800 underline mt-1 block"
                                            >
                                                Download PDF
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={() => openReprocessConfirm(doc.id)}
                                        disabled={doc.status === 'processing'}
                                        className="text-gray-400 hover:text-blue-600 disabled:opacity-30 disabled:cursor-not-allowed opacity-0 group-hover:opacity-100 transition-opacity"
                                        title="Reprocess Embeddings"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                                        </svg>
                                    </button>
                                    <button 
                                        onClick={() => openDeleteConfirm(doc.id)}
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
                                ? "This action cannot be undone. This will permanently delete the document."
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
        </div>
    );
}
