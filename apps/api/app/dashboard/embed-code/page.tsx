'use client'

import { useState } from 'react'

export default function EmbedCodePage() {
  const widgetUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`
  
  const [embedMode, setEmbedMode] = useState<'popup' | 'inline'>('popup')
  
  const embedCode = embedMode === 'popup' 
    ? `<!-- Chatbot Widget Embed Code (Popup Mode) -->
<script src="${widgetUrl}" defer></script>
<script>
  window.addEventListener('load', function() {
    if (window.chatbot) {
      window.chatbot('init', {
         // Optional: You can override default configuration here
         // primaryColor: '#000000',
      });
    }
  });
</script>
<div id="chatbot-widget-container"></div>`
    : `<!-- Chatbot Widget Embed Code (Inline Mode) -->
<script src="${widgetUrl}" defer></script>
<script>
  window.addEventListener('load', function() {
    if (window.chatbot) {
      window.chatbot('init', {
         target: '#chatbot-inline-container',
         // Optional: You can override default configuration here
         // primaryColor: '#000000',
      });
    }
  });
</script>
<div id="chatbot-inline-container" style="width: 100%; height: 600px; min-height: 500px; border: 1px solid #e2e8f0; border-radius: 8px;"></div>`

  const [copied, setCopied] = useState(false)

  const copyToClipboard = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Embed Widget</h2>
        <p className="text-gray-600 dark:text-gray-300 mb-6">
          Copy and paste the code below into your website's HTML, before the closing <code>&lt;/body&gt;</code> tag.
        </p>

        <div className="flex gap-4 mb-6">
          <button
            onClick={() => setEmbedMode('popup')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              embedMode === 'popup'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
            }`}
          >
            Popup Widget
          </button>
          <button
            onClick={() => setEmbedMode('inline')}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              embedMode === 'inline'
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-200'
            }`}
          >
            Inline Embed
          </button>
        </div>
        
        <div className="relative">
          <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto border border-gray-200 dark:border-gray-700 text-sm font-mono text-gray-800 dark:text-gray-200">
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
    </div>
  )
}
