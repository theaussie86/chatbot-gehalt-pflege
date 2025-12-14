import { GoogleGenAI, Content } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_INSTRUCTION = `
Du bist ein freundlicher, geduldiger und hilfsbereiter Assistent für den TVöD Pflege Gehaltsrechner.
Deine Mission ist es, dem Nutzer **ohne technisches Fachchinesisch** zu helfen, sein geschätztes Gehalt zu ermitteln.

**WICHTIG:** 
- Du führst ein **ganz normales Gespräch**. Frage nicht nach Tabellenwerten wie "Entgeltgruppe P7" oder "Stufe 3". Kein normaler Mensch weiß das auswendig oder versteht das sofort.
- Frage stattdessen nach **Ausbildung, Tätigkeit und Berufserfahrung**.
- **Du** bist der Experte: Du übersetzt die Antworten des Nutzers im Hintergrund in die korrekten technischen Werte (Entgeltgruppe & Stufe) für die Berechnung.
- Du bist NUR für den Bereich **Pflege** (TVöD-P) zuständig.

**Dein Vorgehen im Gespräch:**

1.  **Job & Qualifikation (statt Entgeltgruppe):**
    -   Frage: "Was hast du gelernt oder als was arbeitest du aktuell? (z.B. Pflegehelfer, Pflegefachfrau/mann, Stationsleitung...)"
    -   *Interne Logik:*
        -   Ungelernte/Helfer ohne Ausbildung -> ~P5
        -   Pflegehelfer (1 Jahr Ausbildung) -> ~P6
        -   Pflegefachkraft (3 Jahre Ausbildung) -> ~P7/P8
        -   Fachweiterbildung (z.B. Intensiv, OP) -> ~P9
        -   Leitungspositionen -> ~P10-P15
        -   (Schätze konservativ oder frage bei Unklarheit kurz nach Leitungsverantwortung, aber bleib locker.)

2.  **Erfahrung (statt Stufe):**
    -   Frage: "Wie lange arbeitest du schon in diesem Beruf?" oder "Seit wann bist du dabei?"
    -   *Interne Logik:*
        -   Einstieg / < 1 Jahr -> Stufe 1 (bei P7/P8 oft Einstieg in Stufe 2, beachte TVöD Regeln grob)
        -   1-3 Jahre -> Stufe 2
        -   3-6 Jahre -> Stufe 3
        -   6-10 Jahre -> Stufe 4
        -   10-15 Jahre -> Stufe 5
        -   >15 Jahre -> Stufe 6

3.  **Arbeitszeit:**
    -   Frage: "Arbeitest du Vollzeit oder Teilzeit? Wie viele Stunden pro Woche?"

4.  **Steuer & Familie (locker erfragen):**
    -   Statt "Steuerklasse?", frage: "Bist du verheiratet oder ledig?" -> (Ledig -> I, Verheiratet -> IV oder III/V).
    -   "Hast du Kinder? Zahlst du Kirchensteuer?"
    -   "Bist du gesetzlich krankenversichert?"

5.  **Jahr:**
    -   Frage kurz, ob das für *jetzt* (aktuelles Jahr) oder *nächstes Jahr* sein soll. (Nutze das Systemdatum unten).

**Protokoll & Ausgabe:**

Halte den Nutzer mit \`[PROGRESS: 0-100]\` auf dem Laufenden.
Wenn du unsicher bist, triff eine vernünftige Annahme und sag dem Nutzer: "Ich nehme mal an, das entspricht etwa einer erfahrenen Fachkraft..."

**Wenn alle Infos da sind:**
Gib eine Zusammenfassung in normalen Worten ("Okay, als erfahrene Fachkraft in Vollzeit, ledig, keine Kinder...") und dann das technische JSON-Ergebnis:
\`[PROGRESS: 100]\`
\`[JSON_RESULT: {"brutto": 1234.56, "netto": 1234.56, "steuer": 123.45, "sozialabgaben": 123.45, "jahr": "2025", "gruppe": "P8", "stufe": 3, "tarif": "Pflege"}]\`

Das JSON muss die technischen Werte (P-Gruppe, Stufe) enthalten, die du ermittelt hast.
`;

// Helper to map frontend messages to Gemini Content
function mapHistoryToContent(history: any[]): Content[] {
    return history.map((msg) => ({
        role: msg.sender === 'bot' ? 'model' : 'user',
        parts: [{ text: msg.text }],
    }));
}

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
        // Fallback to 'apiKey' only for backward compatibility during transition if needed, but per request we want clear separation.
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
        // Check requests from this IP in the last minute
        const { count: requestCount, error: rateLimitError } = await getSupabaseAdmin()
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

        // Log this request (async, don't await blocking)
        getSupabaseAdmin().from('request_logs').insert({
            ip_address: ip,
            public_key: activeProjectId !== process.env.GEMINI_API_KEY ? activeProjectId : 'system_demo'
        }).then();

        // 2. Domain Whitelisting / Origin Check & Custom Key Fetching
        // Only perform check if it's a real API key (not our internal env key) and Origin is present
        
        let customGeminiApiKey = null;

        if (activeProjectId !== process.env.GEMINI_API_KEY && activeProjectId !== 'DEMO') {
             const { data: project, error: projectError } = await getSupabaseAdmin()
                .from('projects')
                .select('allowed_origins, gemini_api_key')
                .eq('public_key', activeProjectId)
                .single();

            if (!project || projectError) {
                // Key not found in DB
                return NextResponse.json(
                    { error: "Invalid Project ID" },
                    { status: 403 }
                );
            }

            const allowedOrigins = project.allowed_origins || [];
            customGeminiApiKey = project.gemini_api_key;
            
            // Check if Origin is allowed
            // Note: If allowedOrigins is empty, we block everything.
            // If origin is null (e.g. server-to-server), we might strictly block unless handled.
            // Here we strictly require origin match if origin is present.
            if (origin && !allowedOrigins.includes(origin)) {
                 return NextResponse.json(
                    { error: `Origin '${origin}' not authorized for this Project ID` },
                    { status: 403 }
                );
            }
        }
        
        // --- END SECURITY CHECKS ---

        // Determine which Gemini API Key to use:
        // 1. Custom Project Key (if exists in DB)
        // 2. System ENV Key (Fallback)
        const finalGeminiApiKey = customGeminiApiKey || process.env.GEMINI_API_KEY;

        if (!finalGeminiApiKey) {
             return NextResponse.json(
                { error: "Server Configuration Error: No Gemini API Key available." },
                { status: 500 }
            );
        }

        const genAIClient = new GoogleGenAI({ apiKey: finalGeminiApiKey });

        const chatHistory = mapHistoryToContent(history || []);
        
        const currentDate = new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long', day: 'numeric' });
        const dynamicSystemInstruction = `${SYSTEM_INSTRUCTION}\n\nHeute ist der ${currentDate}.`;

        const chat = genAIClient.chats.create({
            model: "gemini-2.0-flash",
            config: {
                systemInstruction: dynamicSystemInstruction,
                temperature: 0.7,
            },
            history: chatHistory
        });

        const result = await chat.sendMessage({
            message: message
        });

        const text = result.text || "";

        // Return response with Dynamic CORS if needed, or rely on OPTIONS
        // If we want detailed CORS per response:
        const response = NextResponse.json({ text });
        if (origin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        }
        return response;

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

// Enable CORS Preflight with Dynamic Origin
export async function OPTIONS(request: Request) {
    const origin = request.headers.get('origin');
    // For OPTIONS, we typically just allow it, but we can reflect the origin.
    // To be strict, we'd check DB here too, but we lack the API Key in body.
    // So we just reflect the origin to allow the browser to proceed to POST.
    
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": origin || "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-gemini-api-key",
        },
    });
}
