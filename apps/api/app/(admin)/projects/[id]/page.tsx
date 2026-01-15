
import { createClient } from '@/utils/supabase/server';
import DocumentManager from '@/components/DocumentManager';
import Link from 'next/link';

export default async function ProjectDetailsPage({ params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;
    const supabase = await createClient();

    // Fetch Project Details
    const { data: project, error: projectError } = await supabase
        .from('projects')
        .select('*')
        .eq('id', id)
        .single();
    
    if (projectError || !project) {
        return <div>Project not found</div>;
    }

    // Fetch Documents
    const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .eq('project_id', id)
        .order('created_at', { ascending: false });

    return (
        <div className="max-w-4xl mx-auto">
             <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                     <Link href="/projects" className="text-gray-500 hover:text-gray-700">
                        &larr; Back
                    </Link>
                    <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                        {project.name}
                    </h1>
                </div>
                 <span className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-mono">
                    {project.public_key}
                </span>
            </div>

            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow mb-8">
                <h2 className="text-lg font-semibold mb-4 text-gray-800 dark:text-gray-100">Configuration</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-gray-500">Public Key</label>
                        <code className="block mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded border dark:border-gray-700 text-sm break-all">
                            {project.public_key}
                        </code>
                    </div>
                     <div>
                        <label className="block text-sm font-medium text-gray-500">Allowed Origins</label>
                         <code className="block mt-1 p-2 bg-gray-50 dark:bg-gray-900 rounded border dark:border-gray-700 text-sm">
                            {project.allowed_origins && project.allowed_origins.length > 0 
                                ? project.allowed_origins.join(', ')
                                : 'All origins allowed (Development)'
                            }
                        </code>
                    </div>
                </div>
            </div>

            <DocumentManager projectId={id} documents={documents || []} />
            
        </div>
    );
}
