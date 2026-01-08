import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GeminiAgent } from "../../../utils/agent/GeminiAgent";
import { Content } from "@google/genai";
import type { FormState } from "../../../types/form";

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

        // --- HYBRID STATE MACHINE LOGIC ---
        const { currentFormState } = body as { currentFormState?: FormState };
        if (currentFormState) {
            const { getGenerativeModel } = await import("../../../lib/gemini");
            const model = getGenerativeModel(finalGeminiApiKey);

            let nextFormState = { ...currentFormState };
            let responseText = "";

            // Helper to handle Generic Intent-Based Slot Filling
            const handleGenericSlotFilling = async (
                sectionName: string, 
                currentData: any, 
                requiredFields: string[], 
                contextDescription: string
            ) => {
                // Initialize missing fields if starting fresh in this section
                if (!nextFormState.missingFields || nextFormState.section !== sectionName) {
                     // Check what's already there vs what is needed
                     const existingKeys = Object.keys(currentData || {});
                     nextFormState.missingFields = requiredFields.filter(f => !existingKeys.includes(f));
                }

                // If everything is present, we are done with this section
                if (nextFormState.missingFields.length === 0) {
                     return { done: true };
                }

                const prompt = `
                  Du bist ein Assistent, der Daten für einen Gehaltsrechner einsammelt.
                  Kontext: ${contextDescription}
                  
                  Aktuelle Daten: ${JSON.stringify(currentData || {})}
                  Noch fehlende Felder: ${nextFormState.missingFields.join(', ')}.
                  
                  Der Nutzer sagt: "${message}".
                  
                  Aufgabe:
                  1. Extrahiere Informationen für die fehlenden Felder aus der Nutzerantwort. Sei tolerant (z.B. "Steuerklasse 1" -> "1").
                  2. Aktualisiere die Liste der fehlenden Felder.
                  3. Generiere eine natürliche, kurze Frage für die WICHTIGSTEN noch verbleibenden Felder. Frage immer nur nach 1-2 Dingen gleichzeitig, um den Nutzer nicht zu überfordern.
                  
                  Antworte IMMER als JSON:
                  {
                    "extracted": { "field": "value", ... },
                    "remainingMissingFields": ["..."],
                    "nextQuestion": "..."
                  }
                `;

                const result = await model.generateContent(prompt);
                const text = result.response.text();
                // Clean markdown code blocks if present
                const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
                const extraction = JSON.parse(cleanJson);

                return { 
                    done: false, 
                    extraction 
                };
            };

            // PHASE 1: Job Details (Gross Income)
            if (currentFormState.section === 'job_details') {
                const requiredFields = ['tarif', 'experience', 'hours', 'state']; 
                // 'group' is often implied by 'tarif' or specific job role, but let's keep it simple for now or ask if needed.
                // We'll treat 'group' as optional or part of 'tarif' refinement later if needed, adding it to required if tarif implies it.
                // For now, let's strictly ask for these 4 to get a rough calculator running.
                
                const { done, extraction } = await handleGenericSlotFilling(
                    'job_details', 
                    nextFormState.data.job_details, 
                    requiredFields,
                    "Es geht um die Ermittlung des Bruttogehalts im Pflegebereich. Wir brauchen Tarif (z.B. TVöD), Erfahrungsstufe/Jahre, Wochenstunden und Bundesland."
                );

                if (done) {
                    // Transition to next phase
                    nextFormState.section = 'tax_details';
                    nextFormState.missingFields = ['taxClass', 'churchTax', 'hasChildren'];
                    responseText = "Danke! Ich habe die Daten zu deinem Job. Um nun dein Nettogehalt zu berechnen: Welche Steuerklasse hast du?";
                    // Initialize structure for next phase
                    if (!nextFormState.data.tax_details) nextFormState.data.tax_details = {};
                } else {
                    if (extraction?.extracted) {
                         nextFormState.data.job_details = { 
                             ...nextFormState.data.job_details, 
                             ...extraction.extracted 
                         };
                    }
                    nextFormState.missingFields = extraction.remainingMissingFields || [];
                    
                    // Check completion AGAIN after extraction
                    if (nextFormState.missingFields.length === 0) {
                         nextFormState.section = 'tax_details';
                         nextFormState.missingFields = ['taxClass', 'churchTax', 'hasChildren'];
                         responseText = "Perfekt. Kommen wir jetzt zu den Steuern für die Netto-Berechnung. Welche Steuerklasse hast du?";
                         if (!nextFormState.data.tax_details) nextFormState.data.tax_details = {};
                    } else {
                        responseText = extraction.nextQuestion;
                    }
                }
            }

            // PHASE 2: Tax Details (Net Income)
            else if (currentFormState.section === 'tax_details') {
                 const requiredFields = ['taxClass', 'churchTax', 'hasChildren'];
                 
                 const { done, extraction } = await handleGenericSlotFilling(
                    'tax_details',
                    nextFormState.data.tax_details,
                    requiredFields,
                    "Es geht um die Netto-Gehaltsberechnung. Wir brauchen Steuerklasse, Kirchensteuer (Ja/Nein), und ob Kinder vorhanden sind."
                 );

                 if (done) {
                     nextFormState.section = 'summary';
                     responseText = "Vielen Dank! Ich habe alle Daten. Soll ich die Berechnung starten?";
                 } else {
                     if (extraction?.extracted) {
                         nextFormState.data.tax_details = { 
                             ...nextFormState.data.tax_details, 
                             ...extraction.extracted 
                         };
                    }
                    nextFormState.missingFields = extraction.remainingMissingFields || [];
                    
                    if (nextFormState.missingFields.length === 0) {
                         nextFormState.section = 'summary';
                         responseText = "Danke, das reicht mir! Ich fasse zusammen..."; // Or trigger calculation directly
                    } else {
                        responseText = extraction.nextQuestion;
                    }
                 }
            }
            
            // PHASE 3: Summary
            else if (currentFormState.section === 'summary') {
                responseText = "Die Berechnung ist abgeschlossen. (Hier würde das Ergebnis stehen)";
                // Ideally trigger a separate tool or function for real calculation here
            }

            return NextResponse.json({ 
                text: responseText, 
                formState: nextFormState 
            });
        }

        // --- AGENT EXECUTION (Legacy / Standard Chat) ---
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
