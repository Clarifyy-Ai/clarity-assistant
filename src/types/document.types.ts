// src/types/document.types.ts

import type { ParsedResume, ParsedJD, GapAnalysisResult } from "./ai.types";
import type { ExperienceLevel } from "./user.types";

// ── Resume ────────────────────────────────────────────────────────

// ★ FIX: added "processing" — set by edge function before AI call
export type ResumeStatus = "uploading" | "parsing" | "processing" | "ready" | "error";

export interface ResumeVersion {
  id: string;
  resume_id: string;               // ★ ADD: FK needed for inserts
  version_number: number;
  label: string | null;
  file_name: string;
  file_size_bytes: number;
  file_url: string;
  is_active: boolean;
  parsed_data: ParsedResume | null;
  parse_status: ResumeStatus;
  parse_error: string | null;
  uploaded_at: string;
}

export interface ResumeDocument {
  id: string;
  user_id: string;
  title: string;
  // ★ FIX: was "versions" — Supabase join returns "resume_versions"
  // This was the root cause of all .versions === undefined bugs
  resume_versions: ResumeVersion[];
  active_version_id: string | null;
  // ★ FIX: not returned by DB — computed client-side only, mark optional
  active_version?: ResumeVersion | null;
  created_at: string;
  updated_at: string;
}

// ── Job Description ───────────────────────────────────────────────

export type JDInputMethod = "paste" | "upload" | "url";
export type JDStatus = "parsing" | "ready" | "error";

export interface JDDocument {
  id: string;
  user_id: string;
  company_name: string | null;
  role_title: string;
  raw_text: string;
  file_url: string | null;
  input_method: JDInputMethod;
  is_active: boolean;
  parsed_data: ParsedJD | null;
  parse_status: JDStatus;
  parse_error: string | null;
  created_at: string;
  updated_at: string;
}

// ── Gap Analysis ──────────────────────────────────────────────────

export interface DocumentGapAnalysis {
  id: string;
  user_id: string;
  resume_id: string;
  resume_version_id: string;
  jd_id: string;
  result: GapAnalysisResult;
  generated_at: string;
}

// ── Active Document Context ───────────────────────────────────────

export interface ActiveDocumentContext {
  resume: ResumeDocument | null;
  resume_version: ResumeVersion | null;
  jd: JDDocument | null;
  gap_analysis: DocumentGapAnalysis | null;
  is_loading: boolean;
}

// ── Document Store State ──────────────────────────────────────────

export interface DocumentStoreState {
  resumes: ResumeDocument[];
  jds: JDDocument[];
  active_resume_id: string | null;
  active_jd_id: string | null;
  active_context: ActiveDocumentContext;
  is_loading: boolean;
  upload_progress: number;
}

// ── Answer Bank ───────────────────────────────────────────────────

// ★ FIX: added "general" — used as default fallback in mapAnswerBankRowToSavedAnswer
export type AnswerCategory =
  | "general"
  | "behavioural"
  | "technical"
  | "system_design"
  | "star_answer"
  | "project_story"
  | "leadership"
  | "conflict"
  | "achievement"
  | "failure_learning"
  | "career_goals"
  | "other";

export interface SavedAnswer {
  id: string;
  user_id: string;
  title: string;
  question: string;
  answer_text: string;
  category: AnswerCategory;
  tags: string[];
  company_tags: string[];
  star_components: STARComponents | null;
  is_favourite: boolean;
  times_used: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface STARComponents {
  situation: string;
  task: string;
  action: string;
  result: string;
}

export interface AnswerBankStoreState {
  answers: SavedAnswer[];
  filtered_answers: SavedAnswer[];
  active_filter: AnswerCategory | "all";
  search_query: string;
  is_loading: boolean;
}

// ── Document Vault ────────────────────────────────────────────────

export interface DocumentVaultSummary {
  total_resumes: number;
  total_jds: number;
  total_answers: number;
  active_resume_label: string | null;
  active_jd_label: string | null;
  last_updated_at: string | null;
}
