
'use client'

import { useState } from 'react'

export default function EmbedCodePage() {
  const [copied, setCopied] = useState(false)
  // Assuming production URL/path. This structure might need adjustment based on final build.
  // Ideally, this comes from an env var or the build pipeline in production.
  const defaultScriptUrl = 'https://your-domain.com/widget.js' 

  const embedCode = `<script src="${defaultScriptUrl}" type="module"></script>`

  const handleCopy = () => {
    navigator.clipboard.writeText(embedCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Embed Code</h2>
      <p className="text-gray-600 dark:text-gray-300 mb-6">
        Copy the code below and paste it into the HTML of your website, just before the closing <code>&lt;/body&gt;</code> tag.
      </p>

      <div className="relative">
        <pre className="bg-gray-100 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto border dark:border-gray-700">
          <code className="text-sm text-gray-800 dark:text-gray-200 font-mono">
            {embedCode}
          </code>
        </pre>
        <button
          onClick={handleCopy}
          className="absolute top-2 right-2 px-3 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>

      <div className="mt-8 p-4 bg-yellow-50 rounded-md border border-yellow-200 dark:bg-yellow-900/20 dark:border-yellow-900">
        <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200 mb-2">Note</h4>
        <p className="text-sm text-yellow-700 dark:text-yellow-300">
          Make sure to replace <code>{defaultScriptUrl}</code> with the actual URL where your widget script is hosted after deployment.
        </p>
      </div>
    </div>
  )
}
