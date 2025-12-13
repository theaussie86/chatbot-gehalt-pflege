import React, { useState, useEffect, useRef } from 'react';
import { Send, Menu, RefreshCw, MessageSquare } from 'lucide-react';
import { Message, Sender, SalaryResultData } from './types';
import { sendMessageToGemini, initializeChat } from './services/gemini';
import { MessageBubble } from './components/MessageBubble';
import { ProgressBar } from './components/ProgressBar';

const INITIAL_MESSAGE_TEXT = "Hallo! Ich helfe dir dabei, dein TVöD-Gehalt zu berechnen. Das Formular kann kompliziert sein, aber wir gehen das Schritt für Schritt durch. \n\nMöchtest du ein Gehalt für den normalen TVöD (VKA/Bund) oder für den Pflegebereich (P-Tabelle) berechnen?";
const INITIAL_OPTIONS = ["TVöD VKA (Kommunen)", "TVöD Bund", "Pflege (P-Tabelle)"];

export default function App() {
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

  // Auto-scroll to bottom
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Initial focus
  useEffect(() => {
    // Start the chat session in background
    initializeChat();
    inputRef.current?.focus();
  }, []);

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

  return (
    <div className="flex flex-col h-screen bg-slate-50 max-w-2xl mx-auto shadow-2xl overflow-hidden relative border-x border-slate-200">
      
      {/* Header */}
      <header className="bg-white border-b border-slate-200 p-4 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 p-2 rounded-lg text-white">
                <MessageSquare size={20} />
            </div>
            <div>
                <h1 className="font-bold text-slate-800 leading-tight">TVöD Rechner</h1>
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
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                </div>
                <span className="text-xs text-slate-400 animate-pulse">Schreibt...</span>
             </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </main>

      {/* Input Area */}
      <footer className="bg-white p-4 border-t border-slate-200">
        <div className="relative flex items-end gap-2 bg-slate-100 p-2 pr-2 rounded-3xl border border-transparent focus-within:border-blue-300 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100 transition-all">
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent border-none focus:ring-0 px-4 py-3 text-slate-800 placeholder:text-slate-400 max-h-32 resize-none"
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
                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 transform hover:scale-105' 
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