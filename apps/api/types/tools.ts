import { z } from 'zod';
import {
  tariffLookupSchema,
  taxCalculateSchema,
} from '../utils/agent/toolSchemas';

/**
 * TypeScript types inferred from Zod schemas
 * Single source of truth - types always match validation
 */

// Inferred input types from Zod schemas
export type TariffLookupInput = z.infer<typeof tariffLookupSchema>;
export type TaxCalculateInput = z.infer<typeof taxCalculateSchema>;

// Tool result types
export interface TariffLookupResult {
  success: boolean;
  grossSalary?: number;
  monthlyGross?: number;
  group: string;
  stufe: string;
  tarif: string;
  error?: ToolError;
}

export interface TaxCalculateResult {
  success: boolean;
  netto?: number;
  taxes?: {
    lohnsteuer: number;
    soli: number;
    kirchensteuer: number;
  };
  socialSecurity?: {
    kv: number;
    rv: number;
    av: number;
    pv: number;
  };
  error?: ToolError;
}

/**
 * Structured error for AI retry context
 * Includes field, error message, received value, and suggestion for correction
 */
export interface ToolError {
  field: string;
  error: string;
  received?: unknown;
  suggestion?: string;
}

// Union type for all tool results
export type ToolResult = TariffLookupResult | TaxCalculateResult;
