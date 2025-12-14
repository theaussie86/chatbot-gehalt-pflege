'use client';

import { Project } from '@/app/actions/projects';
import Script from 'next/script';
import { useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    chatbot: (command: string, params?: any) => void;
  }
}

export default function TestWidgetView({ projects }: { projects: Project[] }) {
  const [widgetUrl, setWidgetUrl] = useState(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [isReady, setIsReady] = useState(false);
  const [key, setKey] = useState(0); // Force re-render of Script

  const selectedProject = projects.find(p => p.id === selectedProjectId);

  // Function to initialize widget
  const initWidget = () => {
    if (window.chatbot && selectedProject) {
      console.log('Initializing widget for', selectedProject.name);
      window.chatbot('init', {
        target: '#chatbot-widget-container',
        projectId: selectedProject.public_key,
      });
      setIsReady(true);
    } else {
      console.error('Widget script loaded but window.chatbot is not defined or no project selected.');
    }
  };

  const handleReload = () => {
    setIsReady(false);
    // Clearing the container is important because the widget might have appended elements
    const container = document.getElementById('chatbot-widget-container');
    if (container) container.innerHTML = '';
    
    // Force Script component to remount
    setKey(prev => prev + 1);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Widget</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Test the chatbot widget in a safe environment. Select a project to preview its chatbot.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
           <div>
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Select Project
             </label>
             <select
               value={selectedProjectId}
               onChange={(e) => setSelectedProjectId(e.target.value)}
               className="w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
             >
               <option value="" disabled>Select a project</option>
               {projects.map(p => (
                 <option key={p.id} value={p.id}>
                   {p.name || 'Untitled'} ({p.public_key.slice(0, 8)}...)
                 </option>
               ))}
             </select>
           </div>
           
           <div>
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Widget Script URL
             </label>
             <div className="flex gap-2">
               <input 
                type="text" 
                value={widgetUrl} 
                onChange={(e) => setWidgetUrl(e.target.value)} 
                className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
                placeholder="Widget Script URL"
               />
               <button
                 onClick={handleReload}
                 className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
               >
                 Reload
               </button>
             </div>
           </div>
        </div>

        <div className="p-4 border border-gray-200 rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900 min-h-[600px] relative">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Simulated Host Page</h3>
            
            {selectedProjectId && (
              <Script 
                src={widgetUrl} 
                onLoad={initWidget}
                key={`${widgetUrl}-${key}`}
              />
            )}

             <div id="chatbot-widget-container" className="h-full w-full">
               {!selectedProjectId && (
                 <div className="h-full flex items-center justify-center text-gray-400">
                   Please select a project to load the widget.
                 </div>
               )}
             </div>
             
             {selectedProjectId && !isReady && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-gray-400 text-sm">Waiting for widget to load...</span>
               </div>
             )}
        </div>
      </div>
    </div>
  );
}
