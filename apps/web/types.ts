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
  resultData?: SalaryResultData;
  options?: string[];
  showDoiForm?: boolean;
}

export interface ChatState {
  messages: Message[];
  progress: number;
  isLoading: boolean;
}

export type SectionType = 'job_details' | 'tax_details' | 'summary' | 'completed';

// Stored conversation — no formState, server owns that
export interface StoredConversation {
  messages: Message[];
  section: SectionType;
  progress: number;
  updatedAt: string;
  sessionId: string;
}
