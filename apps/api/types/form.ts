export type UserIntent = 'data' | 'question' | 'modification' | 'confirmation';

export interface FormState {
  section: 'job_details' | 'tax_details' | 'summary' | 'completed';
  data: {
    // Phase 1: Gross Income Logic
    job_details?: {
      tarif?: string;      // TVöD, TV-L, AVR...
      group?: string;      // E1 - E15 or P-Values
      experience?: string; // Stufe 1-6
      hours?: number;      // Weekly hours (e.g. 38.5)
      state?: string;      // Bundesland (for special tariffs)
      [key: string]: any;
    };
    // Phase 2: Net Income Logic
    tax_details?: {
      taxClass?: string;   // 1-6
      churchTax?: boolean | string; // yes/no or specific
      hasChildren?: boolean; // simple check
      childCount?: number;   // optional specifics
      birthYear?: number;    // optional specifics
      numberOfChildren?: number; // number of children
      [key: string]: any;
    };
    // Calculation results
    calculation_result?: {
      brutto?: number;
      netto?: number;
      taxes?: number;
      socialContributions?: number;
      year?: number;
      [key: string]: any;
    };
  };
  missingFields: string[];
  // Conversation tracking (US-003, US-019)
  conversationContext?: string[];
  userIntent?: UserIntent;
  validationErrors?: Record<string, string>;
}
