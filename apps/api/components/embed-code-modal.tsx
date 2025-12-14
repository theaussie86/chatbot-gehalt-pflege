'use client';

import { Project } from '@/app/actions/projects';
import { useState } from 'react';

type EmbedCodeModalProps = {
  project: Project;
  onClose: () => void;
};

export default function EmbedCodeModal({ project, onClose }: EmbedCodeModalProps) {
  const [primaryColor, setPrimaryColor] = useState('#2563eb');
  const [copied, setCopied] = useState(false);

  const widgetUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`;

  const embedCode = `
<script src="${widgetUrl}" defer></script>
<script>
  window.addEventListener('load', function() {
    if (window.chatbot) {
      window.chatbot('init', {
        target: '#chatbot-inline-container',
        projectId: '${project.public_key}',
        theme: {
          primaryColor: '${primaryColor}',
        },
      });
    }
  });
</script>
<div id="chatbot-inline-container" style="width: 100%; height: 600px; min-height: 500px; border: 1px solid #e2e8f0; border-radius: 8px;"></div>
`.trim();

  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="flex justify-between items-center p-4 border-b dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Embed Code for {project.name}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <p className="text-gray-600 dark:text-gray-300 mb-6">
            Customize the look of your chatbot and copy the code below to embed it on your website.
          </p>

          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Primary Color</label>
            <div className="flex items-center gap-3">
              <input 
                type="color" 
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-20 p-1 rounded border border-gray-300 cursor-pointer"
              />
              <span className="text-sm font-mono text-gray-600 dark:text-gray-400">{primaryColor}</span>
            </div>
          </div>

          <div className="relative">
            <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-all">
              {embedCode}
            </pre>
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 px-3 py-1 bg-indigo-600 text-white text-sm rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
            >
              {copied ? 'Copied!' : 'Copy Code'}
            </button>
          </div>
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
