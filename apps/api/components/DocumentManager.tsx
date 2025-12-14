'use client';

import { useState } from 'react';
import { uploadDocumentAction, deleteDocumentAction } from '@/app/actions/documents';

interface Document {
    id: string;
    filename: string;
    mime_type: string;
    created_at: string;
    project_id?: string | null;
}

interface DocumentManagerProps {
    projectId?: string; // Optional: If provided, filters uploads to this project. If null, global.
    documents: Document[];
}

export default function DocumentManager({ projectId, documents }: DocumentManagerProps) {
    const [isUploading, setIsUploading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
        e.preventDefault();
        setIsUploading(true);
        setError(null);

        const form = e.currentTarget;
        const formData = new FormData(form);
        
        if (projectId) {
            formData.append('projectId', projectId);
        }

        // Basic client-side validation
        const file = formData.get('file') as File;
        if (!file || file.size === 0) {
            setError("Please select a file.");
            setIsUploading(false);
            return;
        }

        const result = await uploadDocumentAction(formData);

        if (result.error) {
            setError(result.error);
        } else {
            form.reset();
        }
        setIsUploading(false);
    }

    async function handleDelete(documentId: string) {
        if (!confirm("Are you sure you want to delete this document?")) return;
        
        const result = await deleteDocumentAction(documentId, projectId || '');
        if (result.error) {
            alert(result.error);
        }
    }

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mt-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-800 dark:text-gray-100">
                {projectId ? "Project Documents" : "All Documents"}
            </h2>
            
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
                                        <div className="flex gap-2">
                                            <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()}</p>
                                            {!projectId && doc.project_id && (
                                                <span className="text-xs bg-blue-100 text-blue-800 px-1.5 rounded">Project: {doc.project_id}</span>
                                            )}
                                            {!projectId && !doc.project_id && (
                                                <span className="text-xs bg-yellow-100 text-yellow-800 px-1.5 rounded">Global</span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDelete(doc.id)}
                                    className="text-gray-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-opacity"
                                    title="Delete Document"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                    </svg>
                                </button>
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
                         {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
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
        </div>
    );
}
