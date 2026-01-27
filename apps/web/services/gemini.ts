import { Message, Sender, FormState } from "../types";

interface ChatConfig {
  projectId: string;
  apiEndpoint: string;
}

let currentConfig: ChatConfig | null = null;

export const initializeChat = (config: ChatConfig) => {
  currentConfig = config;
};

export const sendMessageToGemini = async (
  userMessage: string,
  history: Message[],
  currentFormState?: FormState
): Promise<{ text: string; formState?: FormState; inquiryId?: string }> => {
  if (!currentConfig) {
    throw new Error("Chat not initialized with configuration.");
  }

  try {
    const response = await fetch(currentConfig.apiEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: userMessage,
        history: history, // Send full history including previous messages
        projectId: currentConfig.projectId, // Sent as projectId for clarity
        currentFormState: currentFormState, // Send current form state for state machine
      }),
    });

    if (!response.ok) {
        const errorData = await response.json();
        console.error("Backend Error:", errorData);
        throw new Error(errorData.error || "Backend request failed");
    }

    const data = await response.json();
    return {
      text: data.text || "",
      formState: data.formState,
      inquiryId: data.inquiryId
    };

  } catch (error) {
    console.error("API Request Error:", error);
    return {
      text: '[PROGRESS: 0] Entschuldigung, es gab einen Fehler bei der Verbindung. Bitte prüfen Sie Ihre Internetverbindung oder API-Konfiguration. [OPTIONS: ["Erneut versuchen"]]'
    };
  }
};