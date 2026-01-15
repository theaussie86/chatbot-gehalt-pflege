'use client';

import { useState } from 'react';
import { uploadDocumentAction, deleteDocumentAction } from '@/app/actions/documents';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
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

interface Document {
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    project_id?: string | null;
    storage_path?: string;
}

interface DocumentManagerProps {
    projectId?: string; // Optional: If provided, filters uploads to this project. If null, global.
    documents: Document[];
}

export default function DocumentManager({ projectId, documents }: DocumentManagerProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const [confirmState, setConfirmState] = useState<{
        isOpen: boolean;
        type: 'delete' | 'reprocess';
        documentId: string;
    }>({ isOpen: false, type: 'delete', documentId: '' });

    const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);
    const [feedbackText, setFeedbackText] = useState("");

    async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsUploading(true);
        setUploadError(null);

        const form = e.currentTarget;
        const formData = new FormData(form);
        
        if (projectId) {
            formData.append('projectId', projectId);
        }

        // Basic client-side validation
        const file = formData.get('file') as File;
        if (!file || file.size === 0) {
            setUploadError("Please select a file.");
            setIsUploading(false);
            return;
        }

        const result = await uploadDocumentAction(formData);

        if (result.error) {
           setUploadError(result.error);
           toast.error(result.error);
        } else {
            form.reset();
            toast.success("Document uploaded successfully");
        }
        setIsUploading(false);
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
            }
        } else if (type === 'reprocess') {
            const { reprocessDocumentAction } = await import('@/app/actions/documents');
            const toastId = toast.loading("Reprocessing document...");
            try {
                const res = await reprocessDocumentAction(documentId);
                if (res.error) {
                    toast.error(`Reprocessing failed: ${res.error}`, { id: toastId });
                } else {
                    toast.success(`Success! Generated ${res.count} chunks.`, { id: toastId });
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

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mt-6 relative">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                    {projectId ? "Project Documents" : "All Documents"}
                </h2>
                <Button variant="outline" size="sm" onClick={() => setIsFeedbackOpen(true)}>
                    Feedback
                </Button>
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
                                        <p className="font-medium text-gray-900 dark:text-gray-200">{doc.filename}</p>
                                        <div className="flex gap-2 items-center">
                                            <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
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
                                        className="text-gray-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity"
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
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Upload New Document (PDF)</h3>
                <form onSubmit={handleUpload} className="flex gap-2 items-start">
                     <div className="flex-1">
                        <input 
                            type="file" 
                            name="file" 
                            accept="application/pdf"
                            required
                            className="block w-full text-sm text-gray-500 dark:text-gray-300
                                file:mr-4 file:py-2 file:px-4
                                file:rounded-full file:border-0
                                file:text-sm file:font-semibold
                                file:bg-blue-50 file:text-blue-700
                                hover:file:bg-blue-100
                                dark:file:bg-gray-700 dark:file:text-white
                            "
                        />
                         {uploadError && <p className="text-red-500 text-xs mt-1">{uploadError}</p>}
                    </div>
                    <button 
                        type="submit" 
                        disabled={isUploading}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                    >
                        {isUploading ? 'Uploading...' : 'Upload'}
                    </button>
                </form>
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
