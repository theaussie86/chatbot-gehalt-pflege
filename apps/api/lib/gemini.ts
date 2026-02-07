import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";

/**
 * Creates a Gemini client using Vertex AI authentication.
 *
 * Authentication priority:
 * 1. GOOGLE_SERVICE_ACCOUNT_KEY - JSON string (for Vercel/Cloud deployments)
 * 2. GOOGLE_APPLICATION_CREDENTIALS - file path (for local development)
 * 3. Application Default Credentials via `gcloud auth application-default login`
 */
export const getGeminiClient = () => {
  const project = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || "europe-west3";

  if (!project) {
    throw new Error("GOOGLE_CLOUD_PROJECT environment variable is required for Vertex AI");
  }

  // Check for JSON credentials string (Vercel/Cloud deployment)
  // Supports both plain JSON and Base64-encoded JSON
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

  if (serviceAccountKey) {
    let credentials;
    try {
      // Try parsing as plain JSON first
      credentials = JSON.parse(serviceAccountKey);
    } catch {
      // If that fails, try Base64 decoding
      const decoded = Buffer.from(serviceAccountKey, "base64").toString("utf-8");
      credentials = JSON.parse(decoded);
    }

    return new GoogleGenAI({
      vertexai: true,
      project,
      location,
      googleAuthOptions: {
        credentials,
      },
    });
  }

  // Fall back to file-based credentials or ADC
  return new GoogleGenAI({
    vertexai: true,
    project,
    location,
  });
};

/**
 * Retry wrapper for Gemini API calls with exponential backoff.
 * Retries on 429 (RESOURCE_EXHAUSTED) and 503 (UNAVAILABLE) errors.
 */
export async function generateWithRetry(
  client: GoogleGenAI,
  params: Parameters<GoogleGenAI["models"]["generateContent"]>[0],
  maxRetries = 3
): Promise<GenerateContentResponse> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await client.models.generateContent(params);
    } catch (error: unknown) {
      const status = (error as { status?: number }).status;
      const isRetryable = status === 429 || status === 503;

      if (!isRetryable || attempt === maxRetries) {
        throw error;
      }

      const delayMs = Math.min(1000 * 2 ** attempt, 16000);
      const jitter = Math.random() * delayMs * 0.5;
      console.warn(
        `Gemini API ${status} error, retrying in ${Math.round(delayMs + jitter)}ms (attempt ${attempt + 1}/${maxRetries})`
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs + jitter));
    }
  }
  // unreachable, but TypeScript needs it
  throw new Error("generateWithRetry: exhausted retries");
}

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
