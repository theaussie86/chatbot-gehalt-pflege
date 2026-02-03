import { ZodError } from 'zod';
import type { FormState } from '../../types/form';
import {
  GERMAN_NUMBER_WORDS,
  tarifSchema,
  groupSchema,
  experienceSchema,
  hoursSchema,
  stateSchema,
  taxClassSchema,
  churchTaxSchema,
  numberOfChildrenSchema,
} from './formFieldSchemas';

/**
 * Validation result with user-friendly German error messages
 */
export interface FieldValidationResult {
  valid: boolean;
  normalizedValue?: unknown;
  error?: {
    message: string; // User-friendly German message
    field: string; // Field name
    received: string; // What user provided
    suggestion?: string; // Near-miss suggestion if applicable
    validOptions?: string[]; // List of valid options for chips
  };
  retryCount: number;
  shouldEscalate: boolean; // True after 3 failures -> show chips
}

/**
 * Validation context for retry tracking
 * Persists per session+field combination
 */
export interface ValidationContext {
  retryCount: number;
  lastErrors: string[];
  lastUpdated: number; // Timestamp for TTL-based reset (ms since epoch)
}

/**
 * Field validator service with retry tracking and German error formatting
 *
 * Features:
 * - Two-phase validation: LLM extraction -> Zod validation
 * - Retry tracking with 3-attempt escalation
 * - TTL-based reset (30 min inactivity)
 * - Near-miss suggestions for close invalid values
 * - Cross-field validation (e.g., group depends on tarif)
 */
export class FieldValidator {
  private contexts: Map<string, ValidationContext> = new Map();
  private readonly MAX_RETRIES = 3;
  private readonly CONTEXT_TTL_MS = 30 * 60 * 1000; // 30 minutes

  /**
   * Validate a field value using Zod schema
   *
   * @param field Field name (tarif, taxClass, etc.)
   * @param value Raw value from extraction
   * @param sessionId For retry tracking - use activeProjectId
   * @param formState Optional - required for cross-field validation (e.g., group needs tarif)
   *
   * NOTE: Retry counts automatically reset after CONTEXT_TTL_MS (30 min) of inactivity.
   * This implements "fresh start when user comes back" - retry counts accumulate within
   * an active conversation but reset when user returns after being away.
   */
  validate(field: string, value: unknown, sessionId: string, formState?: FormState): FieldValidationResult {
    const contextKey = `${sessionId}:${field}`;
    const context = this.getContext(contextKey);

    // Check if already at max retries -> escalate with chips
    if (context.retryCount >= this.MAX_RETRIES) {
      return {
        valid: false,
        error: {
          message: 'Kein Problem, das ist manchmal verwirrend. Hier sind die Optionen:',
          field,
          received: String(value),
          validOptions: this.getValidOptions(field),
        },
        retryCount: context.retryCount,
        shouldEscalate: true,
      };
    }

    try {
      // Get schema for field
      const schema = this.getSchema(field);

      // For group field, apply cross-field validation with tarif context
      if (field === 'group' && formState) {
        return this.validateGroup(value, formState, context, contextKey);
      }

      // Parse value with Zod schema
      const result = schema.parse(value);

      // Success: reset context and return normalized value
      this.resetContext(sessionId, field);
      return {
        valid: true,
        normalizedValue: result,
        retryCount: 0,
        shouldEscalate: false,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        // Increment retry count and update timestamp
        context.retryCount++;
        context.lastUpdated = Date.now();
        context.lastErrors.push(error.errors[0]?.message || 'Validation error');
        this.contexts.set(contextKey, context);

        // Format German error message
        const errorMessage = this.formatGermanError(field, error, value);
        const suggestion = this.findNearMiss(field, value);

        return {
          valid: false,
          error: {
            message: errorMessage,
            field,
            received: String(value),
            suggestion,
          },
          retryCount: context.retryCount,
          shouldEscalate: context.retryCount >= this.MAX_RETRIES,
        };
      }

      // Unexpected error: log and fail gracefully
      console.error('[FieldValidator] Unexpected validation error:', error);
      return {
        valid: false,
        error: {
          message: `Hmm, da ist etwas schiefgelaufen. Bitte versuche es noch einmal.`,
          field,
          received: String(value),
        },
        retryCount: context.retryCount,
        shouldEscalate: false,
      };
    }
  }

  /**
   * Validate group field with tarif context
   * Determines P vs E prefix based on tarif
   */
  private validateGroup(
    value: unknown,
    formState: FormState,
    context: ValidationContext,
    contextKey: string
  ): FieldValidationResult {
    const tarif = formState.data.job_details?.tarif;

    // If tarif not set, ask for it first
    if (!tarif) {
      context.retryCount++;
      context.lastUpdated = Date.now();
      this.contexts.set(contextKey, context);

      return {
        valid: false,
        error: {
          message:
            'Ich brauche erst deinen Tarifvertrag, um die Entgeltgruppe richtig einzuordnen. Arbeitest du im TVöD, TV-L, oder AVR?',
          field: 'group',
          received: String(value),
        },
        retryCount: context.retryCount,
        shouldEscalate: context.retryCount >= this.MAX_RETRIES,
      };
    }

    try {
      // Parse with groupSchema to validate format
      const parsed = groupSchema.parse(value);
      const str = String(parsed).toUpperCase();

      // If already has prefix, return as-is
      if (str.match(/^[PE]\d+$/)) {
        this.resetContext(contextKey.split(':')[0], 'group');
        return {
          valid: true,
          normalizedValue: str,
          retryCount: 0,
          shouldEscalate: false,
        };
      }

      // Bare number - infer prefix from tarif
      // TVöD and AVR are typically Pflege (P prefix)
      // TV-L is typically general civil service (E prefix)
      const prefix = tarif === 'tvoed' || tarif === 'avr' ? 'P' : 'E';
      const normalized = `${prefix}${str}`;

      this.resetContext(contextKey.split(':')[0], 'group');
      return {
        valid: true,
        normalizedValue: normalized,
        retryCount: 0,
        shouldEscalate: false,
      };
    } catch (error) {
      if (error instanceof ZodError) {
        context.retryCount++;
        context.lastUpdated = Date.now();
        this.contexts.set(contextKey, context);

        const errorMessage = this.formatGermanError('group', error, value);
        return {
          valid: false,
          error: {
            message: errorMessage,
            field: 'group',
            received: String(value),
          },
          retryCount: context.retryCount,
          shouldEscalate: context.retryCount >= this.MAX_RETRIES,
        };
      }

      return {
        valid: false,
        error: {
          message: `Hmm, da ist etwas schiefgelaufen. Bitte versuche es noch einmal.`,
          field: 'group',
          received: String(value),
        },
        retryCount: context.retryCount,
        shouldEscalate: false,
      };
    }
  }

  /**
   * Reset validation context for a session+field
   * @param sessionId Session identifier
   * @param field Optional field name - if not provided, resets all fields for session
   */
  resetContext(sessionId: string, field?: string): void {
    if (field) {
      this.contexts.delete(`${sessionId}:${field}`);
    } else {
      // Reset all fields for this session
      const keysToDelete: string[] = [];
      for (const key of this.contexts.keys()) {
        if (key.startsWith(`${sessionId}:`)) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach((key) => this.contexts.delete(key));
    }
  }

  /**
   * Get valid options for a field (for escalation chips)
   */
  getValidOptions(field: string): string[] {
    const optionsMap: Record<string, string[]> = {
      tarif: ['TVöD', 'TV-L', 'AVR'],
      group: ['P5', 'P6', 'P7', 'P8', 'P9', 'P10', 'E5', 'E6', 'E7', 'E8', 'E9', 'E10'],
      experience: ['Stufe 1', 'Stufe 2', 'Stufe 3', 'Stufe 4', 'Stufe 5', 'Stufe 6'],
      hours: ['Vollzeit (38.5h)', 'Teilzeit (20h)', '30 Stunden'],
      state: ['Nordrhein-Westfalen', 'Bayern', 'Baden-Württemberg', 'Hessen', 'Berlin'],
      taxClass: ['1 (ledig)', '2 (alleinerziehend)', '3 (verheiratet)', '4 (verheiratet)', '5', '6'],
      churchTax: ['Ja', 'Nein'],
      numberOfChildren: ['0', '1', '2', '3', 'keine'],
    };

    return optionsMap[field] || [];
  }

  /**
   * Get or create validation context with TTL check
   * @returns Fresh context if expired, existing context otherwise
   */
  private getContext(key: string): ValidationContext {
    const existing = this.contexts.get(key);
    const now = Date.now();

    // Check if context has expired (TTL)
    if (existing && existing.lastUpdated + this.CONTEXT_TTL_MS > now) {
      // Update timestamp to extend TTL
      existing.lastUpdated = now;
      return existing;
    }

    // Create fresh context
    const fresh: ValidationContext = {
      retryCount: 0,
      lastErrors: [],
      lastUpdated: now,
    };
    this.contexts.set(key, fresh);
    return fresh;
  }

  /**
   * Get Zod schema for a field
   */
  private getSchema(field: string): typeof tarifSchema {
    const schemaMap: Record<
      string,
      | typeof tarifSchema
      | typeof groupSchema
      | typeof experienceSchema
      | typeof hoursSchema
      | typeof stateSchema
      | typeof taxClassSchema
      | typeof churchTaxSchema
      | typeof numberOfChildrenSchema
    > = {
      tarif: tarifSchema,
      group: groupSchema,
      experience: experienceSchema,
      hours: hoursSchema,
      state: stateSchema,
      taxClass: taxClassSchema,
      churchTax: churchTaxSchema,
      numberOfChildren: numberOfChildrenSchema,
    };

    return (schemaMap[field] || tarifSchema) as typeof tarifSchema; // Fallback to tarif schema
  }

  /**
   * Format a friendly German error message
   */
  private formatGermanError(field: string, zodError: ZodError, received: unknown): string {
    const firstError = zodError.errors[0];
    if (!firstError) {
      return `Hmm, '${received}' scheint nicht zu passen.`;
    }

    // Use custom error message from schema if available
    if (firstError.message && !firstError.message.startsWith('Invalid')) {
      return firstError.message.replace('{input}', String(received));
    }

    // Fallback generic messages
    const fieldLabels: Record<string, string> = {
      tarif: 'Tarifvertrag',
      group: 'Entgeltgruppe',
      experience: 'Erfahrungsstufe',
      hours: 'Wochenstunden',
      state: 'Bundesland',
      taxClass: 'Steuerklasse',
      churchTax: 'Kirchensteuer',
      numberOfChildren: 'Kinderanzahl',
    };

    const label = fieldLabels[field] || field;
    return `Hmm, '${received}' kenne ich nicht als ${label}. Bitte versuche es noch einmal.`;
  }

  /**
   * Find near-miss suggestion (e.g., 7 -> 6)
   */
  private findNearMiss(field: string, value: unknown): string | undefined {
    const str = String(value).toLowerCase().trim();

    // Numeric fields: suggest closest valid value
    if (field === 'taxClass') {
      const num = parseInt(str, 10);
      if (num === 7) return '6';
      if (num === 0) return '1';
    }

    if (field === 'numberOfChildren') {
      if (str.includes('viel') || str.includes('mehr')) {
        return '3 oder mehr';
      }
    }

    // Boolean fields: suggest based on partial matches
    if (field === 'churchTax') {
      if (str.includes('weiß') || str.includes('weiss') || str.includes('unsicher')) {
        return 'Bist du in der Kirche? Dann ja, sonst nein';
      }
    }

    // Enum fields: use Levenshtein distance
    if (field === 'tarif') {
      const options = ['tvoed', 'tv-l', 'avr'];
      let bestMatch = '';
      let bestDistance = Infinity;
      for (const option of options) {
        const distance = this.levenshtein(str, option);
        if (distance < bestDistance && distance <= 2) {
          bestDistance = distance;
          bestMatch = option;
        }
      }
      if (bestMatch) {
        const displayNames: Record<string, string> = {
          tvoed: 'TVöD',
          'tv-l': 'TV-L',
          avr: 'AVR',
        };
        return displayNames[bestMatch];
      }
    }

    return undefined;
  }

  /**
   * Simple Levenshtein distance for near-miss suggestions
   */
  private levenshtein(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }

    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1, // insertion
            matrix[i - 1][j] + 1 // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}

/**
 * Singleton instance for use across the application
 */
export const fieldValidator = new FieldValidator();
