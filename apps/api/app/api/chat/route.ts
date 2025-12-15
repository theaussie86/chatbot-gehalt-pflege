import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GeminiAgent } from "../../../utils/agent/GeminiAgent";
import { Content } from "@google/genai";

// Lazy Initialize Supabase Admin Client
let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin() {
    if (!supabaseAdminInstance) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_KEY;
        if (!url || !key) {
            throw new Error("Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY) are missing.");
        }
        supabaseAdminInstance = createClient(url, key);
    }
    return supabaseAdminInstance;
}

export async function POST(request: Request) {
    try {
        const body = await request.json();
        // Look for 'projectId' specifically. 
        const { message, history, projectId, apiKey } = body;
        const origin = request.headers.get('origin');
        const ip = request.headers.get('x-forwarded-for') || 'unknown';

        // Prefer 'projectId', fallback to 'apiKey' (legacy)
        let activeProjectId = projectId || apiKey;
        
        // Fallback to server-side env key if client key is missing or placeholder
        if (!activeProjectId || activeProjectId === 'DEMO') {
            activeProjectId = process.env.GEMINI_API_KEY;
        }

        if (!activeProjectId) {
            return NextResponse.json(
                { error: "Project ID is required" },
                { status: 401 }
            );
        }

        // --- SECURITY CHECKS ---

        // 1. Rate Limiting (Simple SQL Based)
        const { count: requestCount } = await getSupabaseAdmin()
            .from('request_logs')
            .select('*', { count: 'exact', head: true })
            .eq('ip_address', ip)
            .gt('created_at', new Date(Date.now() - 60000).toISOString()); // Last 60 seconds

        if (requestCount !== null && requestCount > 20) {
            return NextResponse.json(
                { error: "Too many requests. Please try again later." },
                { status: 429 }
            );
        }

        // Log this request
        getSupabaseAdmin().from('request_logs').insert({
            ip_address: ip,
            public_key: activeProjectId !== process.env.GEMINI_API_KEY ? activeProjectId : 'system_demo'
        }).then();

        // 2. Domain Whitelisting / Origin Check & Custom Key Fetching
        
        let customGeminiApiKey = null;
        let fileContextMessages: Content[] = [];

        if (activeProjectId !== process.env.GEMINI_API_KEY && activeProjectId !== 'DEMO') {
             const { data: project, error: projectError } = await getSupabaseAdmin()
                .from('projects')
                .select('id, user_id, allowed_origins, gemini_api_key')
                .eq('public_key', activeProjectId)
                .single();

            if (!project || projectError) {
                return NextResponse.json(
                    { error: "Invalid Project ID" },
                    { status: 403 }
                );
            }

            const allowedOrigins = project.allowed_origins || [];
            customGeminiApiKey = project.gemini_api_key;
            
            if (origin && !allowedOrigins.includes(origin)) {
                 return NextResponse.json(
                    { error: `Origin '${origin}' not authorized for this Project ID` },
                    { status: 403 }
                );
            }

            // --- FETCH & INJECT DOCUMENTS (RAG) ---
            const { data: documents } = await getSupabaseAdmin()
                .from('documents')
                .select('mime_type, google_file_uri')
                .or(`project_id.eq.${project.id},and(project_id.is.null,user_id.eq.${project.user_id})`);

            if (documents && documents.length > 0) {
                 const fileParts = documents.map(doc => ({
                    fileData: {
                        mimeType: doc.mime_type || 'application/pdf',
                        fileUri: doc.google_file_uri
                    }
                }));

                const contextInstruction: Content = {
                    role: 'user',
                    parts: [...fileParts, { text: "Nutze diese hochgeladenen Dokumente als primäre Wissensquelle für deine Antworten im folgenden Gespräch. Beziehe dich explizit darauf, wenn es zur Frage passt." }]
                };
                
                const modelAck: Content = {
                    role: 'model',
                    parts: [{ text: "Verstanden. Ich habe Zugriff auf die Dokumente und werde sie für die Beantwortung deiner Fragen verwenden." }]
                };
                
                fileContextMessages = [contextInstruction, modelAck];
            }
        }
        
        // --- END SECURITY CHECKS ---

        const finalGeminiApiKey = customGeminiApiKey || process.env.GEMINI_API_KEY;

        if (!finalGeminiApiKey) {
             return NextResponse.json(
                { error: "Server Configuration Error: No Gemini API Key available." },
                { status: 500 }
            );
        }

        // --- AGENT EXECUTION ---
        const agent = new GeminiAgent(finalGeminiApiKey);
        
        const responseText = await agent.sendMessage(
            message, 
            history || [], 
            fileContextMessages
        );

        // Attempt to extract and save JSON result (if tool was used)
        // This logic remains in route handler as it interacts with Supabase, distinct from "Agent Intelligence"
        const jsonMatch = responseText.match(/\[JSON_RESULT:\s*(\{[\s\S]*?\})\]/);
        if (jsonMatch && jsonMatch[1]) {
            try {
                const salaryData = JSON.parse(jsonMatch[1]);
                
                // Save to database
                getSupabaseAdmin()
                    .from('salary_inquiries')
                    .insert({
                        public_key: activeProjectId,
                        gruppe: salaryData.gruppe,
                        stufe: salaryData.stufe,
                        tarif: salaryData.tarif,
                        jahr: salaryData.jahr,
                        brutto: salaryData.brutto,
                        netto: salaryData.netto,
                        details: salaryData
                    }).then();

            } catch (e) {
                console.error("Error parsing or saving salary JSON:", e);
            }
        }

        const response = NextResponse.json({ text: responseText });
        if (origin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        }
        return response;

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("Gemini API Error:", error);
        return NextResponse.json(
            { error: errorMessage },
            { status: 500 }
        );
    }
}

// Enable CORS Preflight
export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin');
    
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-gemini-api-key",
        },
    });
}
