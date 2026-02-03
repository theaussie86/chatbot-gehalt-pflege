import React from 'react';

interface SuggestionChipsProps {
  suggestions: string[];
  onSelect: (text: string, chipRef?: DOMRect) => void;
  isTyping: boolean; // True when user has typed something manually
  disabled?: boolean; // True when loading/sending
}

export const SuggestionChips: React.FC<SuggestionChipsProps> = ({
  suggestions,
  onSelect,
  isTyping,
  disabled = false
}) => {
  // Don't render if no suggestions
  if (!suggestions || suggestions.length === 0) {
    return null;
  }

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>, suggestion: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    onSelect(suggestion, rect);
  };

  return (
    <div
      className={`
        flex flex-wrap gap-2 px-4 pb-2
        transition-opacity duration-200
        ${isTyping ? 'opacity-40' : 'opacity-100'}
      `}
    >
      {suggestions.map((suggestion, index) => (
        <button
          key={`${suggestion}-${index}`}
          onClick={(e) => !disabled && handleClick(e, suggestion)}
          disabled={disabled}
          className={`
            px-4 py-2
            min-h-[44px] min-w-[44px]
            text-sm font-medium
            rounded-full
            border border-[var(--primary-border)]
            bg-white
            text-[var(--primary-color)]
            shadow-sm
            transition-all duration-150
            ${disabled
              ? 'opacity-50 cursor-not-allowed'
              : 'hover:bg-[var(--primary-light-hover)] hover:border-[var(--primary-color)] active:scale-95 cursor-pointer'
            }
          `}
        >
          {suggestion}
        </button>
      ))}
    </div>
  );
};
