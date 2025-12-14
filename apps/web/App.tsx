import React, { useState, useEffect, useRef } from 'react';
import { Send, RefreshCw, MessageSquare } from 'lucide-react';
import { Message, Sender, SalaryResultData } from './types';
import { sendMessageToGemini, initializeChat } from './services/gemini';
import { MessageBubble } from './components/MessageBubble';
import { ProgressBar } from './components/ProgressBar';

const INITIAL_MESSAGE_TEXT = "Hallo! Ich helfe dir dabei, dein TVöD-Gehalt zu berechnen. Das Formular kann kompliziert sein, aber wir gehen das Schritt für Schritt durch. \n\nMöchtest du ein Gehalt für den normalen TVöD (VKA/Bund) oder für den Pflegebereich (P-Tabelle) berechnen?";
const INITIAL_OPTIONS = ["TVöD VKA (Kommunen)", "TVöD Bund", "Pflege (P-Tabelle)"];

interface AppProps {
    config?: {
        projectId?: string;
        apiEndpoint?: string;
        theme?: {
            primaryColor?: string;
        };
    }
}

export default function App({ config }: AppProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'init-1',
      text: INITIAL_MESSAGE_TEXT,
      sender: Sender.BOT,
      timestamp: new Date(),
      options: INITIAL_OPTIONS
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Theme configuration
  const primaryColor = config?.theme?.primaryColor || '#2563eb'; // Default blue-600
  
  const themeStyles = {
    '--primary-color': primaryColor,
    '--primary-hover': `color-mix(in srgb, ${primaryColor}, black 10%)`,
    '--primary-light': `color-mix(in srgb, ${primaryColor}, white 90%)`, // bg-blue-100 equivalent
    '--primary-light-hover': `color-mix(in srgb, ${primaryColor}, white 95%)`, // bg-blue-50 equivalent
    '--primary-border': `color-mix(in srgb, ${primaryColor}, white 70%)`, // border-blue-200 equivalent
    '--primary-ring': `color-mix(in srgb, ${primaryColor}, white 50%)`,
    '--primary-text': primaryColor,
  } as React.CSSProperties;

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial focus and config
  useEffect(() => {
    // Start the chat session with config
    // Note: We use 'projectId' (Public Key) here. 
    // Secure 'Gemini API Key' is NEVER passed here.
    const projectId = config?.projectId || import.meta.env.VITE_PROJECT_ID || ''; 
    const apiEndpoint = config?.apiEndpoint || import.meta.env.VITE_API_ENDPOINT || 'http://localhost:3000/api/chat';

    initializeChat({ projectId, apiEndpoint });
    inputRef.current?.focus();
  }, [config]);

  const parseResponse = (text: string): { cleanText: string; newProgress: number | null; resultData: SalaryResultData | null, options: string[] | undefined } => {
    let cleanText = text;
    let newProgress = null;
    let resultData = null;
    let options: string[] | undefined = undefined;

    // 1. Extract Progress Tag: [PROGRESS: 50]
    const progressMatch = cleanText.match(/\[PROGRESS:\s*(\d+)\]/);
    if (progressMatch) {
      newProgress = parseInt(progressMatch[1], 10);
      cleanText = cleanText.replace(progressMatch[0], '');
    }

    // 2. Extract Options Tag: [OPTIONS: ["A", "B"]]
    const optionsMatch = cleanText.match(/\[OPTIONS:\s*(\[.*?\])\]/);
    if (optionsMatch) {
        try {
            // Using JSON.parse requires strict JSON format (double quotes). 
            // The model is instructed to provide valid JSON arrays.
            options = JSON.parse(optionsMatch[1]);
            cleanText = cleanText.replace(optionsMatch[0], '');
        } catch (e) {
            console.error("Failed to parse options JSON", e);
        }
    }

    // 3. Extract JSON Result Tag: [JSON_RESULT: {...}]
    const jsonMatch = cleanText.match(/\[JSON_RESULT:\s*(\{.*\})\]/);
    if (jsonMatch) {
      try {
        resultData = JSON.parse(jsonMatch[1]);
        cleanText = cleanText.replace(jsonMatch[0], '');
      } catch (e) {
        console.error("Failed to parse result JSON", e);
      }
    }

    return { cleanText: cleanText.trim(), newProgress, resultData, options };
  };

  const handleSendMessage = async (textOverride?: string) => {
    const textToSend = textOverride || inputValue;
    
    if (!textToSend.trim() || isLoading) return;

    setInputValue('');
    setIsLoading(true);

    // Add user message
    const newUserMsg: Message = {
      id: Date.now().toString(),
      text: textToSend,
      sender: Sender.USER,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newUserMsg]);

    try {
      // Get AI response
      const rawResponse = await sendMessageToGemini(textToSend, messages);
      
      const { cleanText, newProgress, resultData, options } = parseResponse(rawResponse);

      if (newProgress !== null) {
        setProgress(newProgress);
      }

      const newBotMsg: Message = {
        id: (Date.now() + 1).toString(),
        text: cleanText,
        sender: Sender.BOT,
        timestamp: new Date(),
        resultData: resultData || undefined,
        options: options
      };

      setMessages((prev) => [...prev, newBotMsg]);

    } catch (error) {
      console.error("Error sending message", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleReset = () => {
    if(window.confirm("Möchtest du den Chat neu starten? Alle Eingaben gehen verloren.")) {
        window.location.reload();
    }
  }

  if (!config?.projectId) {
      return (
          <div className="flex flex-col h-full w-full bg-red-50 text-red-800 p-6 items-center justify-center text-center border-x border-red-200" style={{fontFamily: 'Inter, sans-serif'}}>
              <div className="p-3 bg-red-100 rounded-full mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
              </div>
              <h2 className="text-lg font-bold mb-2">Konfigurationsfehler</h2>
              <p className="text-sm">
                  Es wurde keine <strong>Project ID</strong> übergeben. 
              </p>
              <p className="text-xs mt-4 text-red-600 font-mono bg-red-100 p-2 rounded">
                  window.chatbot('init', &#123; projectId: 'YOUR_ID' &#125;)
              </p>
          </div>
      );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50 overflow-hidden relative border-x border-slate-200" style={themeStyles}>
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg text-white bg-[var(--primary-color)]">
                <MessageSquare size={20} />
            </div>
            <div>
                <h1 className="font-bold text-slate-800 leading-tight">Pflege Gehalt Chatbot</h1>
                <p className="text-xs text-slate-500">Dein Assistent für den öffentlichen Dienst</p>
            </div>
        </div>
        <button 
            onClick={handleReset}
            className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
            title="Neu starten"
        >
            <RefreshCw size={20} />
        </button>
      </header>

      {/* Progress Bar Area */}
      <div className="bg-white px-6 pt-4 pb-1 border-b border-slate-100">
        <div className="flex justify-between text-xs font-medium text-slate-500 mb-1">
            <span>Fortschritt</span>
            <span>{progress}%</span>
        </div>
        <ProgressBar progress={progress} />
      </div>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-slate-50 scrollbar-hide">
        {messages.map((msg) => (
          <MessageBubble 
            key={msg.id} 
            message={msg} 
            onOptionSelected={(opt) => handleSendMessage(opt)}
          />
        ))}
        
        {/* Loading Indicator */}
        {isLoading && (
          <div className="flex justify-start mb-6">
             <div className="flex flex-row items-center gap-3">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[var(--primary-light)]">
                    <div className="w-2 h-2 rounded-full animate-bounce bg-[var(--primary-color)]" style={{ animationDelay: '0ms' }}></div>
                </div>
                <span className="text-xs text-slate-400 animate-pulse">Schreibt...</span>
             </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white p-4 border-t border-slate-200">
        <div className="relative flex items-end gap-2 bg-slate-100 p-2 pr-2 rounded-3xl border border-transparent focus-within:bg-white focus-within:ring-4 transition-all focus-within:border-[var(--primary-ring)] focus-within:ring-[var(--primary-light)]">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-slate-800 placeholder:text-slate-400 max-h-32 resize-none outline-none"
            placeholder="Antworte hier..."
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            onClick={() => handleSendMessage()}
            disabled={!inputValue.trim() || isLoading}
            className={`p-3 rounded-full flex-shrink-0 transition-all duration-200 ${
              inputValue.trim() && !isLoading
                ? 'text-white shadow-md transform hover:scale-105 bg-[var(--primary-color)] hover:bg-[var(--primary-hover)]' 
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Send size={20} />
          </button>
        </div>
        <div className="text-center mt-2">
            <p className="text-[10px] text-slate-400">
                AI kann Fehler machen. Überprüfe wichtige Infos.
            </p>
        </div>
      </footer>
    </div>
  );
}