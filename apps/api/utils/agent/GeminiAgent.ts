import { GoogleGenAI, Content } from "@google/genai";
import { SALARY_TOOLS, SYSTEM_INSTRUCTION } from "./config";
import { AgentMessage } from "./types";
import { getGeminiClient } from "../../lib/gemini";
import { toolExecutor } from "./ToolExecutor";

export class GeminiAgent {
    private client: GoogleGenAI;
    private sessionId: string;

    constructor(sessionId?: string) {
        this.client = getGeminiClient();
        this.sessionId = sessionId || `session-${Date.now()}`;
    }

    async sendMessage(
        message: string,
        history: AgentMessage[],
        contextDocuments?: Content[]
    ): Promise<string> {

        // Prepare System Instruction with current date
        const currentDate = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
        const dynamicSystemInstruction = SYSTEM_INSTRUCTION.replace('{DATUM}', currentDate);

        // Map History
        const chatHistory: Content[] = history.map((msg) => {
            const role = msg.role === 'bot' ? 'model' : 'user';

            // Handle different frontend history formats
            let parts: { text: string }[] = [];
            if (msg.parts && Array.isArray(msg.parts)) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                parts = msg.parts.map((p: any) => ({ text: p.text || p }));
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if ((msg as any).text) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                parts = [{ text: (msg as any).text }];
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } else if ((msg as any).content) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                parts = [{ text: (msg as any).content }];
            }

            return { role, parts };
        });

        // Document Context Injection (RAG)
        if (contextDocuments && contextDocuments.length > 0) {
            chatHistory.unshift(...contextDocuments);
        }

        const chat = this.client.chats.create({
            model: "gemini-2.5-flash",
            config: {
                systemInstruction: dynamicSystemInstruction,
                temperature: 0.7,
                tools: [SALARY_TOOLS],
            },
            history: chatHistory
        });

        let result = await chat.sendMessage({
            message: message
        });

        // ---------------------------------------------------------
        // Tool Execution Loop with Retry Support
        // ---------------------------------------------------------
        let iterations = 0;
        const maxIterations = 6; // Allow multiple tool calls (tariff then tax)

        while (iterations < maxIterations) {
            iterations++;

            // Extract function calls
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const fc = (result as any).functionCalls;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let functionCalls = fc ? (typeof fc === 'function' ? fc() : fc) : null;

            if (!functionCalls) {
                // Fallback manual extraction
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const parts = (result as any).response?.candidates?.[0]?.content?.parts || [];
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const calls = parts.filter((p: any) => p.functionCall);
                if (calls.length > 0) {
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    functionCalls = calls.map((p: any) => p.functionCall);
                }
            }

            if (!functionCalls || functionCalls.length === 0) {
                break; // No more tool calls, we have our final response
            }

            const call = functionCalls[0];
            console.log(`[GeminiAgent] Executing Tool: ${call.name}`, call.args);

            // Execute tool with validation and retry tracking
            const executionResult = await toolExecutor.execute(
                call.name,
                call.args,
                this.sessionId
            );

            // Build response to send back to model
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let toolResponse: any;

            if (executionResult.success && executionResult.result) {
                // Success - return full result
                toolResponse = { result: executionResult.result };
                console.log(`[GeminiAgent] Tool ${call.name} succeeded:`, executionResult.result);
            } else {
                // Error - return structured error for retry
                const errorContext = toolExecutor.buildErrorContextForAI(this.sessionId, call.name);

                toolResponse = {
                    error: executionResult.error,
                    shouldRetry: executionResult.shouldRetry,
                    retryCount: executionResult.retryCount,
                    context: errorContext,
                };

                // If max retries reached, include user-facing message
                if (executionResult.userMessage) {
                    toolResponse.userMessage = executionResult.userMessage;
                }

                console.log(`[GeminiAgent] Tool ${call.name} failed (attempt ${executionResult.retryCount}):`, executionResult.error);
            }

            // Send tool result back to model (function response as parts array)
            result = await chat.sendMessage({
                message: [{
                    functionResponse: {
                        name: call.name,
                        response: toolResponse
                    }
                }]
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any);
        }

        // Extract final text response
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = (result as any).text || (result as any).response?.text?.() || "";
        return text;
    }

    /**
     * Reset tool execution context (for new conversations)
     */
    resetToolContext(): void {
        toolExecutor.resetContext(this.sessionId);
    }
}
