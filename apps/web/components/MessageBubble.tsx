import React from 'react';
import { Message, Sender } from '../types';
import { Bot, User } from 'lucide-react';
import { SalaryResult } from './SalaryResult';
import { DoiConsentForm } from './DoiConsentForm';

interface MessageBubbleProps {
  message: Message;
  onOptionSelected?: (option: string) => void;
  doiFormProps?: {
    onSubmit: (email: string) => void;
    isLoading: boolean;
    isSubmitted: boolean;
  };
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ message, onOptionSelected, doiFormProps }) => {
  const isBot = message.sender === Sender.BOT;

  return (
    <div className={`flex w-full mb-6 ${isBot ? 'justify-start' : 'justify-end'}`}>
      <div className={`flex max-w-[85%] md:max-w-[70%] ${isBot ? 'flex-row' : 'flex-row-reverse'} items-start gap-3`}>
        
        {/* Avatar */}
        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
            isBot ? 'bg-[var(--primary-light)] text-[var(--primary-color)]' : 'bg-slate-200 text-slate-600'
        }`}>
            {isBot ? <Bot size={18} /> : <User size={18} />}
        </div>

        {/* Content */}
        <div className="flex flex-col">
            <div
            className={`p-4 rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap ${
                isBot 
                ? 'bg-white text-slate-800 rounded-tl-none border border-slate-100' 
                : 'bg-[var(--primary-color)] text-white rounded-tr-none'
            }`}
            >
            {message.text}
            </div>

            {/* Display Result Card if data is present */}
            {message.resultData && (
                <SalaryResult data={message.resultData} />
            )}

            {/* Display DOI consent form if flagged */}
            {message.showDoiForm && doiFormProps && (
                <DoiConsentForm {...doiFormProps} />
            )}

            {/* Display Options/Quick Replies */}
            {message.options && message.options.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3 animate-fade-in">
                    {message.options.map((option, idx) => (
                        <button
                            key={idx}
                            onClick={() => onOptionSelected && onOptionSelected(option)}
                            className="px-4 py-2 bg-white border border-[var(--primary-border)] text-[var(--primary-color)] text-sm rounded-full hover:bg-[var(--primary-light-hover)] hover:border-[var(--primary-color)] transition-colors shadow-sm active:scale-95"
                        >
                            {option}
                        </button>
                    ))}
                </div>
            )}

            {/* Timestamp */}
            <span className={`text-[10px] text-slate-400 mt-1 ${isBot ? 'text-left' : 'text-right'}`}>
                {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
        </div>
      </div>
    </div>
  );
};