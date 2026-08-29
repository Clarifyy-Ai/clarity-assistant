/**
 * Government Exam Source Registry + Admin-managed Domain Allowlist.
 *
 * Provides provenance tracking from discovery through publication,
 * source classification, domain allowlist management, and collection audit.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  OFFICIAL_DOCUMENT_HOST_ALLOWLIST,
  SOURCE_CLASSIFICATIONS,
  classifySource,
  isRestrictedCoachingDomain,
  type SourceClassification,
} from "./officialDomainAllowlist";

export { SOURCE_CLASSIFICATIONS };
export type { SourceClassification };

export function normalizeGovSourceUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl.trim());
    u.hash = "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^utm_|^fbclid$|^gclid$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    return u.toString();
  } catch {
    return rawUrl.trim();
  }
}

export const GOV_SOURCE_STATES = [
  "discovered",
  "verified",
  "ingested",
  "staged",
  "archived",
  "rejected",
  "active",
] as const;

export type GovSourceState = (typeof GOV_SOURCE_STATES)[number];

export const GOV_SOURCE_DOCUMENT_TYPES = [
  "notification",
  "syllabus",
  "pattern",
  "previous_paper",
  "answer_key",
  "corrigendum",
] as const;

export type GovSourceDocumentType = (typeof GOV_SOURCE_DOCUMENT_TYPES)[number];

export const GOV_SOURCE_REVIEW_STATES = [
  "draft",
  "in_review",
  "approved",
  "retired",
  "rejected",
] as const;

export type GovSourceReviewState = (typeof GOV_SOURCE_REVIEW_STATES)[number];

export interface DomainAllowlistEntry {
  id: string;
  domain: string;
  display_name: string;
  recruiting_body_id?: string | null;
  is_active: boolean;
  is_official: boolean;
  allow_subdomains: boolean;
  allowed_schemes: string[];
  document_types: string[];
  notes?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface GovSourceRecord {
  id: string;
  recruiting_body_id?: string | null;
  exam_id?: string | null;
  cycle_id?: string | null;
  stage_id?: string | null;
  paper_id?: string | null;
  paper_name?: string | null;
  shift?: string | null;
  document_type: GovSourceDocumentType;
  title: string;
  source_url?: string | null;
  approved_domain?: string | null;
  publication_date?: string | null;
  effective_date?: string | null;
  retrieved_at: string;
  language: string;
  mime_type?: string | null;
  file_hash?: string | null;
  license_class: string;
  classification: SourceClassification;
  source_state: GovSourceState;
  parser_version?: string | null;
  review_state: GovSourceReviewState;
  superseded_by?: string | null;
  last_collection_attempt_at?: string | null;
  last_successful_collection_at?: string | null;
  failure_count: number;
  last_error_code?: string | null;
  storage_path?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface RegisterSourceInput {
  recruitingBodyId?: string | null;
  examId?: string | null;
  cycleId?: string | null;
  stageId?: string | null;
  paperId?: string | null;
  paperName?: string | null;
  shift?: string | null;
  documentType: GovSourceDocumentType;
  title: string;
  sourceUrl?: string | null;
  publicationDate?: string | null;
  effectiveDate?: string | null;
  language?: string;
  mimeType?: string | null;
  fileHash?: string | null;
  storagePath?: string | null;
  parserVersion?: string | null;
  uploadType?: "admin" | "user" | "licensed" | null;
  metadata?: Record<string, unknown>;
}

/**
 * Fetches active domain allowlist strings from database with static fallback.
 */
export async function fetchActiveAllowedDomains(
  supabase: SupabaseClient,
): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from("gov_domain_allowlist")
      .select("domain")
      .eq("is_active", true);

    if (error || !data || data.length === 0) {
      return [...OFFICIAL_DOCUMENT_HOST_ALLOWLIST];
    }
    return data.map((row: { domain: string }) => row.domain.toLowerCase().trim());
  } catch {
    return [...OFFICIAL_DOCUMENT_HOST_ALLOWLIST];
  }
}

/**
 * Lists all admin domain allowlist records.
 */
export async function listDomainAllowlist(
  supabase: SupabaseClient,
): Promise<{ data: DomainAllowlistEntry[] | null; error: Error | null }> {
  try {
    const { data, error } = await supabase
      .from("gov_domain_allowlist")
      .select("*")
      .order("created_at", { ascending: true });

    if (error) return { data: null, error: new Error(error.message) };
    return { data: (data as DomainAllowlistEntry[]) ?? [], error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Adds an approved domain to the domain allowlist (Admin only).
 */
export async function addDomainAllowlistEntry(
  supabase: SupabaseClient,
  input: {
    domain: string;
    displayName: string;
    recruitingBodyId?: string | null;
    isOfficial?: boolean;
    allowSubdomains?: boolean;
    notes?: string | null;
  },
): Promise<{ data: DomainAllowlistEntry | null; error: Error | null }> {
  const normalizedDomain = input.domain.toLowerCase().trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");

  if (isRestrictedCoachingDomain(normalizedDomain)) {
    return {
      data: null,
      error: new Error(`Cannot add unauthorized coaching domain '${normalizedDomain}' to allowlist.`),
    };
  }

  try {
    const { data, error } = await supabase
      .from("gov_domain_allowlist")
      .insert({
        domain: normalizedDomain,
        display_name: input.displayName.trim(),
        recruiting_body_id: input.recruitingBodyId || null,
        is_active: true,
        is_official: input.isOfficial ?? true,
        allow_subdomains: input.allowSubdomains ?? true,
        notes: input.notes?.trim() || null,
      })
      .select("*")
      .single();

    if (error) return { data: null, error: new Error(error.message) };
    return { data: data as DomainAllowlistEntry, error: null };
  } catch (err) {
    return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Updates a domain allowlist entry (Admin only).
 */
export async function updateDomainAllowlistEntry(
  supabase: SupabaseClient,
  id: string,
  patch: Partial<Pick<DomainAllowlistEntry, "display_name" | "is_active" | "is_official" | "allow_subdomains" | "notes">>,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase
      .from("gov_domain_allowlist")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (error) return { success: false, error: new Error(error.message) };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Registers or updates a government exam source with classification and provenance.
 */
export async function registerGovSource(
  supabase: SupabaseClient,
  input: RegisterSourceInput,
): Promise<{ source: GovSourceRecord | null; error: Error | null }> {
  try {
    const dynamicAllowlist = await fetchActiveAllowedDomains(supabase);
    const classificationResult = classifySource({
      url: input.sourceUrl,
      uploadType: input.uploadType,
      dynamicAllowlist,
    });

    if (!classificationResult.allowedForAutomatedIngest && !input.storagePath) {
      return {
        source: null,
        error: new Error(
          classificationResult.reason ?? "Source domain is not approved for automated collection.",
        ),
      };
    }

    const { data, error } = await supabase
      .from("gov_official_sources")
      .insert({
        recruiting_body_id: input.recruitingBodyId || null,
        exam_id: input.examId || null,
        cycle_id: input.cycleId || null,
        stage_id: input.stageId || null,
        paper_id: input.paperId || null,
        paper_name: input.paperName || null,
        shift: input.shift || null,
        document_type: input.documentType,
        title: input.title.trim(),
        source_url: input.sourceUrl?.trim() || null,
        approved_domain: classificationResult.approvedDomain,
        publication_date: input.publicationDate || null,
        effective_date: input.effectiveDate || null,
        language: input.language || "en",
        mime_type: input.mimeType || null,
        file_hash: input.fileHash || null,
        license_class: input.uploadType === "admin"
          ? "user_upload"
          : classificationResult.classification === "official"
          ? "official_public"
          : classificationResult.classification,
        classification: classificationResult.classification,
        source_state: "discovered",
        parser_version: input.parserVersion || "1.0.0",
        review_state: "draft",
        storage_path: input.storagePath || null,
        metadata: {
          ...input.metadata,
          registered_at: new Date().toISOString(),
          classification: classificationResult.classification,
        },
      })
      .select("*")
      .single();

    if (error) return { source: null, error: new Error(error.message) };
    return { source: data as GovSourceRecord, error: null };
  } catch (err) {
    return { source: null, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Records a collection attempt (success or failure) on a source.
 */
export async function recordCollectionAttempt(
  supabase: SupabaseClient,
  sourceId: string,
  success: boolean,
  errorCode?: string | null,
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      last_collection_attempt_at: now,
      updated_at: now,
    };

    if (success) {
      patch.last_successful_collection_at = now;
      patch.source_state = "ingested";
      patch.last_error_code = null;
    } else {
      patch.last_error_code = errorCode || "COLLECTION_FAILED";
      // Fetch existing failure count
      const { data: existing } = await supabase
        .from("gov_official_sources")
        .select("failure_count")
        .eq("id", sourceId)
        .maybeSingle();

      patch.failure_count = ((existing?.failure_count as number) || 0) + 1;
    }

    const { error } = await supabase
      .from("gov_official_sources")
      .update(patch)
      .eq("id", sourceId);

    if (error) return { success: false, error: new Error(error.message) };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}

/**
 * Links question provenance preserving full discovery-to-publication lineage.
 */
export async function linkQuestionProvenance(
  supabase: SupabaseClient,
  params: {
    questionId: string;
    sourceId: string;
    sourceClass?: "bank" | "generated" | "previous_year";
    licenseClass?: string;
    pageRef?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<{ success: boolean; error: Error | null }> {
  try {
    const { error } = await supabase.from("question_provenance").insert({
      question_id: params.questionId,
      source_id: params.sourceId,
      source_class: params.sourceClass || "previous_year",
      license_class: params.licenseClass || "official_public",
      page_ref: params.pageRef || null,
      metadata: params.metadata || {},
    });

    if (error) return { success: false, error: new Error(error.message) };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err : new Error(String(err)) };
  }
}
