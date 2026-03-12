export type UserIntent = 'data' | 'question' | 'modification' | 'confirmation';

/**
 * Employee type for bonus calculations
 */
export type EmployeeType = 'fachkraft' | 'assistenz';

/**
 * Allowances breakdown for result display
 */
export interface AllowancesBreakdown {
  /** Tax-free allowances (§3b EStG) */
  taxFree: {
    night: number;
    sunday: number;
    holiday: number;
  };
  /** Taxable allowances (added to gross before tax calculation) */
  taxable: {
    shiftChange: number;
    qualifications: number;
    performance: number;
    jumpIn: number;
  };
  /** Total monthly allowances */
  total: number;
  /** Human-readable breakdown for display */
  breakdown: string[];
}

/**
 * One-time bonuses for new employees
 */
export interface OneTimeBonuses {
  switchBonus?: { total: number; schedule: string };
  welcomeBonus?: { total: number; schedule: string };
}

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
      // DRK-specific fields (dynamic based on BonusConfig)
      employeeType?: EmployeeType;    // Pflegefachkraft or Pflegeassistenz
      nightShifts?: number;           // Night shifts per month
      lateShifts?: number;            // Late shifts per month
      weekendDays?: number;           // Weekend days worked per month
      jumpInFrequency?: number;       // Average jump-ins per month
      qualifications?: string[];      // ['wundmanager', 'praxisanleiter', ...]
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
      // DRK-specific: Allowances breakdown
      allowances?: AllowancesBreakdown;
      oneTimeBonuses?: OneTimeBonuses;
      nettoWithAllowances?: number;
      [key: string]: any;
    };
  };
  missingFields: string[];
  // Conversation tracking (US-003, US-019)
  conversationContext?: string[];
  userIntent?: UserIntent;
  validationErrors?: Record<string, string>;
  // RAG citations for admin traceability (Phase 11)
  ragCitations?: Array<{
    documentId: string;
    documentName: string;
    pages: string | null;
    similarity: number;
  }>;
}

/**
 * Calculation result type (extracted from FormState for reuse)
 */
export type CalculationResult = NonNullable<FormState['data']['calculation_result']>;

/**
 * Chat API response structure.
 * Returned by /api/chat endpoint.
 * Note: formState is no longer sent to the client — only section for UI rendering.
 */
export interface ChatResponse {
  text: string;
  section?: 'job_details' | 'tax_details' | 'summary' | 'completed';
  inquiryId?: string;
  suggestions?: string[];
  progress?: number;
}
