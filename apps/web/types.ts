export interface SalaryResultData {
  brutto: number;
  netto: number;
  steuer: number;
  sozialabgaben: number;
  jahr: string;
  gruppe: string;
  stufe: number | string;
  tarif: string;
}

export enum Sender {
  USER = 'user',
  BOT = 'bot'
}

export interface Message {
  id: string;
  text: string;
  sender: Sender;
  timestamp: Date;
  isLoading?: boolean;
  resultData?: SalaryResultData; // Optional, only present if parsing extracted JSON
  options?: string[]; // New: Suggested quick replies
}

export interface ChatState {
  messages: Message[];
  progress: number;
  isLoading: boolean;
}

// FormState type (duplicated from API app for widget independence)
export interface FormState {
  section: 'job_details' | 'tax_details' | 'summary' | 'completed';
  data: {
    job_details?: Record<string, any>;
    tax_details?: Record<string, any>;
    calculation_result?: Record<string, any>;
  };
  missingFields: string[];
  conversationContext?: string[];
  userIntent?: string;
  validationErrors?: Record<string, string>;
}

// Default initial formState that the state machine expects
export const DEFAULT_FORM_STATE: FormState = {
  section: 'job_details',
  data: {
    job_details: {},
    tax_details: {},
  },
  missingFields: ['tarif', 'group', 'experience', 'hours', 'state'],
};