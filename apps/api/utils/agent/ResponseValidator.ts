import { GoogleGenAI } from '@google/genai';
import { VectorstoreService } from '../../lib/vectorstore/VectorstoreService';
import { getGeminiClient } from '../../lib/gemini';

export interface ValidationResult {
  valid: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  normalizedValue?: any;
  error?: string;
  suggestion?: string;
}

interface ValidationRules {
  type: 'string' | 'number' | 'boolean';
  enum?: string[];
  min?: number;
  max?: number;
  description?: string;
}

export class ResponseValidator {
  private genAI: GoogleGenAI;
  private vectorstore: VectorstoreService;

  constructor(vectorstore: VectorstoreService) {
    this.genAI = getGeminiClient();
    this.vectorstore = vectorstore;
  }

  /**
   * Validate and normalize a field value
   * @param field The field name
   * @param rawValue The raw value from user input
   * @param projectId The project ID for vectorstore context
   * @returns Validation result with normalized value or error
   */
  async validate(
    field: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawValue: any,
    projectId: string
  ): Promise<ValidationResult> {
    // Define validation rules per field
    const rules = this.getValidationRules(field);

    // 1. Basic validation (type, format, bounds)
    const basicCheck = this.basicValidation(field, rawValue, rules);
    if (!basicCheck.valid) {
      return basicCheck;
    }

    // 2. Enrich using vectorstore (attempts to normalize based on context)
    const enrichedValue = await this.vectorstore.enrichValue(
      field,
      String(rawValue),
      projectId
    );

    // 3. Advanced validation with LLM for complex normalization
    const llmCheck = await this.llmValidation(field, enrichedValue, rules);

    return llmCheck;
  }

  /**
   * Basic validation: type checking, bounds, enum validation
   */
  private basicValidation(
    field: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any,
    rules: ValidationRules
  ): ValidationResult {
    // Handle null/empty
    if (value === null || value === undefined || value === '') {
      return {
        valid: false,
        error: `${field} darf nicht leer sein`
      };
    }

    // Type validation
    if (rules.type === 'number') {
      const num = Number(value);
      if (isNaN(num)) {
        return {
          valid: false,
          error: `${field} muss eine Zahl sein`,
          suggestion: 'Bitte gib eine Zahl ein, z.B. 38.5'
        };
      }
      if (rules.min !== undefined && num < rules.min) {
        return {
          valid: false,
          error: `${field} muss mindestens ${rules.min} sein`,
          suggestion: `Bitte gib einen Wert >= ${rules.min} an`
        };
      }
      if (rules.max !== undefined && num > rules.max) {
        return {
          valid: false,
          error: `${field} darf höchstens ${rules.max} sein`,
          suggestion: `Bitte gib einen Wert <= ${rules.max} an`
        };
      }
    }

    // Boolean validation
    if (rules.type === 'boolean') {
      const strValue = String(value).toLowerCase();
      if (!['true', 'false', 'ja', 'nein', 'yes', 'no', '1', '0'].includes(strValue)) {
        return {
          valid: false,
          error: `${field} muss ja/nein sein`,
          suggestion: 'Bitte antworte mit "ja" oder "nein"'
        };
      }
    }

    // Enum validation (if specified)
    if (rules.enum && rules.enum.length > 0) {
      const normalizedValue = String(value).toLowerCase().trim();
      if (!rules.enum.includes(normalizedValue)) {
        return {
          valid: false,
          error: `${field} hat einen ungültigen Wert`,
          suggestion: `Mögliche Werte: ${rules.enum.join(', ')}`
        };
      }
    }

    return { valid: true, normalizedValue: value };
  }

  /**
   * LLM-based validation for complex normalization and fuzzy matching
   */
  private async llmValidation(
    field: string,
    value: string,
    rules: ValidationRules
  ): Promise<ValidationResult> {
    try {
      const prompt = `
Validate and normalize this field value for a salary calculation form.

Field: ${field}
Raw Value: "${value}"
Expected Type: ${rules.type}
${rules.enum ? `Valid Options: ${rules.enum.join(', ')}` : ''}
${rules.description || ''}

Task:
1. Determine if the value is valid and can be normalized
2. If valid, provide normalized value (e.g., "TVöD" → "tvoed", "Klasse 1" → "1", "ja" → true)
3. If invalid, explain why and suggest correction

Examples:
- "TVöD" → { "valid": true, "normalizedValue": "tvoed" }
- "38,5" → { "valid": true, "normalizedValue": 38.5 }
- "Steuerklasse 1" → { "valid": true, "normalizedValue": "1" }
- "xyz" → { "valid": false, "error": "Unbekannter Wert" }

Respond with JSON only:
{
  "valid": true|false,
  "normalizedValue": "..." (if valid),
  "error": "..." (if invalid),
  "suggestion": "..." (if invalid)
}
`;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      const text = result.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

      return JSON.parse(cleanJson) as ValidationResult;

    } catch (e) {
      console.error('[ResponseValidator] LLM validation failed:', e);
      // Fallback: accept as-is if LLM fails
      return { valid: true, normalizedValue: value };
    }
  }

  /**
   * Get validation rules for each field
   */
  private getValidationRules(field: string): ValidationRules {
    const rulesMap: Record<string, ValidationRules> = {
      tarif: {
        type: 'string',
        enum: ['tvoed', 'tvöd', 'tv-l', 'avr'],
        description: 'Tarifvertrag (z.B. TVöD, TV-L, AVR)'
      },
      group: {
        type: 'string',
        description: 'Entgeltgruppe (z.B. P7, P8, E5)'
      },
      experience: {
        type: 'string',
        description: 'Berufserfahrung als Stufe (1-6) oder Jahre'
      },
      hours: {
        type: 'number',
        min: 1,
        max: 60,
        description: 'Wochenstunden (z.B. 38.5 für Vollzeit)'
      },
      state: {
        type: 'string',
        description: 'Bundesland (z.B. Nordrhein-Westfalen, Bayern)'
      },
      taxClass: {
        type: 'string',
        enum: ['1', '2', '3', '4', '5', '6'],
        description: 'Steuerklasse (1-6)'
      },
      churchTax: {
        type: 'boolean',
        description: 'Kirchensteuerpflicht (ja/nein)'
      },
      hasChildren: {
        type: 'boolean',
        description: 'Hat Kinder (ja/nein)'
      },
      numberOfChildren: {
        type: 'number',
        min: 0,
        max: 20,
        description: 'Anzahl Kinder (0-20)'
      },
      childCount: {
        type: 'number',
        min: 0,
        max: 20,
        description: 'Anzahl Kinder (0-20)'
      },
      birthYear: {
        type: 'number',
        min: 1920,
        max: new Date().getFullYear(),
        description: 'Geburtsjahr (für Altersberechnung)'
      }
    };

    return rulesMap[field] || { type: 'string', description: 'Generic field' };
  }
}
