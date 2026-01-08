import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

export const getGenerativeModel = (apiKey: string) => {
  const genAI = new GoogleGenerativeAI(apiKey);
  return genAI.getGenerativeModel({
    model: "gemini-1.5-flash",
    generationConfig: { responseMimeType: "application/json" }
  });
};

// Schema for extraction
export const extractionSchema = {
  description: "Extrahiere Formulardaten aus dem Text",
  type: SchemaType.OBJECT,
  properties: {
    extractedData: { type: SchemaType.OBJECT },
    isComplete: { type: SchemaType.BOOLEAN },
    nextQuestion: { type: SchemaType.STRING }
  }
};
