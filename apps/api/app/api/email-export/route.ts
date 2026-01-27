import { NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { buildSalaryEmail } from "../../../lib/emailTemplate";

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
        const { email, consent, inquiryData, projectId, inquiryId } = body;
        const origin = request.headers.get('origin');
        const ip = request.headers.get('x-forwarded-for') || 'unknown';

        // --- VALIDATION ---

        // 1. Validate consent (server-side DOI check)
        if (consent !== true) {
            return NextResponse.json(
                { error: "Consent required" },
                { status: 400 }
            );
        }

        // 2. Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
            return NextResponse.json(
                { error: "Invalid email" },
                { status: 400 }
            );
        }

        // --- RATE LIMITING ---
        const { count: requestCount } = await getSupabaseAdmin()
            .from('request_logs')
            .select('*', { count: 'exact', head: true })
            .eq('ip_address', ip)
            .gt('created_at', new Date(Date.now() - 60000).toISOString()); // Last 60 seconds

        if (requestCount !== null && requestCount > 5) {
            return NextResponse.json(
                { error: "Too many email requests. Please try again later." },
                { status: 429 }
            );
        }

        // Log this request
        getSupabaseAdmin().from('request_logs').insert({
            ip_address: ip,
            public_key: projectId || 'email_export'
        }).then();

        // --- CHECK RESEND API KEY ---
        if (!process.env.RESEND_API_KEY) {
            console.error('[EmailExport] RESEND_API_KEY not configured');
            return NextResponse.json(
                { error: "Email service not configured" },
                { status: 503 }
            );
        }

        // --- BUILD EMAIL DATA ---
        const jobDetails = inquiryData.jobDetails || {};
        const taxDetails = inquiryData.taxDetails || {};
        const calculationResult = inquiryData.calculationResult || {};

        // Extract data for email template
        const emailData = {
            // User inputs
            tarif: jobDetails.tarif,
            gruppe: jobDetails.group,
            stufe: jobDetails.experience,
            hours: jobDetails.hours,
            state: jobDetails.state,
            taxClass: taxDetails.taxClass,
            churchTax: taxDetails.churchTax,
            numberOfChildren: taxDetails.numberOfChildren,
            // Calculation results
            brutto: calculationResult.brutto || 0,
            netto: calculationResult.netto || 0,
            taxes: {
                lohnsteuer: 0,
                soli: 0,
                kirchensteuer: 0
            },
            socialSecurity: {
                kv: 0,
                rv: 0,
                av: 0,
                pv: 0
            },
            year: calculationResult.year || new Date().getFullYear()
        };

        // Try to extract detailed tax/social security breakdown if available
        // (The inquiry details field contains the full calculation result from TaxWrapper)
        if (inquiryData.calculationResult) {
            // Check if we have the detailed breakdown in a nested structure
            const details = inquiryData.calculationResult;
            if (details.taxes) {
                emailData.taxes = details.taxes;
            }
            if (details.socialSecurity) {
                emailData.socialSecurity = details.socialSecurity;
            }
        }

        // --- SEND EMAIL VIA RESEND ---
        const resend = new Resend(process.env.RESEND_API_KEY);
        const htmlBody = buildSalaryEmail(emailData);

        try {
            const sendResult = await resend.emails.send({
                from: 'Pflege Gehalt Chatbot <onboarding@resend.dev>',
                to: email,
                subject: `Deine Gehaltsberechnung ${emailData.year}`,
                html: htmlBody,
            });

            console.log('[EmailExport] Email sent successfully:', sendResult);
        } catch (emailError) {
            console.error('[EmailExport] Failed to send email:', emailError);
            return NextResponse.json(
                { error: "Failed to send email" },
                { status: 500 }
            );
        }

        // --- SAVE EMAIL TO INQUIRY RECORD ---
        if (inquiryId) {
            const { error: updateError } = await getSupabaseAdmin()
                .from('salary_inquiries')
                .update({ email })
                .eq('id', inquiryId);

            if (updateError) {
                console.error('[EmailExport] Failed to save email to inquiry:', updateError);
                // Don't fail the request - email was already sent successfully
            } else {
                console.log(`[EmailExport] Email saved to inquiry ${inquiryId}`);
            }
        } else {
            console.warn('[EmailExport] No inquiryId provided - email not saved to database');
        }

        const response = NextResponse.json({ success: true });
        if (origin) {
            response.headers.set('Access-Control-Allow-Origin', origin);
        }
        return response;

    } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : "Internal Server Error";
        console.error("Email Export Error:", error);
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
            "Access-Control-Allow-Headers": "Content-Type",
        },
    });
}
