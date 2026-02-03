import { FormState } from "../types/form";
import { getGeminiClient } from "./gemini";

/**
 * Predefined suggestion chips organized by field.
 * These are exact, known options that should appear for specific fields.
 */
const PREDEFINED_CHIPS: Record<string, string[]> = {
  // job_details stage
  tarif: ['TVöD', 'TV-L', 'AVR'],
  experience: ['Stufe 1', 'Stufe 2', 'Stufe 3', 'Stufe 4', 'Stufe 5', 'Stufe 6'],
  hours: ['Vollzeit', 'Teilzeit'],
  state: ['NRW', 'Bayern', 'Baden-Württemberg', 'Hessen', 'Niedersachsen', 'Berlin'],

  // tax_details stage
  taxClass: ['1', '2', '3', '4', '5', '6'],
  churchTax: ['Ja', 'Nein'],
  numberOfChildren: ['0', '1', '2', '3+'],

  // summary stage confirmation
  _summary_confirm: ['Ja', 'Etwas ändern'],
};

/**
 * Fields that expect freeform input.
 * Chips should be skipped for these fields.
 */
const FREEFORM_FIELDS = ['group']; // Job title/position requires typing

/**
 * Generate contextual suggestion chips based on current conversation state.
 *
 * @param formState - Current form state with section and missing fields
 * @param lastBotMessage - Optional last bot message for context
 * @returns Array of 0-4 suggestion chip labels
 */
export async function generateSuggestions(
  formState: FormState,
  lastBotMessage?: string
): Promise<string[]> {
  // 1. If section is 'completed', return empty array
  if (formState.section === 'completed') {
    return [];
  }

  // 2. If section is 'summary', return summary confirmation chips
  if (formState.section === 'summary') {
    return PREDEFINED_CHIPS._summary_confirm;
  }

  // 3. Get first missing field from formState.missingFields
  const missingFields = formState.missingFields || [];
  if (missingFields.length === 0) {
    return [];
  }

  const nextField = missingFields[0];

  // 4. If missing field is in FREEFORM_FIELDS, return empty array
  if (FREEFORM_FIELDS.includes(nextField)) {
    return [];
  }

  // 5. If missing field has predefined chips, return those (max 4)
  if (PREDEFINED_CHIPS[nextField]) {
    const chips = PREDEFINED_CHIPS[nextField];
    return chips.slice(0, 4); // Limit to 4 chips
  }

  // 6. HYBRID: If no predefined chips but lastBotMessage exists,
  //    call generateAISuggestions for open questions
  if (lastBotMessage) {
    try {
      const aiSuggestions = await generateAISuggestions(lastBotMessage, formState);
      return aiSuggestions;
    } catch (error) {
      console.error('[SuggestionService] AI generation failed:', error);
      return []; // Graceful fallback
    }
  }

  // 7. Otherwise return empty array
  return [];
}

/**
 * Generate AI-powered suggestions for open-ended questions.
 * Uses lightweight Gemini call with timeout for graceful degradation.
 *
 * @param botMessage - The bot's question to the user
 * @param formState - Current form state for context
 * @returns Array of 2-4 short German reply options
 */
async function generateAISuggestions(
  botMessage: string,
  formState: FormState
): Promise<string[]> {
  const client = getGeminiClient();

  const prompt = `
Du bist ein Vorschlagsgenerator für einen Chatbot.

Frage des Bots: "${botMessage}"

Aktueller Kontext: Der Nutzer ist im Schritt "${formState.section}" und beantwortet Fragen zu seinem Gehalt.

Aufgabe: Generiere 2-4 kurze, typische Antwortoptionen auf Deutsch, die der Nutzer anklicken könnte.
Die Optionen sollten kurz sein (max. 20 Zeichen) und häufige Antworten abdecken.

Gib NUR ein JSON-Array mit Strings zurück. Beispiel: ["Option 1", "Option 2", "Option 3"]

WICHTIG: Halte die Labels sehr kurz und prägnant. Keine ganzen Sätze.
  `.trim();

  try {
    // Set a short timeout (2 seconds) for AI generation
    const timeoutPromise = new Promise<string[]>((_, reject) =>
      setTimeout(() => reject(new Error('AI suggestion timeout')), 2000)
    );

    const generationPromise = (async () => {
      const result = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { responseMimeType: 'application/json' }
      });

      const text = result.text || '';
      const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
      const suggestions = JSON.parse(cleanJson);

      // Validate and limit to 4 suggestions
      if (Array.isArray(suggestions)) {
        return suggestions
          .filter((s: any) => typeof s === 'string' && s.length <= 30)
          .slice(0, 4);
      }

      return [];
    })();

    return await Promise.race([generationPromise, timeoutPromise]);
  } catch (error) {
    // Timeout or error - return empty array (graceful degradation)
    console.warn('[SuggestionService] AI generation failed or timed out:', error);
    return [];
  }
}

/**
 * Service class wrapper for suggestion generation.
 * Provides a consistent interface for generating contextual chips.
 */
export class SuggestionService {
  /**
   * Generate suggestions for the current conversation state.
   */
  async generateSuggestions(
    formState: FormState,
    lastBotMessage?: string
  ): Promise<string[]> {
    return generateSuggestions(formState, lastBotMessage);
  }
}
