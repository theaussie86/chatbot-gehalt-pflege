import { GoogleGenAI, Content } from "@google/genai";
import { TaxWrapper, SalaryInput } from "../tax";
import { SALARY_TOOL, SYSTEM_INSTRUCTION } from "./config";
import { AgentMessage } from "./types";
import { getGeminiClient } from "../../lib/gemini";

export class GeminiAgent {
    private client: GoogleGenAI;
    private taxWrapper: TaxWrapper;

    constructor() {
        this.client = getGeminiClient();
        this.taxWrapper = new TaxWrapper();
    }

    async sendMessage(
        message: string,
        history: AgentMessage[],
        contextDocuments?: Content[]
    ): Promise<string> {
        
        // Prepare System Instruction with current date
        const currentDate = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
        const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\nHeute ist der ${currentDate}.`;

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
            // Config structure varies by SDK version
            config: {
                systemInstruction: dynamicSystemInstruction,
                temperature: 0.7,
                tools: [SALARY_TOOL],
            },
            history: chatHistory
        });

        let result = await chat.sendMessage({
            message: message
        });

        // ---------------------------------------------------------
        // Tool Execution Logic
        // ---------------------------------------------------------
        
        // Check for function calls
        // Note: The SDK structure might vary slightly by version, extracting safely
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let functionCalls = (result as any).functionCalls ? (result as any).functionCalls() : null;
        
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

        if (functionCalls && functionCalls.length > 0) {
            const call = functionCalls[0];
            if (call.name === "calculate_net_salary") {
                console.log("[GeminiAgent] Executing Tool: calculate_net_salary", call.args);
                
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const args = call.args as any;
                const input: SalaryInput = {
                    yearlySalary: args.yearlySalary,
                    taxClass: args.taxClass,
                    year: args.year,
                    hasChildren: args.hasChildren ?? false,
                    childCount: args.childCount ?? 0,
                    churchTax: args.churchTax ?? 'none',
                    state: args.state ?? 'west',
                    birthYear: args.birthYear,
                    healthInsuranceAddOn: args.healthInsuranceAddOn ?? 1.6
                };

                const toolResult = this.taxWrapper.calculate(input);
                
                // Return tool result to model
                result = await chat.sendMessage({
                    message: [
                        {
                            role: "function",
                            parts: [{
                                functionResponse: {
                                    name: "calculate_net_salary",
                                    response: { result: toolResult }
                                }
                            }]
                        }
                    ]
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                } as any);
            }
        }

        // Extract final text response
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const text = (result as any).text || (result as any).response?.text?.() || "";
        return text;
    }
}
