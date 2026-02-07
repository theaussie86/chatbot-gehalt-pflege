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
  currentFormState?: FormState,
  sessionId?: string
): Promise<{ text: string; formState?: FormState; inquiryId?: string; suggestions?: string[]; progress?: number }> => {
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
        sessionId: sessionId, // Session ID for server-side draft persistence
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
      inquiryId: data.inquiryId,
      suggestions: data.suggestions || [],
      progress: data.progress ?? undefined
    };

  } catch (error) {
    console.error("API Request Error:", error);
    return {
      text: '[PROGRESS: 0] Entschuldigung, es gab einen Fehler bei der Verbindung. Bitte prüfen Sie Ihre Internetverbindung oder API-Konfiguration. [OPTIONS: ["Erneut versuchen"]]',
      suggestions: []
    };
  }
};

export const sendEmailExport = async (
  email: string,
  inquiryData: {
    jobDetails: Record<string, any>;
    taxDetails: Record<string, any>;
    calculationResult: Record<string, any>;
  },
  projectId: string,
  inquiryId: string | null
): Promise<{ success: boolean; error?: string }> => {
  if (!currentConfig) {
    return { success: false, error: "Chat not initialized with configuration." };
  }

  try {
    // Derive email export endpoint from apiEndpoint (replace /api/chat with /api/email-export)
    const emailEndpoint = currentConfig.apiEndpoint.replace('/api/chat', '/api/email-export');

    const response = await fetch(emailEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email,
        consent: true,
        inquiryData,
        projectId,
        inquiryId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.error("Email Export Error:", errorData);
      return {
        success: false,
        error: errorData.error || "Fehler beim Senden der E-Mail"
      };
    }

    return { success: true };

  } catch (error) {
    console.error("Email Export Request Error:", error);
    return {
      success: false,
      error: "Netzwerkfehler. Bitte versuche es erneut."
    };
  }
};