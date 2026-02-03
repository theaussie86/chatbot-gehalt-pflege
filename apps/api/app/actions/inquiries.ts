"use server";

import { createClient } from "../../utils/supabase/server";

export interface InquiryFilters {
  dateFrom?: string;    // ISO date string
  dateTo?: string;      // ISO date string
  tarif?: string;       // 'tvoed' | 'tv-l' | 'avr' | '' (all)
  sortBy?: string;      // Column name, default 'created_at'
  sortOrder?: 'asc' | 'desc'; // Default 'desc'
}

export interface Citation {
  documentId: string;
  documentName: string;
  pages: string | null;  // "S. 5" or "S. 5, S. 7" or null
  similarity: number;
}

export interface InquiryRow {
  id: string;
  created_at: string;
  tarif: string;
  gruppe: string;
  stufe: string;
  brutto: number;
  netto: number;
  email?: string | null;
  details: {
    taxes?: { lohnsteuer: number; soli: number; kirchensteuer: number };
    socialSecurity?: { kv: number; rv: number; av: number; pv: number };
    job_details?: Record<string, any>;
    tax_details?: Record<string, any>;
    citations?: Citation[];  // Admin-only RAG citations from Phase 11
    [key: string]: any;
  };
}

export async function getInquiries(filters?: InquiryFilters): Promise<{
  data: InquiryRow[] | null;
  error: string | null;
  count: number;
}> {
  const supabase = await createClient();

  // Verify admin authentication
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: "Unauthorized", count: 0 };
  }

  let query = supabase
    .from("salary_inquiries")
    .select("*", { count: "exact" });

  // Apply filters
  if (filters?.dateFrom) {
    query = query.gte("created_at", filters.dateFrom);
  }
  if (filters?.dateTo) {
    // Add 1 day to include the end date fully
    const endDate = new Date(filters.dateTo);
    endDate.setDate(endDate.getDate() + 1);
    query = query.lt("created_at", endDate.toISOString());
  }
  if (filters?.tarif) {
    query = query.eq("tarif", filters.tarif);
  }

  // Sort
  const sortColumn = filters?.sortBy || "created_at";
  const sortOrder = filters?.sortOrder || "desc";
  query = query.order(sortColumn, { ascending: sortOrder === "asc" });

  // Limit to 100 most recent (pagination can be added later)
  query = query.limit(100);

  const { data, error, count } = await query;

  if (error) {
    console.error("[Inquiries] Failed to fetch:", error);
    return { data: null, error: error.message, count: 0 };
  }

  return { data: data as InquiryRow[], error: null, count: count || 0 };
}
