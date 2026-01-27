import React, { useState } from 'react';
import { Mail, Check, AlertCircle, Loader2 } from 'lucide-react';

interface DoiConsentFormProps {
  onSubmit: (email: string) => void;
  isLoading: boolean;
  isSubmitted: boolean;
}

export const DoiConsentForm: React.FC<DoiConsentFormProps> = ({
  onSubmit,
  isLoading,
  isSubmitted
}) => {
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const [validationError, setValidationError] = useState('');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setValidationError('');

    // Validate email
    if (!email.trim()) {
      setValidationError('Bitte gib eine E-Mail-Adresse ein.');
      return;
    }

    if (!validateEmail(email)) {
      setValidationError('Bitte gib eine gültige E-Mail-Adresse ein.');
      return;
    }

    // Validate consent
    if (!consent) {
      setValidationError('Bitte stimme der Datenschutzerklärung zu.');
      return;
    }

    onSubmit(email);
  };

  // Success state
  if (isSubmitted && !error) {
    return (
      <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 text-green-600">
          <div className="flex-shrink-0 w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
            <Check size={20} />
          </div>
          <div>
            <p className="font-medium">E-Mail wurde gesendet!</p>
            <p className="text-sm text-slate-600">
              Du solltest dein Ergebnis in Kürze in deinem Posteingang finden.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 p-4 bg-white rounded-xl border border-slate-200 shadow-sm">
      <form onSubmit={handleSubmit}>
        <div className="space-y-4">
          {/* Email input */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-2">
              E-Mail-Adresse
            </label>
            <div className="relative">
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="deine@email.de"
                disabled={isLoading}
                className="w-full px-4 py-3 pl-11 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[var(--primary-color)] focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ minHeight: '44px' }}
              />
              <Mail className="absolute left-3 top-3.5 text-slate-400" size={18} />
            </div>
          </div>

          {/* Consent checkbox */}
          <div className="flex items-start gap-3">
            <input
              id="consent"
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              disabled={isLoading}
              className="mt-1 w-5 h-5 rounded border-slate-300 text-[var(--primary-color)] focus:ring-2 focus:ring-[var(--primary-color)] disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              style={{ minWidth: '20px', minHeight: '20px' }}
            />
            <label htmlFor="consent" className="text-sm text-slate-700 leading-relaxed cursor-pointer">
              Ich stimme zu, dass meine E-Mail-Adresse gespeichert wird und ich per E-Mail kontaktiert werden darf. Die Ergebniszusammenfassung wird an diese Adresse gesendet.
            </label>
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="text-amber-600 flex-shrink-0 mt-0.5" size={18} />
              <p className="text-sm text-amber-800">{validationError}</p>
            </div>
          )}

          {/* Server error */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="text-sm text-red-800">{error}</p>
                <button
                  type="button"
                  onClick={() => setError('')}
                  className="text-xs text-red-600 hover:text-red-800 underline mt-1"
                >
                  Erneut versuchen
                </button>
              </div>
            </div>
          )}

          {/* Submit button */}
          <button
            type="submit"
            disabled={isLoading || !email.trim() || !consent}
            className="w-full px-6 py-3 bg-[var(--primary-color)] text-white font-medium rounded-lg hover:bg-[var(--primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            style={{ minHeight: '44px' }}
          >
            {isLoading ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                <span>Wird gesendet...</span>
              </>
            ) : (
              <>
                <Mail size={18} />
                <span>Ergebnis per E-Mail senden</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};
