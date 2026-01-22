import { GoogleGenAI } from '@google/genai';
import type { FormState } from '../../types/form';
import { getGeminiClient } from '../../lib/gemini';

export type UserIntent =
  | 'data_provision'      // User is providing requested data
  | 'question'            // User is asking a question
  | 'modification'        // User wants to change previous answer (summary phase)
  | 'confirmation'        // User confirms and wants to proceed
  | 'unclear';            // Intent cannot be determined

export interface IntentAnalysis {
  intent: UserIntent;
  confidence: number;
  reasoning?: string;
}

export class ConversationAnalyzer {
  private genAI: GoogleGenAI;

  constructor() {
    this.genAI = getGeminiClient();
  }

  /**
   * Analyze user intent based on message and conversation context
   * Uses keyword matching first for efficiency, falls back to LLM if unclear
   * @param message The user's message
   * @param currentState The current form state
   * @returns Intent analysis with confidence score
   */
  async analyzeIntent(
    message: string,
    currentState: FormState
  ): Promise<IntentAnalysis> {
    // First try keyword-based intent detection (faster and cheaper)
    const keywordIntent = this.detectIntentByKeywords(message, currentState);

    if (keywordIntent) {
      return keywordIntent;
    }

    // Fall back to LLM-based analysis for ambiguous cases
    return await this.llmAnalyzeIntent(message, currentState);
  }

  /**
   * Fast keyword-based intent detection for common patterns
   * Returns null if intent is unclear and needs LLM analysis
   */
  private detectIntentByKeywords(
    message: string,
    currentState: FormState
  ): IntentAnalysis | null {
    const lowercaseMsg = message.toLowerCase().trim();

    // Question patterns
    if (
      lowercaseMsg.includes('?') ||
      lowercaseMsg.match(/\b(was ist|wie|warum|wann|wo|welche|erkläre|erklär)\b/)
    ) {
      return {
        intent: 'question',
        confidence: 0.9,
        reasoning: 'Detected question markers'
      };
    }

    // Confirmation patterns (only in summary phase)
    if (currentState.section === 'summary' && currentState.missingFields.length === 0) {
      if (
        lowercaseMsg.match(/\b(ja|yes|okay|ok|klar|los|go|genau|stimmt|richtig|korrekt|berechne|rechne|weiter)\b/) &&
        !lowercaseMsg.includes('?') &&
        lowercaseMsg.length < 30 // Short affirmative responses
      ) {
        return {
          intent: 'confirmation',
          confidence: 0.85,
          reasoning: 'Detected confirmation keywords in summary phase'
        };
      }
    }

    // Modification patterns (only in summary phase)
    if (currentState.section === 'summary') {
      if (
        lowercaseMsg.match(/\b(änder|ändere|korrigier|korrigiere|falsch|eigentlich|doch|nicht|stop|warte|moment)\b/)
      ) {
        return {
          intent: 'modification',
          confidence: 0.8,
          reasoning: 'Detected modification keywords in summary phase'
        };
      }
    }

    // Data provision pattern - if none of the above and we have missing fields
    if (currentState.missingFields.length > 0 && lowercaseMsg.length > 2) {
      // Simple heuristic: if message is not a question and not too long, likely data
      if (!lowercaseMsg.includes('?') && lowercaseMsg.length < 100) {
        return {
          intent: 'data_provision',
          confidence: 0.75,
          reasoning: 'Default to data provision when missing fields exist'
        };
      }
    }

    // Unclear - needs LLM analysis
    return null;
  }

  /**
   * LLM-based intent analysis for ambiguous cases
   */
  private async llmAnalyzeIntent(
    message: string,
    currentState: FormState
  ): Promise<IntentAnalysis> {
    try {
      const prompt = `
Analyze the user's intent based on conversation context.

Current Phase: ${currentState.section}
Missing Fields: ${currentState.missingFields.join(', ') || 'none'}

User Message: "${message}"

Determine the user's intent:
- data_provision: User is answering the question and providing data
- question: User is asking for clarification or information
- modification: User wants to change a previous answer (only valid in summary phase)
- confirmation: User confirms and wants to proceed with calculation (only valid in summary phase with no missing fields)
- unclear: Cannot determine intent

Respond with JSON only:
{
  "intent": "data_provision|question|modification|confirmation|unclear",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}
`;

      const result = await this.genAI.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });
      
      const text = result.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();

      const parsed = JSON.parse(cleanJson);
      return parsed as IntentAnalysis;

    } catch (e) {
      console.error('[ConversationAnalyzer] LLM analysis failed:', e);

      // Fallback to data_provision if we have missing fields, otherwise unclear
      if (currentState.missingFields.length > 0) {
        return {
          intent: 'data_provision',
          confidence: 0.5,
          reasoning: 'Fallback to data_provision after LLM failure'
        };
      }

      return {
        intent: 'unclear',
        confidence: 0.0,
        reasoning: 'LLM analysis failed'
      };
    }
  }
}
