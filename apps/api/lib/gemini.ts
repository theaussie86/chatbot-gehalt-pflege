import { GoogleGenAI } from "@google/genai";

export const getGeminiClient = (apiKey: string) => {
  return new GoogleGenAI({ apiKey });
};

// Schema for extraction
// Note: SchemaType structure might differ, checking documentation or adapting
export const extractionSchema = {
  description: "Extrahiere Formulardaten aus dem Text",
  type: "OBJECT",
  properties: {
    extractedData: { type: "OBJECT" },
    isComplete: { type: "BOOLEAN" },
    nextQuestion: { type: "STRING" }
  }
};
