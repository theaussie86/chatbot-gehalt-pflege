
'use client'

import { useState } from 'react'

export default function TestWidgetPage() {
  const [widgetUrl, setWidgetUrl] = useState('http://localhost:5173/assets/index.js') // Default Vite dev output, adjust as needed

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Widget</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-4">
          Test the chatbot widget in a safe environment. Ensure the widget development server is running.
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

        <div className="p-4 border border-gray-200 rounded-lg dark:border-gray-700 bg-gray-50 dark:bg-gray-900 min-h-[400px] relative">
            <h3 className="text-sm font-medium text-gray-500 mb-2">Simulated Host Page</h3>
             <script src={widgetUrl} type="module"></script>
             {/* 
                We rely on the script injecting the widget. 
                If the widget requires a specific container, add it here.
                Usually widgets inject into body or a specific ID.
             */}
             <div id="chatbot-widget-container"></div>
        </div>
      </div>
    </div>
  )
}
