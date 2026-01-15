
import { createClient } from '@/utils/supabase/server';
import DocumentManager from '@/components/DocumentManager';
import Link from 'next/link';

export default async function DocumentsPage() {
    const supabase = await createClient();

    // Fetch All Documents for the user (Global + Assigned)
    const { data: documents } = await supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

    return (
        <div className="max-w-4xl mx-auto">
             <div className="flex items-center justify-between mb-6">
                 <h1 className="text-2xl font-bold text-gray-800 dark:text-white">
                    Document Management
                </h1>
            </div>

            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg mb-8 border border-blue-100 dark:border-blue-800">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                    <strong>Note:</strong> Documents uploaded here without a Project assignment will be considered 
                    <strong> Global</strong> and may be used by <em>any</em> of your chatbots as context.
                </p>
            </div>

            <DocumentManager documents={documents || []} />
            
        </div>
    );
}
