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