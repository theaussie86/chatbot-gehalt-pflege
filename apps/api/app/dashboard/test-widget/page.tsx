'use client'

import { useState, useEffect, useRef } from 'react'
import Script from 'next/script'

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window {
    chatbot: (command: string, params?: any) => void;
  }
}

export default function TestWidgetPage() {
  // Use a ref to track if the script has loaded to prevent double inits if strict mode is on 
  // though typically checking window.chatbot is enough.
  const [widgetUrl, setWidgetUrl] = useState(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`)
  const [isReady, setIsReady] = useState(false);

  // Function to initialize widget
  const initWidget = () => {
    if (window.chatbot) {
      console.log('Initializing widget...');
      window.chatbot('init', {
        target: '#chatbot-widget-container'
      });
      setIsReady(true);
    } else {
      console.error('Widget script loaded but window.chatbot is not defined.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Widget</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Test the chatbot widget in a safe environment. The widget is loaded from Supabase Storage.
        </p>
        
        <div className="flex gap-4 mb-4">
           <input 
            type="text" 
            value={widgetUrl} 
            onChange={(e) => setWidgetUrl(e.target.value)} 
            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
            placeholder="Widget Script URL"
           />
        </div>

        <div className="p-4 border border-gray-200 rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900 min-h-[600px] relative">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Simulated Host Page</h3>
            
            {/* 
                We use Next.js Script component for better control. 
                strategy="afterInteractive" is default, but "lazyOnload" might be better if we want to ensure hydration first.
                Actually for a test page, standard standard load is fine.
            */}
            <Script 
              src={widgetUrl} 
              onLoad={initWidget}
              // Force re-load if URL changes by using key, though Script component handles src changes usually.
              key={widgetUrl}
            />

             <div id="chatbot-widget-container" className="h-full w-full"></div>
             
             {!isReady && (
               <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                 <span className="text-gray-400 text-sm">Waiting for widget to load...</span>
               </div>
             )}
        </div>
      </div>
    </div>
  )
}
