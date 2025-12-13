import { GoogleGenAI, Content } from "@google/genai";
import { NextResponse } from "next/server";

const SYSTEM_INSTRUCTION = `
Du bist ein freundlicher, geduldiger und hilfsbereiter Assistent für den TVöD Gehaltsrechner (Tarifvertrag für den öffentlichen Dienst).
Viele Nutzer finden den offiziellen Rechner kompliziert. Deine Aufgabe ist es, den Nutzer Schritt für Schritt durch die nötigen Angaben zu führen, als würdest du ein persönliches Gespräch führen.

**Deine Aufgaben:**
1. Frage nacheinander (nicht alle auf einmal!) die notwendigen Variablen ab.
2. Erkläre Begriffe, falls nötig (z.B. was eine Entgeltgruppe oder Stufe ist).
3. Berechne am Ende eine **Schätzung** des Gehalts basierend auf deinem Wissen über TVöD-Tabellen und deutsche Steuerregeln.

**Notwendige Daten:**
1. **Tarifart**: TVöD Bund, VKA (Kommunen), oder Pflege (P-Tabelle)?
2. **Jahr**: Welches Tarifjahr (z.B. 2024, 2025)?
3. **Entgeltgruppe**: (z.B. E13, P8)
4. **Stufe**: (Erfahrungsstufe 1-6)
5. **Arbeitszeit**: Vollzeit (39h/40h) oder Teilzeit (in % oder Stunden)?
6. **Steuerklasse**: (I bis VI)
7. **Kinderfreibeträge**: (Anzahl, z.B. 0, 0.5, 1.0...)
8. **Kirchensteuer**: Ja oder Nein?
9. **Zusatzbeitrag KK**: (optional, nimm ~1.7% an falls unbekannt)

**WICHTIG - Protokoll:**
1. **Fortschritt:** Beginne JEDE Antwort mit \`[PROGRESS: 0]\` bis \`[PROGRESS: 100]\`.
2. **Optionen:** Wenn du eine Frage stellst, biete IMMER passende Antwortmöglichkeiten an. Füge dazu ein Tag im Format \`[OPTIONS: ["Option A", "Option B"]]\` am Ende hinzu. 
   Beispiele:
   - \`[OPTIONS: ["TVöD VKA", "TVöD Bund", "Pflege"]]\`
   - \`[OPTIONS: ["2024", "2025"]]\`
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

export async function POST(request: Request) {
    try {
        const body = await request.json();
        const { message, history, apiKey } = body;

        let activeApiKey = apiKey;
        
        // Fallback to server-side env key if client key is missing or placeholder
        if (!activeApiKey || activeApiKey === 'DEMO') {
            activeApiKey = process.env.GEMINI_API_KEY;
        }

        if (!activeApiKey) {
            return NextResponse.json(
                { error: "API Key is required" },
                { status: 401 }
            );
        }

        const genAI = new GoogleGenAI({ apiKey: activeApiKey });
        
        // Convert history
        // Frontend sends: [{sender: 'user', text: '...'}, {sender: 'bot', text: '...'}]
        // We assume 'history' does NOT contain the current 'message'
        const chatHistory = mapHistoryToContent(history || []);

        const chat = genAI.chats.create({
            model: "gemini-2.0-flash", // Updated to a stable model or keeping the one from frontend? Frontend used preview. using flash for speed/cost.
            config: {
                systemInstruction: SYSTEM_INSTRUCTION,
                temperature: 0.7,
            },
            history: chatHistory
        });

        const result = await chat.sendMessage({
            message: message
        });

        const text = result.text || "";

        return NextResponse.json({ text });

    } catch (error: any) {
        console.error("Gemini API Error:", error);
        return NextResponse.json(
            { error: error.message || "Internal Server Error" },
            { status: 500 }
        );
    }
}

// Enable CORS
export async function OPTIONS(request: Request) {
    return new NextResponse(null, {
        status: 204,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, x-gemini-api-key",
        },
    });
}
