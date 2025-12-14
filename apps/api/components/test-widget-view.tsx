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

const INITIAL_MESSAGE_TEXT = "Hallo! Ich bin dein Assistent für den TVöD-Pflege Gehaltsrechner. Ich helfe dir, dein Gehalt im Pflegebereich zu schätzen. \n\nFür welches Jahr möchtest du eine Berechnung durchführen?";

export default function TestWidgetView({ projects }: { projects: Project[] }) {
  const [mode, setMode] = useState<'widget' | 'api'>('widget');
  const [widgetUrl, setWidgetUrl] = useState(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/widget-files/widget.js`);
  const [selectedProjectId, setSelectedProjectId] = useState<string>(projects[0]?.id || '');
  const [isReady, setIsReady] = useState(false);
  const [key, setKey] = useState(0); // Force re-render of Script

  // Chat State
  const [messages, setMessages] = useState<any[]>([{
      sender: 'bot',
      text: INITIAL_MESSAGE_TEXT
  }]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

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
  
  const resetChat = () => {
      setMessages([{
          sender: 'bot',
          text: INITIAL_MESSAGE_TEXT
      }]);
  };

  const handleSendMessage = async () => {
    if (!input.trim() || !selectedProject) return;

    const userMsg = { sender: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMsg.text,
          history: messages, // Send history including initial message
          projectId: selectedProject.public_key
        })
      });

      const data = await response.json();
      
      if (data.error) {
         setMessages(prev => [...prev, { sender: 'bot', text: `Error: ${data.error}` }]);
      } else {
         setMessages(prev => [...prev, { sender: 'bot', text: data.text }]);
      }
    } catch (e: any) {
       setMessages(prev => [...prev, { sender: 'bot', text: `Network Error: ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow dark:bg-gray-800">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Test Environment</h2>
        
        {/* Mode Toggle */}
        <div className="flex space-x-4 mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">
            <button
                onClick={() => setMode('widget')}
                className={`py-2 px-4 font-medium text-sm focus:outline-none ${mode === 'widget' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Widget Integration
            </button>
            <button
                onClick={() => setMode('api')}
                className={`py-2 px-4 font-medium text-sm focus:outline-none ${mode === 'api' ? 'text-indigo-600 border-b-2 border-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            >
                Direct API Chat
            </button>
        </div>

        <p className="text-gray-600 dark:text-gray-300 mb-6">
          {mode === 'widget' 
            ? 'Test how the widget embeds and loads on a host page.'
            : 'Test the chatbot logic, prompts, and server responses directly.'}
        </p>

        {/* Project Selector - Common for both modes */}
        <div className="mb-6">
             <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
               Select Project
             </label>
             <select
               value={selectedProjectId}
               onChange={(e) => {
                   setSelectedProjectId(e.target.value);
                   // Reset states when switching project
                   resetChat();
                   setIsReady(false);
               }}
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

        {mode === 'widget' && (
            <div className="grid grid-cols-1 gap-6 mb-6">      
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
        )}

        {mode === 'api' && (
            <div className="border border-gray-200 rounded-lg dark:border-gray-700 flex flex-col h-[600px]">
                {/* Chat History */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 dark:bg-gray-900">
                    {messages.length === 0 && (
                        <div className="text-center text-gray-400 mt-10">No messages yet. Start the conversation.</div>
                    )}
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded-lg p-3 ${
                                msg.sender === 'user' 
                                ? 'bg-indigo-600 text-white' 
                                : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border border-gray-200 dark:border-gray-700 shadow-sm whitespace-pre-wrap'
                            }`}>
                                <div className="text-xs opacity-70 mb-1">{msg.sender === 'user' ? 'You' : 'Bot'}</div>
                                {msg.text}
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                         <div className="flex justify-start">
                            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3 text-gray-500 text-sm">
                                Typing...
                            </div>
                         </div>
                    )}
                </div>

                {/* Input Area */}
                <div className="p-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                            disabled={!selectedProjectId || isLoading}
                            placeholder={selectedProjectId ? "Type a message..." : "Select a project first"}
                            className="flex-1 rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white px-4 py-2"
                        />
                         <button
                            onClick={handleSendMessage}
                            disabled={!selectedProjectId || isLoading || !input.trim()}
                            className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            Send
                        </button>
                        <button
                            onClick={resetChat}
                             className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
                        >
                            Clear
                        </button>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}
