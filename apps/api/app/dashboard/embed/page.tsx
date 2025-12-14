'use client'

import { useState } from 'react'

export default function EmbedPage() {
  const widgetUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`
  
  const embedCode = `<!-- Chatbot Widget Embed Code -->
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
