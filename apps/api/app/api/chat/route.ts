import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { GeminiAgent } from "../../../utils/agent/GeminiAgent";
import { Content } from "@google/genai";
import type { FormState, UserIntent } from "../../../types/form";
import { ConversationAnalyzer, type IntentAnalysis } from "../../../utils/agent/ConversationAnalyzer";
import { fieldValidator, type FieldValidationResult } from "../../../utils/agent/FieldValidator";
import { VectorstoreService, formatPageRange } from "../../../lib/vectorstore/VectorstoreService";

// Citation type for admin traceability
interface Citation {
  documentId: string;
  documentName: string;
  pages: string | null;  // "S. 5" or "S. 5-7" or null
  similarity: number;
}
import { TaxWrapper, type SalaryInput } from "../../../utils/tax";
import { generateSuggestions, generateEscalationChips } from "../../../lib/suggestions";

/**
 * Build a chat response with PROGRESS tags stripped from text.
 * Progress is extracted and returned as a separate JSON field.
 */
function buildChatResponse(
  text: string,
  formState: FormState,
  extras?: { suggestions?: string[]; inquiryId?: string | null }
) {
  // Extract progress value from first match
  const progressMatch = text.match(/\[PROGRESS:\s*(\d+)%?\]/);
  const progress = progressMatch ? parseInt(progressMatch[1], 10) : null;

  // Strip ALL progress tags from text (handles %, duplicates, AI-generated variants)
  const cleanText = text.replace(/\[PROGRESS:\s*\d+%?\]/g, '').trim();

  return NextResponse.json({
    text: cleanText,
    formState,
    progress,
    ...extras,
  });
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
        const { message, history, projectId, apiKey, sessionId } = body;
        const origin = request.headers.get('origin');
        const ip = (request.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';

        if (!message || typeof message !== 'string') {
            return NextResponse.json({ error: "message is required and must be a string" }, { status: 400 });
        }
        if (message.length > 2000) {
            return NextResponse.json({ error: "message exceeds maximum length of 2000 characters" }, { status: 400 });
        }
        const validatedHistory = Array.isArray(history) ? history : [];

        // Prefer 'projectId', fallback to 'apiKey' (legacy)
        const activeProjectId = projectId || apiKey;
        
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
            public_key: activeProjectId
        }).then();

        // 2. Project lookup, Origin Check & Document Injection

        let fileContextMessages: Content[] = [];

        const { data: project, error: projectError } = await getSupabaseAdmin()
            .from('projects')
            .select('id, allowed_origins, gemini_api_key')
            .eq('public_key', activeProjectId)
            .single();

        if (!project || projectError) {
            return NextResponse.json(
                { error: "Invalid Project ID" },
                { status: 403 }
            );
        }

        const allowedOrigins = project.allowed_origins || [];
        const normalizeOrigin = (o: string) => o.replace(/\/+$/, '');
        const normalizedOrigin = origin ? normalizeOrigin(origin) : null;
        const normalizedAllowedOrigins = allowedOrigins.map(normalizeOrigin);

        if (normalizedAllowedOrigins.length > 0 && (!normalizedOrigin || !normalizedAllowedOrigins.includes(normalizedOrigin))) {
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
        
        // --- END SECURITY CHECKS ---

        // --- HYBRID STATE MACHINE LOGIC ---
        const { currentFormState } = body as { currentFormState?: FormState };
        if (currentFormState) {
            const { getGeminiClient, generateWithRetry } = await import("../../../lib/gemini");
            const { SalaryStateMachine } = await import("../../../lib/salary-flow");
            const client = getGeminiClient();

            // Deep clone to avoid mutation
            let nextFormState: FormState = JSON.parse(JSON.stringify(currentFormState));

            // Initialize services
            const conversationAnalyzer = new ConversationAnalyzer();
            const vectorstore = new VectorstoreService(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.SUPABASE_SERVICE_KEY!
            );

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
                const responseResult = await generateWithRetry(client, {
                    model: 'gemini-2.5-flash',
                    contents: responsePrompt
                });
                const responseText = responseResult.text || '';

                return buildChatResponse(responseText, nextFormState, {
                    suggestions: await generateSuggestions(nextFormState, responseText)
                });
            }

            // --- US-007: HANDLE QUESTION INTENT WITH RAG (NO USER-FACING CITATIONS) ---
            if (nextFormState.userIntent === 'question') {
                // Query vectorstore with metadata for citation attribution
                const ragResults = await vectorstore.queryWithMetadata(message, activeProjectId, 5);

                // Results are already filtered by 0.5 threshold in VectorstoreService
                const relevantResults = ragResults;

                // Build citations array for admin storage (only chunks with page data per CONTEXT.md)
                const ragCitations: Citation[] = relevantResults
                    .filter(r => r.metadata.pageStart !== null)  // Only cite chunks with page data
                    .slice(0, 3)  // Top 3 most relevant
                    .map(r => ({
                        documentId: r.metadata.documentId,
                        documentName: r.metadata.filename,
                        pages: formatPageRange(r.metadata.pageStart, r.metadata.pageEnd),
                        similarity: r.similarity
                    }));

                // Store citations in formState for later persistence when calculation completes
                if (ragCitations.length > 0) {
                    nextFormState.ragCitations = ragCitations;
                }

                // Log RAG metadata in development mode
                if (process.env.NODE_ENV === 'development') {
                    console.log('\n━━━ RAG Query ━━━');
                    console.log(`Question: ${message}`);
                    console.log(`Project: ${activeProjectId}`);
                    console.log(`Results: ${relevantResults.length}`);
                    console.log(`Citations (with page data): ${ragCitations.length}`);
                    if (relevantResults.length > 0) {
                        console.log('\nMatches:');
                        relevantResults.forEach((r, i) => {
                            console.log(`  [${i + 1}] ${r.metadata.filename} (chunk ${r.metadata.chunkIndex})`);
                            console.log(`      Similarity: ${(r.similarity * 100).toFixed(1)}%`);
                            console.log(`      Pages: ${formatPageRange(r.metadata.pageStart, r.metadata.pageEnd) || 'N/A'}`);
                            console.log(`      Preview: ${r.content.substring(0, 100)}...`);
                        });
                    }
                    console.log('━━━━━━━━━━━━━━━━━\n');
                }

                // Build context section WITHOUT citation labels (admin-only citations per CONTEXT.md)
                let contextSection = '';
                if (relevantResults.length > 0) {
                    contextSection = `
Relevante Informationen aus hochgeladenen Dokumenten:

${relevantResults.map(r => r.content).join('\n\n---\n\n')}
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
2. Wenn keine relevanten Informationen gefunden wurden, sage das ehrlich
3. Kehre dann sanft zum Interview zurueck und frage nach den fehlenden Daten

WICHTIG:
- Frage nicht nach technischen Begriffen wie "Entgeltgruppe" oder "Stufe"
- Frage stattdessen nach dem Beruf, der Ausbildung, den Arbeitsstunden, etc.
- Antworte NUR mit Informationen aus den bereitgestellten Quellen
- Bei Unsicherheit: "Dazu habe ich keine Informationen in meinen Dokumenten."
- NENNE KEINE QUELLENANGABEN in deiner Antwort (die werden intern gespeichert)

Fortschritt: [PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]
                `;

                const responseResult = await generateWithRetry(client, {
                    model: 'gemini-2.5-flash',
                    contents: questionPrompt
                });
                let responseText = responseResult.text || '';

                // Add progress marker if not present
                if (!responseText.includes('[PROGRESS:')) {
                    responseText += `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;
                }

                return buildChatResponse(responseText, nextFormState, {
                    suggestions: await generateSuggestions(nextFormState, responseText)
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
                    const responseResult = await generateWithRetry(client, {
                        model: 'gemini-2.5-flash',
                        contents: errorPrompt
                    });
                    return buildChatResponse(responseResult.text || '', nextFormState, {
                        suggestions: await generateSuggestions(nextFormState, responseResult.text || '')
                    });
                }

                // --- US-014 & US-015: MAP FORMSTATE AND TRIGGER CALCULATION ---
                try {
                    const { executeTariffLookup } = await import("../../../utils/agent/tools/tariffLookup");
                    const taxWrapper = new TaxWrapper();
                    const jobData = nextFormState.data.job_details || {};
                    const taxData = nextFormState.data.tax_details || {};

                    // Parse experience to stufe (1-6)
                    let stufe = '2'; // Default
                    if (jobData.experience) {
                        const expStr = String(jobData.experience).toLowerCase();
                        const stufeMatch = expStr.match(/stufe\s*(\d)/i) || expStr.match(/^(\d)$/);
                        if (stufeMatch) {
                            stufe = stufeMatch[1];
                        } else {
                            // Parse years of experience
                            const yearsMatch = expStr.match(/(\d+)/);
                            if (yearsMatch) {
                                const years = parseInt(yearsMatch[1], 10);
                                if (years < 1) stufe = '1';
                                else if (years < 3) stufe = '2';
                                else if (years < 6) stufe = '3';
                                else if (years < 10) stufe = '4';
                                else if (years < 15) stufe = '5';
                                else stufe = '6';
                            }
                        }
                    }

                    // Normalize tarif to valid enum value
                    let normalizedTarif: 'tvoed' | 'tv-l' | 'avr' = 'tvoed';
                    const tarifLower = (jobData.tarif || '').toLowerCase().replace('tvöd', 'tvoed');
                    if (tarifLower === 'tv-l' || tarifLower === 'tvl') {
                        normalizedTarif = 'tv-l';
                    } else if (tarifLower === 'avr') {
                        normalizedTarif = 'avr';
                    }

                    // Ensure stufe is valid enum value
                    const validStufe = ['1', '2', '3', '4', '5', '6'].includes(stufe)
                        ? stufe as '1' | '2' | '3' | '4' | '5' | '6'
                        : '2' as const;

                    // --- RAG-BASED TARIFF LOOKUP ---
                    // First try to get salary from uploaded documents
                    let estimatedYearlySalary: number;
                    let salarySource: string = 'hardcoded';

                    const ragTariffResult = await vectorstore.queryTariffData(
                        normalizedTarif,
                        jobData.group || 'P7',
                        validStufe,
                        activeProjectId
                    );

                    if (ragTariffResult.success && ragTariffResult.yearlyGross) {
                        // Adjust for part-time if needed
                        const hours = jobData.hours || 38.5;
                        const fullTimeHours = 38.5;
                        estimatedYearlySalary = ragTariffResult.yearlyGross * (hours / fullTimeHours);
                        salarySource = ragTariffResult.source || 'document';
                        console.log('[StateMachine] Using RAG tariff data:', {
                            yearly: estimatedYearlySalary,
                            monthly: ragTariffResult.monthlyGross,
                            source: salarySource
                        });
                    } else {
                        // Fall back to hardcoded tables
                        console.log('[StateMachine] RAG tariff lookup failed, using hardcoded tables:', ragTariffResult.error);

                        const tariffResult = executeTariffLookup({
                            tarif: normalizedTarif,
                            group: jobData.group || 'P7',
                            stufe: validStufe,
                            hours: jobData.hours || 38.5
                        });

                        if (!tariffResult.success) {
                            console.error('[StateMachine] Hardcoded tariff lookup also failed:', tariffResult.error);
                        }

                        estimatedYearlySalary = tariffResult.success
                            ? tariffResult.grossSalary!
                            : estimateYearlySalary(jobData.tarif, jobData.group, jobData.experience, jobData.hours);
                    }

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

                    // --- US-017: SAVE TO DATABASE WITH CITATIONS ---
                    // Consolidate citations by document (merge pages from same document)
                    const rawCitations = (nextFormState.ragCitations as Citation[] | undefined) || [];
                    const consolidatedCitations = consolidateCitationsByDocument(rawCitations);

                    // Use upsert if we have a sessionId (update draft to completed)
                    // Otherwise fall back to insert for backwards compatibility

                    // Parse stufe to integer (column is integer type)
                    let completedStufe: number = 2; // Default
                    if (jobData.experience) {
                        const match = String(jobData.experience).match(/(\d+)/);
                        if (match) {
                            completedStufe = parseInt(match[1], 10);
                        }
                    }

                    const saveData = {
                        public_key: activeProjectId,
                        gruppe: jobData.group || 'P7',
                        stufe: completedStufe,
                        tarif: jobData.tarif || 'tvoed',
                        jahr: String(new Date().getFullYear()),  // Column is text type
                        brutto: monthlyBrutto,
                        netto: monthlyNetto,
                        status: 'completed',
                        last_section: 'completed',
                        details: {
                            ...calculationResult,
                            job_details: jobData,
                            tax_details: taxData,
                            citations: consolidatedCitations,  // Admin-only RAG citations
                            salarySource  // Track if salary came from RAG documents or hardcoded tables
                        },
                        ...(sessionId && { session_id: sessionId })
                    };

                    const saveResult = sessionId
                        ? await getSupabaseAdmin()
                            .from('salary_inquiries')
                            .upsert(saveData, { onConflict: 'session_id' })
                            .select('id')
                            .single()
                        : await getSupabaseAdmin()
                            .from('salary_inquiries')
                            .insert(saveData)
                            .select('id')
                            .single();

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

                    return buildChatResponse(formattedResult + '\n\n[PROGRESS: 100]', nextFormState, {
                        inquiryId: saveResult.data?.id || null,
                        suggestions: await generateSuggestions(nextFormState, formattedResult)
                    });

                } catch (calcError) {
                    console.error('[StateMachine] Calculation error:', calcError);

                    const errorPrompt = `
                        Du bist ein freundlicher Gehalts-Chatbot.
                        Bei der Berechnung ist ein Fehler aufgetreten.

                        Entschuldige dich höflich und bitte den Nutzer, die Daten zu überprüfen.
                    `;
                    const responseResult = await generateWithRetry(client, {
                        model: 'gemini-2.5-flash',
                        contents: errorPrompt
                    });
                    return buildChatResponse(responseResult.text || '', nextFormState, {
                        suggestions: await generateSuggestions(nextFormState, responseResult.text || '')
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
                    const modResult = await generateWithRetry(client, {
                        model: 'gemini-2.5-flash',
                        contents: modificationPrompt,
                        config: { responseMimeType: 'application/json' }
                    });
                    const modText = modResult.text || '';
                    const cleanJson = modText.replace(/```json/g, '').replace(/```/g, '').trim();
                    const modification = JSON.parse(cleanJson);

                    if (modification.field && modification.newValue && modification.section) {
                        // Use FieldValidator instead of ResponseValidator
                        // activeProjectId used for session tracking - FieldValidator handles TTL-based reset
                        const validationResult = fieldValidator.validate(
                            modification.field,
                            modification.newValue,
                            activeProjectId,  // FieldValidator uses TTL-based context expiry (30 min)
                            nextFormState     // Pass formState for cross-field validation
                        );

                        if (validationResult.valid) {
                            // Update the field with normalized value
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

                            return buildChatResponse(summaryResponse, nextFormState, {
                                suggestions: await generateSuggestions(nextFormState, summaryResponse)
                            });
                        } else {
                            // Handle validation failure
                            nextFormState.validationErrors = {
                                [modification.field]: validationResult.error?.message || 'Ungültiger Wert'
                            };

                            // Check escalation
                            if (validationResult.shouldEscalate && validationResult.error?.validOptions) {
                                const escalationChips = generateEscalationChips(
                                    modification.field,
                                    validationResult.error.validOptions
                                );

                                const fieldLabel = SalaryStateMachine.getFieldLabel(modification.field);
                                const escalationPrompt = `
Du bist ein freundlicher Gehalts-Chatbot.
Der Nutzer hat Schwierigkeiten mit der Eingabe für "${fieldLabel}".

Bisherige Versuche: ${validationResult.retryCount}
Letzter Wert: "${validationResult.error?.received || modification.newValue}"

Aufgabe: Hilf dem Nutzer freundlich. Erkläre kurz, dass du die Eingabe nicht verstanden hast.
Zeige Verständnis und biete an, aus den Optionen zu wählen.

Beispiel-Antwort:
"Kein Problem, das kann verwirrend sein! Für die ${fieldLabel} kannst du einfach eine der Optionen unten antippen."

Halte dich kurz (1-2 Sätze).
                                `;

                                const escalationResponse = await generateWithRetry(client, {
                                    model: 'gemini-2.5-flash',
                                    contents: escalationPrompt
                                });

                                const escalationText = (escalationResponse.text || '') +
                                    `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;

                                return buildChatResponse(escalationText, nextFormState, {
                                    suggestions: escalationChips
                                });
                            }
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
                const responseResult = await generateWithRetry(client, {
                    model: 'gemini-2.5-flash',
                    contents: clarifyPrompt
                });
                const clarifyText = (responseResult.text || '') + `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;
                return buildChatResponse(clarifyText, nextFormState, {
                    suggestions: await generateSuggestions(nextFormState, clarifyText)
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
                    - Qualifikation/Beruf → group (Entgeltgruppe):
                      * Pflegehelfer/Pflegeassistent ohne Ausbildung → P5
                      * Pflegehelfer mit 1-jähriger Ausbildung → P6
                      * Pflegefachkraft/Pflegefachfrau/Pflegefachmann/exam. Altenpfleger → P7
                      * Pflegefachkraft mit Zusatzaufgaben/Fachweiterbildung → P8
                      * Praxisanleiter/Wohnbereichsleitung → P9
                      * Stationsleitung/PDL → P10-P12
                    - Berufserfahrung → experience (z.B. "5 Jahre" → "5 Jahre", "Stufe 3" → "3", "8" → "8")
                    - Tarifvertrag → tarif (TVöD, TV-L, AVR, öffentlicher Dienst → tvoed)
                    - Arbeitszeit → hours (z.B. "Vollzeit" = 38.5, "30 Stunden" = 30, "Teilzeit 50%" = 19.25)
                    - Ort/Region → state (z.B. "NRW" = "Nordrhein-Westfalen")
                    - Familienstand → taxClass (ledig=1, verheiratet=4)
                    - Kinder → numberOfChildren
                    - Kirchenmitglied → churchTax (ja/nein → true/false)

                    WICHTIG: Wenn der Nutzer seine Qualifikation nennt (z.B. "Pflegefachkraft"),
                    extrahiere daraus die Entgeltgruppe als "group" Feld!

                    Gib NUR ein JSON zurück: { "extracted": { "field": "value" } }
                    Wenn nichts gefunden, gib leeres Objekt: { "extracted": {} }
                `;

                try {
                    const result = await generateWithRetry(client, {
                        model: 'gemini-2.5-flash',
                        contents: extractPrompt,
                        config: { responseMimeType: 'application/json' }
                    });
                    const text = result.text || '';
                    const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const extraction = JSON.parse(cleanJson);

                    if (extraction.extracted && Object.keys(extraction.extracted).length > 0) {
                        // --- US-006: TWO-PHASE VALIDATION (LLM extracts -> Zod validates) ---
                        const section = nextFormState.section as 'job_details' | 'tax_details';
                        if (!nextFormState.data[section]) nextFormState.data[section] = {};

                        // Session ID for retry tracking - use activeProjectId
                        // FieldValidator uses TTL-based context expiry (30 min) to implement:
                        // - Retry counts accumulate within active conversation
                        // - Retry counts reset when user returns after being away (TTL expired)
                        const validationSessionId = activeProjectId;

                        for (const [field, value] of Object.entries(extraction.extracted)) {
                            // TWO-PHASE VALIDATION: LLM extracted -> Zod validates
                            const validationResult: FieldValidationResult = fieldValidator.validate(
                                field,
                                value,
                                validationSessionId,
                                nextFormState  // Pass formState for cross-field validation (e.g., group needs tarif)
                            );

                            if (validationResult.valid) {
                                // Accept normalized value
                                nextFormState.data[section]![field] = validationResult.normalizedValue ?? value;
                                // Clear any previous error for this field
                                if (nextFormState.validationErrors?.[field]) {
                                    delete nextFormState.validationErrors[field];
                                }
                            } else {
                                // Store validation error
                                if (!nextFormState.validationErrors) nextFormState.validationErrors = {};
                                nextFormState.validationErrors[field] = validationResult.error?.message || 'Ungültiger Wert';

                                // Check if escalation needed (3 failures)
                                if (validationResult.shouldEscalate && validationResult.error?.validOptions) {
                                    // Generate escalation chips
                                    const escalationChips = generateEscalationChips(
                                        field,
                                        validationResult.error.validOptions
                                    );

                                    // Get field label - getFieldLabel returns field name as fallback for unmapped fields
                                    const fieldLabel = SalaryStateMachine.getFieldLabel(field);

                                    // Build escalation response
                                    const escalationPrompt = `
Du bist ein freundlicher Gehalts-Chatbot.
Der Nutzer hat Schwierigkeiten mit der Eingabe für "${fieldLabel}".

Bisherige Versuche: ${validationResult.retryCount}
Letzter Wert: "${validationResult.error?.received || value}"

Aufgabe: Hilf dem Nutzer freundlich. Erkläre kurz, dass du die Eingabe nicht verstanden hast.
Zeige Verständnis und biete an, aus den Optionen zu wählen.

Beispiel-Antwort:
"Kein Problem, das kann verwirrend sein! Für die ${fieldLabel} kannst du einfach eine der Optionen unten antippen."

Halte dich kurz (1-2 Sätze).
                                    `;

                                    const escalationResponse = await generateWithRetry(client, {
                                        model: 'gemini-2.5-flash',
                                        contents: escalationPrompt
                                    });

                                    const escalationText = (escalationResponse.text || '') +
                                        `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;

                                    return buildChatResponse(escalationText, nextFormState, {
                                        suggestions: escalationChips
                                    });
                                }
                            }
                        }
                    }
                } catch (e) {
                    console.error("[StateMachine] Extraction failed:", e);
                    // Proceed without update, state machine will re-ask
                }
            }

            // --- US-008: GENERATE RE-PROMPT IF VALIDATION ERRORS ---
            if (nextFormState.validationErrors && Object.keys(nextFormState.validationErrors).length > 0) {
                const errorEntries = Object.entries(nextFormState.validationErrors);
                const firstError = errorEntries[0];
                const [errorField, errorMessage] = firstError;

                // Get field label - getFieldLabel returns field name as fallback for unmapped fields
                const errorFieldLabel = SalaryStateMachine.getFieldLabel(errorField);

                // Build re-prompt with specific correction request
                const rePromptContent = `
Du bist ein freundlicher Gehalts-Chatbot für Pflegekräfte.

Bei der Angabe für "${errorFieldLabel}" gab es ein Problem:
${errorMessage}

Aufgabe: Erkläre dem Nutzer freundlich, was nicht geklappt hat.
- Zeige Verständnis
- Gib 2-3 Beispiele für gültige Eingaben
- Frage direkt nach dem korrekten Wert

Beispiel-Formulierung:
"Hmm, das habe ich nicht ganz verstanden. ${errorMessage} Kannst du mir das nochmal sagen? Zum Beispiel: ..."

WICHTIG:
- Sei freundlich und geduldig
- Sprich den Nutzer direkt an (du)
- Halte dich kurz (2-3 Sätze)
                `;

                const rePromptResult = await generateWithRetry(client, {
                    model: 'gemini-2.5-flash',
                    contents: rePromptContent
                });

                const rePromptText = (rePromptResult.text || '') +
                    `\n\n[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]`;

                return buildChatResponse(rePromptText, nextFormState, {
                    suggestions: await generateSuggestions(nextFormState, rePromptText)
                });
            }

            // --- STATE MACHINE LOGIC (Transition & Guardrails) ---
            const previousSection = nextFormState.section;
            const stepResult = SalaryStateMachine.getNextStep(nextFormState);
            nextFormState = stepResult.nextState;

            // --- DRAFT PERSISTENCE: Save on section transitions ---
            // Save draft when transitioning to tax_details or summary (not on every turn)
            if (sessionId && previousSection !== nextFormState.section) {
                if (nextFormState.section === 'tax_details' || nextFormState.section === 'summary') {
                    await saveDraftInquiry(sessionId, activeProjectId, nextFormState);
                }
            }

            // --- US-011: SUMMARY STATE DISPLAY ---
            if (nextFormState.section === 'summary') {
                const summary = SalaryStateMachine.formatSummary(nextFormState);
                const summaryResponse = `
${summary}

Stimmt das so? Sag "Ja" oder "Berechnen" um das Netto-Gehalt zu berechnen, oder nenne mir was du ändern möchtest.

[PROGRESS: ${SalaryStateMachine.getProgress(nextFormState)}]
                `;

                return buildChatResponse(summaryResponse, nextFormState, {
                    suggestions: await generateSuggestions(nextFormState, summaryResponse)
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

            const responseResult = await generateWithRetry(client, {
                 model: 'gemini-2.5-flash',
                 contents: userFriendlyPrompt
            });
            let responseText = responseResult.text || '';

            // Ensure progress marker is included
            if (!responseText.includes('[PROGRESS:')) {
                responseText += `\n\n[PROGRESS: ${progress}]`;
            }

            return buildChatResponse(responseText, nextFormState, {
                suggestions: await generateSuggestions(nextFormState, responseText)
            });
        }

        // --- AGENT EXECUTION (Legacy / Standard Chat) ---
        const agent = new GeminiAgent();
        
        const responseText = await agent.sendMessage(
            message,
            validatedHistory,
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

/**
 * Consolidate citations by document name
 * Merges page numbers from the same document into a single entry
 */
function consolidateCitationsByDocument(citations: Citation[]): Citation[] {
    if (citations.length === 0) return [];

    const byDocument = new Map<string, { documentId: string; pages: Set<string>; maxSimilarity: number }>();

    for (const citation of citations) {
        const existing = byDocument.get(citation.documentName);
        if (existing) {
            if (citation.pages) existing.pages.add(citation.pages);
            existing.maxSimilarity = Math.max(existing.maxSimilarity, citation.similarity);
        } else {
            byDocument.set(citation.documentName, {
                documentId: citation.documentId,
                pages: new Set(citation.pages ? [citation.pages] : []),
                maxSimilarity: citation.similarity
            });
        }
    }

    // Convert back to array, sorted by highest similarity
    return Array.from(byDocument.entries())
        .map(([documentName, data]) => ({
            documentId: data.documentId,
            documentName,
            pages: data.pages.size > 0 ? Array.from(data.pages).join(', ') : null,
            similarity: data.maxSimilarity
        }))
        .sort((a, b) => b.similarity - a.similarity);
}

/**
 * Save draft inquiry for progressive persistence
 * Called on section transitions to save partial data
 */
async function saveDraftInquiry(
    sessionId: string,
    projectId: string,
    formState: FormState
): Promise<void> {
    const jobData = formState.data.job_details || {};
    const taxData = formState.data.tax_details || {};

    // Parse stufe to integer (column is integer type)
    // Experience can be "5 Jahre", "Stufe 2", or just "2"
    let stufeValue: number | null = null;
    if (jobData.experience) {
        const match = String(jobData.experience).match(/(\d+)/);
        if (match) {
            stufeValue = parseInt(match[1], 10);
        }
    }

    try {
        const { error } = await getSupabaseAdmin()
            .from('salary_inquiries')
            .upsert({
                session_id: sessionId,
                public_key: projectId,
                status: 'draft',
                last_section: formState.section,
                gruppe: jobData.group || null,
                stufe: stufeValue,
                tarif: jobData.tarif || null,
                jahr: String(new Date().getFullYear()),  // Column is text type
                brutto: null,  // Not calculated yet
                netto: null,
                details: {
                    job_details: jobData,
                    tax_details: taxData
                }
            }, { onConflict: 'session_id' });

        if (error) {
            console.error('[DraftPersistence] Failed to save draft:', error);
        } else {
            console.log(`[DraftPersistence] Saved draft for session ${sessionId} at section ${formState.section}`);
        }
    } catch (e) {
        console.error('[DraftPersistence] Error saving draft:', e);
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
