import type { ZodError } from 'zod';
import { tariffLookupSchema, taxCalculateSchema, TOOL_NAMES } from './toolSchemas';
import { executeTariffLookup, executeTaxCalculate } from './tools';
import type { ToolError, ToolResult } from '../../types/tools';

const MAX_RETRIES = 3;

interface ExecutionContext {
  retryCount: number;
  errors: ToolError[];
}

interface ToolExecutionResult {
  success: boolean;
  result?: ToolResult;
  error?: ToolError;
  shouldRetry: boolean;
  retryCount: number;
  userMessage?: string;
}

/**
 * ToolExecutor handles validation, execution, and retry logic for AI tools
 */
export class ToolExecutor {
  private executionContexts: Map<string, ExecutionContext> = new Map();

  /**
   * Execute a tool call with Zod validation
   * Returns structured result with retry guidance for AI
   */
  async execute(
    toolName: string,
    args: unknown,
    sessionId: string = 'default'
  ): Promise<ToolExecutionResult> {
    const contextKey = `${sessionId}:${toolName}`;
    let context = this.executionContexts.get(contextKey);

    if (!context) {
      context = { retryCount: 0, errors: [] };
      this.executionContexts.set(contextKey, context);
    }

    // Check retry limit
    if (context.retryCount >= MAX_RETRIES) {
      return {
        success: false,
        shouldRetry: false,
        retryCount: context.retryCount,
        userMessage: 'Ich konnte das nicht berechnen. Bitte ueberpruefe deine Eingaben und versuche es erneut.',
        error: {
          field: 'max_retries',
          error: `Maximale Versuche (${MAX_RETRIES}) erreicht`,
          suggestion: 'Starte einen neuen Berechnungsversuch',
        },
      };
    }

    // Validate and execute based on tool name
    let result: ToolResult;
    let validationError: ToolError | undefined;

    switch (toolName) {
      case TOOL_NAMES.TARIFF_LOOKUP: {
        const parsed = tariffLookupSchema.safeParse(args);
        if (!parsed.success) {
          validationError = this.zodErrorToToolError(parsed.error);
          context.retryCount++;
          context.errors.push(validationError);
          return {
            success: false,
            error: validationError,
            shouldRetry: context.retryCount < MAX_RETRIES,
            retryCount: context.retryCount,
          };
        }
        result = executeTariffLookup(parsed.data);
        break;
      }

      case TOOL_NAMES.TAX_CALCULATE: {
        const parsed = taxCalculateSchema.safeParse(args);
        if (!parsed.success) {
          validationError = this.zodErrorToToolError(parsed.error);
          context.retryCount++;
          context.errors.push(validationError);
          return {
            success: false,
            error: validationError,
            shouldRetry: context.retryCount < MAX_RETRIES,
            retryCount: context.retryCount,
          };
        }
        result = executeTaxCalculate(parsed.data);
        break;
      }

      default:
        return {
          success: false,
          error: {
            field: 'toolName',
            error: `Unbekanntes Werkzeug: ${toolName}`,
            suggestion: `Verwende ${TOOL_NAMES.TARIFF_LOOKUP} oder ${TOOL_NAMES.TAX_CALCULATE}`,
          },
          shouldRetry: false,
          retryCount: context.retryCount,
        };
    }

    // Check tool execution result
    if (!result.success && result.error) {
      context.retryCount++;
      context.errors.push(result.error);
      return {
        success: false,
        result,
        error: result.error,
        shouldRetry: context.retryCount < MAX_RETRIES,
        retryCount: context.retryCount,
      };
    }

    // Success - reset context for this tool
    this.executionContexts.delete(contextKey);

    return {
      success: true,
      result,
      shouldRetry: false,
      retryCount: context.retryCount,
    };
  }

  /**
   * Convert Zod validation error to ToolError format
   */
  private zodErrorToToolError(error: ZodError): ToolError {
    const firstIssue = error.issues[0];
    const field = firstIssue.path.join('.');

    return {
      field: field || 'unknown',
      error: firstIssue.message,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      received: (firstIssue as any).received,
      suggestion: this.getSuggestionForField(field, firstIssue.code),
    };
  }

  /**
   * Generate helpful suggestions based on field and error type
   */
  private getSuggestionForField(field: string, _code: string): string {
    const suggestions: Record<string, string> = {
      tarif: 'Verwende tvoed, tv-l, oder avr',
      group: 'Verwende P5-P15 fuer Pflege oder E5-E15 fuer allgemein',
      stufe: 'Stufe muss zwischen 1 und 6 liegen',
      taxClass: 'Steuerklasse muss zwischen 1 und 6 liegen',
      year: 'Jahr muss 2025 oder 2026 sein',
      churchTax: 'Verwende none, church_tax_8, oder church_tax_9',
      state: 'Verwende west, east, oder sachsen',
      hours: 'Stunden pro Woche (z.B. 38.5 fuer Vollzeit)',
      yearlySalary: 'Jahresgehalt in Euro (positiver Wert)',
    };

    return suggestions[field] || `Ueberpruefe den Wert fuer ${field}`;
  }

  /**
   * Reset retry context for a session (e.g., when starting new calculation)
   */
  resetContext(sessionId: string = 'default'): void {
    for (const key of this.executionContexts.keys()) {
      if (key.startsWith(sessionId)) {
        this.executionContexts.delete(key);
      }
    }
  }

  /**
   * Build error context message for AI retry
   * Includes previous errors to help AI correct its approach
   */
  buildErrorContextForAI(sessionId: string, toolName: string): string {
    const context = this.executionContexts.get(`${sessionId}:${toolName}`);
    if (!context || context.errors.length === 0) {
      return '';
    }

    const errorLines = context.errors.map((e, i) =>
      `Versuch ${i + 1}: Feld "${e.field}" - ${e.error}${e.suggestion ? ` (${e.suggestion})` : ''}`
    );

    return `\n\nVorherige Fehler bei ${toolName}:\n${errorLines.join('\n')}`;
  }
}

// Singleton instance for shared state across requests
export const toolExecutor = new ToolExecutor();
