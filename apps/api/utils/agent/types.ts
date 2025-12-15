

export interface AgentConfig {
    apiKey: string;
    systemInstruction: string;
}

export interface AgentMessage {
    role: string;
    parts: { text: string }[];
}

export interface AgentResponse {
    text: string;
    functionCalls?: unknown[];
}
