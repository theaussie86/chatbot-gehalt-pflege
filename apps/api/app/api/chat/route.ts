import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GeminiAgent } from "../../../utils/agent/GeminiAgent";
import { Content } from "@google/genai";
import type { FormState, UserIntent } from "../../../types/form";
import { ConversationAnalyzer, type IntentAnalysis } from "../../../utils/agent/ConversationAnalyzer";
import { ResponseValidator, type ValidationResult } from "../../../utils/agent/ResponseValidator";
import { VectorstoreService } from "../../../lib/vectorstore/VectorstoreService";
import { TaxWrapper, type SalaryInput } from "../../../utils/tax";

// Lazy Initialize Supabase Admin Client
let supabaseAdminInstance: SupabaseClient | null = null;

function getSupabaseAdmin() {
    if (!supabaseAdminInstance) {
        const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!url || !key) {
            throw new Error("Supabase credentials (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) are missing.");
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
        
        let fileContextMessages: Content[] = [];

        if (activeProjectId !== process.env.GEMINI_API_KEY && activeProjectId !== 'DEMO') {
             const { data: project, error: projectError } = await getSupabaseAdmin()
                .from('projects')
                .select('id, allowed_origins, gemini_api_key') // removed user_id
                .eq('public_key', activeProjectId)
                .single();

            if (!project || projectError) {
                return NextResponse.json(
                    { error: "Invalid Project ID" },
                    { status: 403 }
                );
            }

            const allowedOrigins = project.allowed_origins || [];
            
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
                .or(`project_id.eq.${project.id},project_id.is.null`);

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

        // --- HYBRID STATE MACHINE LOGIC ---
        const { currentFormState } = body as { currentFormState?: FormState };
        if (currentFormState) {
            const { getGeminiClient } = await import("../../../lib/gemini");
            const { SalaryStateMachine } = await import("../../../lib/salary-flow");
            const client = getGeminiClient();

            // Deep clone to avoid mutation
            let nextFormState: FormState = JSON.parse(JSON.stringify(currentFormState));

            // Initialize services
            const conversationAnalyzer = new ConversationAnalyzer();
            const vectorstore = new VectorstoreService(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_ROLE_KEY!
            );
            const responseValidator = new ResponseValidator(vectorstore);

            // --- US-019: UPDATE CONVERSATION CONTEXT ---
            if (!nextFormState.conversationContext) {
                nextFormState.conversationContext = [];
            }
            // Add current message to context (keep last 10 messages)
            nextFormState.conversationContext.push(message);
            if (nextFormState.conversationContext.length > 10) {
                nextFormState.conversationContext.shift();
            }

            // Clear previous validation errors
            nextFormState.validationErrors = {};

            // --- US-005: INTENT DETECTION ---
            const intentAnalysis: IntentAnalysis = await conversationAnalyzer.analyzeIntent(
                message,
                nextFormState
            );

            // Map ConversationAnalyzer intent to FormState userIntent type
            const intentMapping: Record<string, UserIntent | undefined> = {
                'data_provision': 'data',
                'question': 'question',
                'modification': 'modification',
                'confirmation': 'confirmation',
                'unclear': 'data' // Default unclear to data
            };
            nextFormState.userIntent = intentMapping[intentAnalysis.intent];

            console.log(`[StateMachine] Intent detected: ${intentAnalysis.intent} (confidence: ${intentAnalysis.confidence})`);

            // --- HANDLE COMPLETED STATE ---
            if (nextFormState.section === 'completed') {
                const responsePrompt = `
                    Du bist ein freundlicher Gehalts-Chatbot für Pflegekräfte.
                    Die Berechnung wurde bereits abgeschlossen.

                    Nutzer-Nachricht: "${message}"

                    Aufgabe: Beantworte die Frage des Nutzers freundlich.
                    Wenn er eine neue Berechnung möchte, erkläre ihm, dass er einen neuen Chat starten kann.
                    Halte dich kurz.
                `;
                const responseResult = await client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: responsePrompt
                });
                const responseText = responseResult.text || '';

                return NextResponse.json({
                    text: responseText,
                    formState: nextFormState
                });
            }

            // --- US-007: HANDLE QUESTION INTENT WITH RAG + CITATIONS ---
            if (nextFormState.userIntent === 'question') {
                // Query vectorstore with metadata for citation attribution
                const ragResults = await vectorstore.queryWithMetadata(message, activeProjectId, 3);

                // Filter by similarity threshold to avoid noise
                const relevantResults = ragResults.filter(r => r.similarity >= 0.75);

                // Build context section with citations
                let contextSection = '';
                if (relevantResults.length > 0) {
                    contextSection = `
Relevante Informationen aus hochgeladenen Dokumenten:

${relevantResults.map((r, i) => `
[Quelle ${i + 1}: ${r.metadata.filename}]
${r.content}
`).join('\n---\n')}
`;
                } else {
                    contextSection = 'Hinweis: Ich habe keine relevanten Informationen in den hochgeladenen Dokumenten gefunden.';
                }

                const questionPrompt = `
Du bist ein freundlicher Gehalts-Chatbot fuer Pflegekraefte.
Der Nutzer hat eine Frage gestellt.

Nutzer-Frage: "${message}"

${contextSection}

Aktueller Status: Wir sind im Schritt "${nextFormState.section}".
Noch fehlende Informationen: ${nextFormState.missingFields?.join(', ') || 'keine'}

Aufgabe:
1. Beantworte die Frage kurz und praezise basierend auf den Informationen aus den Dokumenten
2. Zitiere die Quelle am Ende deiner Antwort (z.B. "Quelle: Dokument.pdf")
3. Wenn keine relevanten Informationen gefunden wurden, sage das ehrlich
4. Kehre dann sanft zum Interview zurueck und frage nach den fehlenden Daten

WICHTIG:
- Frage nicht nach technischen Begriffen wie "Entgeltgruppe" oder "Stufe"
- Frage stattdessen nach dem Beruf, der Ausbildung, den Arbeitsstunden, etc.
- Antworte NUR mit Informationen aus den bereitgestellten Quellen
- Bei Unsicherheit: "Dazu habe ich keine Informationen in meinen Dokumenten."

Fortschritt: [PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]
                `;

                const responseResult = await client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: questionPrompt
                });
                let responseText = responseResult.text || '';

                // Add progress marker if not present
                if (!responseText.includes('[PROGRESS:')) {
                    responseText += `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;
                }

                return NextResponse.json({
                    text: responseText,
                    formState: nextFormState
                });
            }

            // --- US-013: HANDLE CONFIRMATION IN SUMMARY ---
            if (nextFormState.section === 'summary' && nextFormState.userIntent === 'confirmation') {
                if (!SalaryStateMachine.isComplete(nextFormState)) {
                    // Should not happen, but handle gracefully
                    const errorPrompt = `
                        Du bist ein freundlicher Gehalts-Chatbot.
                        Der Nutzer will bestätigen, aber es fehlen noch Daten.

                        Erkläre kurz, dass noch Informationen fehlen und frage danach.
                    `;
                    const responseResult = await client.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: errorPrompt
                    });
                    return NextResponse.json({
                        text: responseResult.text || '',
                        formState: nextFormState
                    });
                }

                // --- US-014 & US-015: MAP FORMSTATE AND TRIGGER CALCULATION ---
                try {
                    const taxWrapper = new TaxWrapper();
                    const jobData = nextFormState.data.job_details || {};
                    const taxData = nextFormState.data.tax_details || {};

                    // Calculate yearly salary from tariff data
                    // For now, use a rough estimate based on group and experience
                    // In production, this would query actual tariff tables
                    const estimatedYearlySalary = estimateYearlySalary(
                        jobData.tarif,
                        jobData.group,
                        jobData.experience,
                        jobData.hours
                    );

                    // Map churchTax to proper format
                    let churchTaxValue: 'none' | 'bayern' | 'baden_wuerttemberg' | 'common' = 'none';
                    if (taxData.churchTax === true || taxData.churchTax === 'true' || taxData.churchTax === 'ja') {
                        // Default to common (9%) for most states
                        churchTaxValue = 'common';
                    }

                    // Map state to category
                    let stateCategory: 'west' | 'east' | 'sachsen' = 'west';
                    const stateLower = (jobData.state || '').toLowerCase();
                    if (stateLower.includes('sachsen') && !stateLower.includes('anhalt')) {
                        stateCategory = 'sachsen';
                    } else if (['thüringen', 'sachsen-anhalt', 'brandenburg', 'mecklenburg', 'berlin'].some(s => stateLower.includes(s))) {
                        stateCategory = 'east';
                    }

                    const salaryInput: SalaryInput = {
                        yearlySalary: estimatedYearlySalary,
                        taxClass: parseInt(taxData.taxClass || '1', 10),
                        year: new Date().getFullYear(),
                        hasChildren: (taxData.numberOfChildren || 0) > 0,
                        childCount: taxData.numberOfChildren || 0,
                        churchTax: churchTaxValue,
                        state: stateCategory,
                        birthYear: taxData.birthYear,
                        healthInsuranceAddOn: 1.6
                    };

                    console.log('[StateMachine] Calculating salary with input:', salaryInput);

                    const calculationResult = taxWrapper.calculate(salaryInput);

                    // --- US-016: FORMAT RESULTS ---
                    // TaxResult returns monthly values already
                    const monthlyBrutto = salaryInput.yearlySalary / 12;
                    const monthlyNetto = calculationResult.netto;

                    const formattedResult = formatCalculationResult(calculationResult, jobData, taxData);

                    // --- US-017: SAVE TO DATABASE ---
                    const saveResult = await getSupabaseAdmin()
                        .from('salary_inquiries')
                        .insert({
                            public_key: activeProjectId,
                            gruppe: jobData.group || 'P7',
                            stufe: jobData.experience || '2',
                            tarif: jobData.tarif || 'tvoed',
                            jahr: new Date().getFullYear(),
                            brutto: monthlyBrutto,
                            netto: monthlyNetto,
                            details: {
                                ...calculationResult,
                                job_details: jobData,
                                tax_details: taxData
                            }
                        });

                    if (saveResult.error) {
                        console.error('[StateMachine] Failed to save calculation:', saveResult.error);
                    }

                    // --- US-018: TRANSITION TO COMPLETED ---
                    nextFormState.section = 'completed';
                    nextFormState.data.calculation_result = {
                        brutto: monthlyBrutto,
                        netto: monthlyNetto,
                        taxes: calculationResult.taxes.lohnsteuer + calculationResult.taxes.soli + calculationResult.taxes.kirchensteuer,
                        socialContributions: calculationResult.socialSecurity.kv + calculationResult.socialSecurity.rv + calculationResult.socialSecurity.av + calculationResult.socialSecurity.pv,
                        year: new Date().getFullYear()
                    };
                    nextFormState.missingFields = [];

                    return NextResponse.json({
                        text: formattedResult + '\n\n[PROGRESS: 100]',
                        formState: nextFormState
                    });

                } catch (calcError) {
                    console.error('[StateMachine] Calculation error:', calcError);

                    const errorPrompt = `
                        Du bist ein freundlicher Gehalts-Chatbot.
                        Bei der Berechnung ist ein Fehler aufgetreten.

                        Entschuldige dich höflich und bitte den Nutzer, die Daten zu überprüfen.
                    `;
                    const responseResult = await client.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: errorPrompt
                    });
                    return NextResponse.json({
                        text: responseResult.text || '',
                        formState: nextFormState
                    });
                }
            }

            // --- US-012: HANDLE MODIFICATION IN SUMMARY ---
            if (nextFormState.section === 'summary' && nextFormState.userIntent === 'modification') {
                // Detect which field to modify
                const modificationPrompt = `
                    Du bist ein Daten-Extraktor.
                    Der Nutzer möchte eine Angabe ändern.

                    Nutzer-Nachricht: "${message}"

                    Aktuelle Daten:
                    ${JSON.stringify(nextFormState.data, null, 2)}

                    Aufgabe: Bestimme welches Feld geändert werden soll und extrahiere den neuen Wert.
                    Gib NUR JSON zurück:
                    {
                        "field": "feldname (tarif, experience, hours, state, taxClass, churchTax, numberOfChildren)",
                        "section": "job_details oder tax_details",
                        "newValue": "neuer wert"
                    }

                    Wenn unklar, gib {"field": null} zurück.
                `;

                try {
                    const modResult = await client.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: modificationPrompt,
                        config: { responseMimeType: 'application/json' }
                    });
                    const modText = modResult.text || '';
                    const cleanJson = modText.replace(/```json/g, '').replace(/```/g, '').trim();
                    const modification = JSON.parse(cleanJson);

                    if (modification.field && modification.newValue && modification.section) {
                        // Validate and update the field
                        const validationResult = await responseValidator.validate(
                            modification.field,
                            modification.newValue,
                            activeProjectId
                        );

                        if (validationResult.valid) {
                            // Update the field
                            const section = modification.section as 'job_details' | 'tax_details';
                            if (!nextFormState.data[section]) {
                                nextFormState.data[section] = {};
                            }
                            nextFormState.data[section]![modification.field] = validationResult.normalizedValue ?? modification.newValue;

                            // Re-display summary
                            const summary = SalaryStateMachine.formatSummary(nextFormState);
                            const summaryResponse = `
Ich habe ${SalaryStateMachine.getFieldLabel(modification.field)} auf "${validationResult.normalizedValue ?? modification.newValue}" geändert.

${summary}

Stimmt das so? Sag "Ja" oder "Berechnen" um das Netto-Gehalt zu berechnen, oder nenne mir was du ändern möchtest.

[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]
                            `;

                            return NextResponse.json({
                                text: summaryResponse,
                                formState: nextFormState
                            });
                        } else {
                            // Validation failed
                            nextFormState.validationErrors = {
                                [modification.field]: validationResult.error || 'Ungültiger Wert'
                            };
                        }
                    }
                } catch (e) {
                    console.error('[StateMachine] Modification extraction failed:', e);
                }

                // If we couldn't understand the modification, ask for clarification
                const clarifyPrompt = `
                    Du bist ein freundlicher Gehalts-Chatbot.
                    Der Nutzer möchte etwas ändern, aber ich habe nicht verstanden was.

                    ${SalaryStateMachine.formatSummary(nextFormState)}

                    Frage höflich nach, welchen Wert der Nutzer ändern möchte.
                `;
                const responseResult = await client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: clarifyPrompt
                });
                return NextResponse.json({
                    text: (responseResult.text || '') + `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`,
                    formState: nextFormState
                });
            }

            // --- US-005 & US-006: EXTRACTION PHASE WITH VALIDATION ---
            // Only extract data when intent is 'data' or 'modification'
            if ((nextFormState.userIntent === 'data' || nextFormState.userIntent === 'modification') &&
                nextFormState.missingFields && nextFormState.missingFields.length > 0) {

                const extractPrompt = `
                    Du bist ein Daten-Extraktor.
                    Kontext: Wir sammeln Daten für: ${JSON.stringify(nextFormState.missingFields)}.
                    Nutzer-Nachricht: "${message}"

                    Konversationskontext (letzte Nachrichten):
                    ${nextFormState.conversationContext?.slice(-3).join('\n') || 'keine'}

                    Aufgabe: Extrahiere Werte für die gesuchten Felder. Sei tolerant bei der Eingabe.

                    Mapping-Hilfe:
                    - Beruf/Ausbildung → tarif + experience (z.B. "Pflegefachkraft, 5 Jahre")
                    - Arbeitszeit → hours (z.B. "Vollzeit" = 38.5, "30 Stunden" = 30)
                    - Ort/Region → state (z.B. "NRW" = "Nordrhein-Westfalen")
                    - Familienstand → taxClass (ledig=1, verheiratet=4)
                    - Kinder → numberOfChildren
                    - Kirchenmitglied → churchTax (ja/nein → true/false)

                    Gib NUR ein JSON zurück: { "extracted": { "field": "value" } }
                    Wenn nichts gefunden, gib leeres Objekt: { "extracted": {} }
                `;

                try {
                    const result = await client.models.generateContent({
                        model: 'gemini-2.5-flash',
                        contents: extractPrompt,
                        config: { responseMimeType: 'application/json' }
                    });
                    const text = result.text || '';
                    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const extraction = JSON.parse(cleanJson);

                    if (extraction.extracted && Object.keys(extraction.extracted).length > 0) {
                        // --- US-006: VALIDATE AND ENRICH EACH FIELD ---
                        const section = nextFormState.section as 'job_details' | 'tax_details';
                        if (!nextFormState.data[section]) nextFormState.data[section] = {};

                        for (const [field, value] of Object.entries(extraction.extracted)) {
                            const validationResult: ValidationResult = await responseValidator.validate(
                                field,
                                value,
                                activeProjectId
                            );

                            if (validationResult.valid) {
                                // Use normalized value if available
                                nextFormState.data[section]![field] = validationResult.normalizedValue ?? value;
                            } else {
                                // Store validation error for clarification
                                if (!nextFormState.validationErrors) nextFormState.validationErrors = {};
                                nextFormState.validationErrors[field] = validationResult.error || 'Ungültiger Wert';
                                if (validationResult.suggestion) {
                                    nextFormState.validationErrors[field] += `. ${validationResult.suggestion}`;
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("[StateMachine] Extraction failed:", e);
                    // Proceed without update, state machine will re-ask
                }
            }

            // --- US-008: GENERATE CLARIFICATION IF VALIDATION ERRORS ---
            if (nextFormState.validationErrors && Object.keys(nextFormState.validationErrors).length > 0) {
                const errorMessages = Object.entries(nextFormState.validationErrors)
                    .map(([field, error]) => `- ${SalaryStateMachine.getFieldLabel(field)}: ${error}`)
                    .join('\n');

                const clarifyPrompt = `
                    Du bist ein freundlicher Gehalts-Chatbot für Pflegekräfte.

                    Bei einigen Angaben gab es Probleme:
                    ${errorMessages}

                    Aufgabe: Erkläre dem Nutzer freundlich, dass du die Eingabe nicht ganz verstanden hast.
                    Gib Beispiele für gültige Eingaben.

                    WICHTIG: Sprich den Nutzer direkt an, sei nicht technisch.
                    Beispiel: "Ich habe deine Angabe zu den Wochenstunden nicht ganz verstanden. Kannst du mir sagen, wie viele Stunden du pro Woche arbeitest? Zum Beispiel 38,5 für Vollzeit oder 20 für Teilzeit."
                `;

                const responseResult = await client.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: clarifyPrompt
                });
                return NextResponse.json({
                    text: (responseResult.text || '') + `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`,
                    formState: nextFormState
                });
            }

            // --- STATE MACHINE LOGIC (Transition & Guardrails) ---
            const stepResult = SalaryStateMachine.getNextStep(nextFormState);
            nextFormState = stepResult.nextState;

            // --- US-011: SUMMARY STATE DISPLAY ---
            if (nextFormState.section === 'summary') {
                const summary = SalaryStateMachine.formatSummary(nextFormState);
                const summaryResponse = `
${summary}

Stimmt das so? Sag "Ja" oder "Berechnen" um das Netto-Gehalt zu berechnen, oder nenne mir was du ändern möchtest.

[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]
                `;

                return NextResponse.json({
                    text: summaryResponse,
                    formState: nextFormState
                });
            }

            // --- US-009 & US-010: RESPONSE GENERATION WITH USER-FRIENDLY LANGUAGE ---
            const progress = SalaryStateMachine.getProgress(nextFormState);


            // Build context-aware prompt for user-friendly questions
            const userFriendlyPrompt = buildUserFriendlyPrompt(
                nextFormState,
                stepResult.systemInstructions,
                message,
                progress
            );

            const responseResult = await client.models.generateContent({
                 model: 'gemini-2.5-flash',
                 contents: userFriendlyPrompt
            });
            let responseText = responseResult.text || '';

            // Ensure progress marker is included
            if (!responseText.includes('[PROGRESS:')) {
                responseText += `\n\n[PROGRESS: ${progress}]`;
            }

            return NextResponse.json({
                text: responseText,
                formState: nextFormState
            });
        }

        // --- AGENT EXECUTION (Legacy / Standard Chat) ---
        const agent = new GeminiAgent();
        
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

// --- HELPER FUNCTIONS ---

/**
 * Estimate yearly salary based on tariff information
 * US-014: Map FormState to calculate_net_salary parameters
 */
function estimateYearlySalary(
    tarif?: string,
    group?: string,
    experience?: string,
    hours?: number
): number {
    // Base salary table for TVöD-P (Pflege) 2025/2026 (approximate monthly values)
    const tarifTable: Record<string, Record<string, number[]>> = {
        'tvoed': {
            // Format: [Stufe 1, Stufe 2, Stufe 3, Stufe 4, Stufe 5, Stufe 6]
            'P5': [2750, 2900, 3000, 3100, 3200, 3300],
            'P6': [2900, 3050, 3150, 3280, 3400, 3500],
            'P7': [3100, 3280, 3450, 3620, 3800, 3950],
            'P8': [3350, 3550, 3750, 3950, 4150, 4350],
            'P9': [3600, 3850, 4100, 4350, 4600, 4800],
            'P10': [3900, 4150, 4450, 4750, 5050, 5300],
            'P11': [4100, 4400, 4700, 5000, 5350, 5650],
            'P12': [4350, 4650, 5000, 5350, 5700, 6050],
            'E5': [2900, 3050, 3150, 3280, 3400, 3500],
            'E6': [3000, 3150, 3280, 3420, 3550, 3680],
            'E7': [3100, 3280, 3450, 3620, 3800, 3950],
            'E8': [3350, 3550, 3750, 3950, 4150, 4350],
            'E9a': [3450, 3680, 3900, 4100, 4300, 4500],
            'E9b': [3600, 3850, 4100, 4350, 4600, 4800],
        },
        'tv-l': {
            'P5': [2700, 2850, 2950, 3050, 3150, 3250],
            'P6': [2850, 3000, 3100, 3230, 3350, 3450],
            'P7': [3050, 3230, 3400, 3570, 3750, 3900],
            'P8': [3300, 3500, 3700, 3900, 4100, 4300],
        },
        'avr': {
            'P5': [2800, 2950, 3050, 3150, 3250, 3350],
            'P6': [2950, 3100, 3200, 3330, 3450, 3550],
            'P7': [3150, 3330, 3500, 3670, 3850, 4000],
            'P8': [3400, 3600, 3800, 4000, 4200, 4400],
        }
    };

    // Normalize inputs
    const normalizedTarif = (tarif || 'tvoed').toLowerCase().replace('tvöd', 'tvoed');
    const normalizedGroup = (group || 'P7').toUpperCase();

    // Parse experience to stufe (1-6)
    let stufeIndex = 1; // Default Stufe 2 (index 1)
    if (experience) {
        const expLower = experience.toLowerCase();
        // If already a stufe number
        const stufeMatch = expLower.match(/(\d)/);
        if (stufeMatch) {
            stufeIndex = Math.min(5, Math.max(0, parseInt(stufeMatch[1], 10) - 1));
        } else if (expLower.includes('jahr')) {
            // Parse years of experience
            const yearsMatch = expLower.match(/(\d+)/);
            if (yearsMatch) {
                const years = parseInt(yearsMatch[1], 10);
                if (years < 1) stufeIndex = 0;
                else if (years < 3) stufeIndex = 1;
                else if (years < 6) stufeIndex = 2;
                else if (years < 10) stufeIndex = 3;
                else if (years < 15) stufeIndex = 4;
                else stufeIndex = 5;
            }
        }
    }

    // Get monthly base salary
    const tarifData = tarifTable[normalizedTarif] || tarifTable['tvoed'];
    const groupData = tarifData[normalizedGroup] || tarifData['P7'] || [3100, 3280, 3450, 3620, 3800, 3950];
    const monthlySalary = groupData[stufeIndex] || groupData[1];

    // Adjust for part-time (assume 38.5 hours is full-time)
    const fullTimeHours = 38.5;
    const actualHours = hours || fullTimeHours;
    const adjustedMonthlySalary = monthlySalary * (actualHours / fullTimeHours);

    // Return yearly salary
    return Math.round(adjustedMonthlySalary * 12);
}

/**
 * Format calculation results for display
 * US-016: Format and display calculation results
 */
function formatCalculationResult(
    result: { netto: number; taxes: { lohnsteuer: number; soli: number; kirchensteuer: number }; socialSecurity: { kv: number; rv: number; av: number; pv: number } },
    jobData: { tarif?: string; group?: string; experience?: string; hours?: number; state?: string },
    taxData: { taxClass?: string; churchTax?: boolean | string; numberOfChildren?: number }
): string {
    // TaxResult returns monthly values
    const monthlyNetto = result.netto;
    const monthlyTaxes = result.taxes.lohnsteuer + result.taxes.soli + result.taxes.kirchensteuer;
    const monthlySocial = result.socialSecurity.kv + result.socialSecurity.rv + result.socialSecurity.av + result.socialSecurity.pv;
    // Calculate brutto from netto + deductions
    const monthlyBrutto = monthlyNetto + monthlyTaxes + monthlySocial;

    const formatEuro = (amount: number) => {
        return new Intl.NumberFormat('de-DE', {
            style: 'currency',
            currency: 'EUR'
        }).format(amount);
    };

    return `
🎉 **Deine Gehaltsberechnung ist fertig!**

📊 **Monatliche Übersicht (${new Date().getFullYear()}):**

💰 **Bruttogehalt:** ${formatEuro(monthlyBrutto)}
💵 **Nettogehalt:** ${formatEuro(monthlyNetto)}

📉 **Abzüge:**
• Lohnsteuer: ${formatEuro(result.taxes.lohnsteuer)}
• Solidaritätszuschlag: ${formatEuro(result.taxes.soli)}
• Kirchensteuer: ${formatEuro(result.taxes.kirchensteuer)}
• Sozialabgaben: ${formatEuro(monthlySocial)}
  - Krankenversicherung: ${formatEuro(result.socialSecurity.kv)}
  - Rentenversicherung: ${formatEuro(result.socialSecurity.rv)}
  - Arbeitslosenversicherung: ${formatEuro(result.socialSecurity.av)}
  - Pflegeversicherung: ${formatEuro(result.socialSecurity.pv)}

📋 **Deine Angaben:**
• Tarif: ${jobData.tarif || 'TVöD'}
• Entgeltgruppe: ${jobData.group || 'P7'}
• Stufe: ${jobData.experience || '2'}
• Wochenstunden: ${jobData.hours || 38.5}
• Steuerklasse: ${taxData.taxClass || '1'}

✅ Die Berechnung wurde gespeichert. Bei Fragen helfe ich dir gerne weiter!
    `.trim();
}

/**
 * Build a user-friendly prompt for response generation
 * US-009: Update response prompts to user-friendly language
 */
function buildUserFriendlyPrompt(
    formState: FormState,
    systemInstructions: string,
    userMessage: string,
    progress: number
): string {
    const section = formState.section;
    const missingFields = formState.missingFields || [];

    // Map technical fields to user-friendly questions
    const fieldQuestions: Record<string, string> = {
        tarif: 'Unter welchem Tarifvertrag arbeitest du? (z.B. TVöD, TV-L, AVR, oder "öffentlicher Dienst")',
        group: 'Was ist deine Tätigkeit oder Qualifikation? (z.B. Pflegefachkraft, Pflegehelfer, Stationsleitung)',
        experience: 'Wie lange arbeitest du schon in diesem Beruf?',
        hours: 'Arbeitest du Vollzeit oder Teilzeit? Wie viele Stunden pro Woche?',
        state: 'In welchem Bundesland arbeitest du?',
        taxClass: 'Bist du verheiratet oder ledig? (Das hilft mir bei der Steuerklasse)',
        churchTax: 'Bist du Mitglied in einer Kirche und zahlst Kirchensteuer?',
        numberOfChildren: 'Hast du Kinder? Wenn ja, wie viele?'
    };

    const nextFieldToAsk = missingFields[0];
    const friendlyQuestion = nextFieldToAsk ? fieldQuestions[nextFieldToAsk] : '';

    return `
Du bist ein freundlicher Gehalts-Chatbot für Pflegekräfte.
Sprich den Nutzer locker und direkt an. Verwende "du".

Aktueller Status: ${section === 'job_details' ? 'Berufliche Daten sammeln' : 'Steuerliche Daten sammeln'}
Fortschritt: ${progress}%

Nutzer-Nachricht: "${userMessage}"

${systemInstructions}

Nächste zu stellende Frage (in deinen eigenen Worten):
${friendlyQuestion || 'Keine spezifische Frage mehr nötig'}

WICHTIG:
- Frage NICHT nach technischen Begriffen wie "Entgeltgruppe" oder "Stufe"
- Frage stattdessen nach Beruf, Ausbildung, Erfahrung, Arbeitszeit, etc.
- Bedanke dich kurz für die letzte Antwort (wenn sinnvoll)
- Stelle dann die nächste Frage auf natürliche Weise
- Halte dich kurz (2-3 Sätze max)
- Du bist Experte und übersetzt die Antworten intern in technische Werte

Beispiel-Dialoge:
- Statt "Welche Entgeltgruppe?" → "Was machst du beruflich? Bist du Pflegefachkraft oder hast du eine andere Ausbildung?"
- Statt "Welche Stufe?" → "Wie lange bist du schon dabei?"
- Statt "Steuerklasse?" → "Bist du verheiratet oder ledig?"

Fortschritt einbauen: [PROGRESS: ${progress}]
    `;
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
