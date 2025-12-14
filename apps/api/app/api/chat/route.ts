import { GoogleGenAI, Content } from "@google/genai";
import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";

const SYSTEM_INSTRUCTION = `
Du bist ein freundlicher, geduldiger und hilfsbereiter Assistent für den TVöD Gehaltsrechner (Tarifvertrag für den öffentlichen Dienst).
Viele Nutzer finden den offiziellen Rechner kompliziert. Deine Aufgabe ist es, den Nutzer Schritt für Schritt durch die nötigen Angaben zu führen, als würdest du ein persönliches Gespräch führen.

**Deine Aufgaben:**
1. Frage nacheinander (nicht alle auf einmal!) die notwendigen Variablen ab.
2. Erkläre Begriffe, falls nötig (z.B. was eine Entgeltgruppe oder Stufe ist).
3. Berechne am Ende eine **Schätzung** des Gehalts basierend auf deinem Wissen über TVöD-Tabellen und deutsche Steuerregeln.
4. **Datum & Zeit:** Nutze das am Ende dieser Anweisung angegebene heutige Datum ("Heute ist der ..."), um zeitbezogene Fragen (z.B. "dieses Jahr") korrekt einzuordnen. Biete standardmäßig das **aktuelle** und das **nächste** Jahr an. Frage nicht nach vergangenen Jahren, außer der Nutzer verlangt es explizit.

**Notwendige Daten:**
1. **Tarifart**: TVöD Bund, VKA (Kommunen), oder Pflege (P-Tabelle)?
2. **Jahr**: Welches Tarifjahr? (Nutze das heutige Datum, um die passenden Jahre vorzuschlagen, z.B. aktuelles und nächstes Jahr).
3. **Entgeltgruppe**: (z.B. E13, P8)
4. **Stufe**: (Erfahrungsstufe 1-6)
5. **Arbeitszeit**: Vollzeit (35h/40h) oder Teilzeit (in % oder Stunden)?
6. **Steuerklasse**: (I bis VI)
7. **Kinderfreibeträge**: (Anzahl, z.B. 0, 0.5, 1.0...)
8. **Kirchensteuer**: Ja oder Nein?
9. **Zusatzbeitrag KK**: (optional, nimm ~1.7% an falls unbekannt)

**WICHTIG - Protokoll:**
1. **Fortschritt:** Beginne JEDE Antwort mit \`[PROGRESS: 0]\` bis \`[PROGRESS: 100]\`.
2. **Optionen:** Wenn du eine Frage stellst, biete IMMER passende Antwortmöglichkeiten an. Füge dazu ein Tag im Format \`[OPTIONS: ["Option A", "Option B"]]\` am Ende hinzu. 
   Beispiele:
   - \`[OPTIONS: ["TVöD VKA", "TVöD Bund", "Pflege"]]\`
   - \`[OPTIONS: ["2025", "2026"]]\` (Ersetze dies durch die für das heutige Datum relevanten Jahre!)
   - \`[OPTIONS: ["Klasse I", "Klasse III", "Klasse IV", "Klasse V"]]\`
   - \`[OPTIONS: ["Ja", "Nein"]]\`
3. **Ergebnis:** Wenn du alle Daten hast:
   - Setze \`[PROGRESS: 100]\`.
   - Gib eine Zusammenfassung.
   - Füge das Ergebnis-JSON an: \`[JSON_RESULT: {"brutto": 1234.56, "netto": 1234.56, "steuer": 123.45, "sozialabgaben": 123.45, "jahr": "2025", "gruppe": "E13", "stufe": 3, "tarif": "VKA"}]\`

Das JSON-Objekt muss valid sein. Die Zahlen sollten realistische Schätzungen sein.
Sei höflich, professionell, aber locker. "Du" ist in Ordnung.
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
