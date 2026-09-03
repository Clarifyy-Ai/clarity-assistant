/**
 * FastAPI scraper client (admin JWT → Render).
 *
 * Targets the self-hosted scraper service whose URL is configured via
 * `VITE_SCRAPER_URL`. All requests carry the current Supabase user JWT;
 * the scraper verifies the JWT against the project JWKS and enforces the
 * `admin` role server-side (`scraper/app/core/security.py`).
 *
 * Auth separation (do not mix):
 * - **This client** — Bearer JWT (browser admin → FastAPI `/scrape/*`, `/paper-factory/*`).
 * - **Edge → Python hybrid** — HMAC via `DOCUMENT_INTELLIGENCE_AUTH_SECRET`
 *   (`supabase/functions/_shared/pythonClient.ts`); never sent to the browser.
 * - **bulk-import-questions** — `x-ingest-key` / `INGEST_API_KEY` (server worker only).
 */
import { supabase } from "@/lib/supabase/client";
import { resolveProductionSafeUrl } from "@/lib/serviceUrl";

export type ScrapeJobStatus =
  | "queued"
  | "running"
  | "paused"
  | "completed"
  | "failed"
  | "cancelled";

export interface ScrapeJobProgress {
  total_papers: number;
  processed_papers: number;
  extracted_questions: number;
  saved_images: number;
  failed_papers: number;
}

export interface ScrapeJobState {
  job_id: string;
  exam_type: string;
  status: ScrapeJobStatus;
  progress: ScrapeJobProgress;
  logs: string[];
  error: string | null;
  created_at: string;
  updated_at: string;
}

export interface StartScrapeBody {
  exam_type: string;
  year_from?: number | null;
  year_to?: number | null;
}

export interface PaperFactoryExamRow {
  id?: string;
  code?: string;
  name?: string;
  prompt_label?: string;
  [key: string]: unknown;
}

export interface PaperFactoryExamsResponse {
  success: boolean;
  count: number;
  exams: PaperFactoryExamRow[];
}

export const PAPER_FACTORY_MODES = [
  "official_previous",
  "generated_mock",
  "custom_mock",
  "adaptive",
] as const;

export type PaperFactoryMode = (typeof PAPER_FACTORY_MODES)[number];

export interface PaperFactoryPlanBody {
  exam: string;
  stage?: string | null;
  language?: string;
  mode?: PaperFactoryMode;
  question_count?: number;
  duration_minutes?: number;
  seed?: string | null;
}

export interface PaperFactoryGenerateBody extends PaperFactoryPlanBody {
  user_id?: string | null;
  publish?: boolean;
  use_bank?: boolean;
  include_questions?: boolean;
  title?: string | null;
}

export interface PaperFactoryPlanResponse {
  success: boolean;
  plan: Record<string, unknown>;
}

export interface PaperFactoryGenerateResponse {
  success: boolean;
  exam?: string;
  question_count?: number;
  planned_count?: number;
  complete?: boolean;
  bank_questions?: number;
  ai_questions?: number;
  paper_id?: string | null;
  mock_test_id?: string | null;
  quality_score?: number;
  disclaimer?: string;
}

export interface PaperFactoryProcessJobResponse {
  success: boolean;
  already_completed?: boolean;
  job_id?: string;
  paper_id?: string | null;
  mock_test_id?: string | null;
  question_count?: number;
  quality_score?: number;
}

const BASE = resolveProductionSafeUrl(import.meta.env.VITE_SCRAPER_URL, {
  prod:
    import.meta.env.VITE_APP_ENV === "production" || Boolean(import.meta.env.PROD),
});

export class ScraperNotConfiguredError extends Error {
  constructor() {
    super("VITE_SCRAPER_URL is not set. Configure the FastAPI scraper URL to use this feature.");
  }
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Not authenticated");
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function formatScraperDetail(text: string): string {
  try {
    const parsed = JSON.parse(text) as { detail?: unknown };
    const detail = parsed.detail ?? parsed;
    if (typeof detail === "string") return detail;
    if (detail && typeof detail === "object") {
      const row = detail as { message?: string; code?: string };
      if (row.message) return row.code ? `${row.code}: ${row.message}` : row.message;
      return JSON.stringify(detail).slice(0, 400);
    }
  } catch {
    /* not json */
  }
  return text;
}

async function request<T>(
  path: string,
  init?: RequestInit & { timeoutMs?: number },
): Promise<T> {
  if (!BASE) throw new ScraperNotConfiguredError();
  const { timeoutMs, ...fetchInit } = init ?? {};
  const controller = timeoutMs ? new AbortController() : undefined;
  const timer =
    timeoutMs && controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined;
  try {
    const res = await fetch(`${BASE}${path}`, {
      ...fetchInit,
      signal: fetchInit.signal ?? controller?.signal,
      headers: { ...(await authHeaders()), ...(fetchInit.headers ?? {}) },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const detail = formatScraperDetail(text);
      throw new Error(`Scraper ${res.status}: ${detail || res.statusText}`);
    }
    return res.json() as Promise<T>;
  } catch (err) {
    if (controller?.signal.aborted) {
      throw new Error(`Scraper request timed out after ${timeoutMs}ms`);
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export const scraperApi = {
  isConfigured: (): boolean => Boolean(BASE),
  start: (body: StartScrapeBody) =>
    request<{ job_id: string; status: "queued" }>("/scrape/start", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (jobId: string) => request<ScrapeJobState>(`/scrape/${jobId}`),
  pause: (jobId: string) =>
    request<{ status: string }>(`/scrape/${jobId}/pause`, { method: "POST" }),
  resume: (jobId: string) =>
    request<{ status: string }>(`/scrape/${jobId}/resume`, { method: "POST" }),
  cancel: (jobId: string) =>
    request<{ status: string }>(`/scrape/${jobId}/cancel`, { method: "POST" }),
  sources: () => request<{ supported: string[] }>("/scrape/sources"),
  paperFactoryExams: () =>
    request<PaperFactoryExamsResponse>("/paper-factory/exams"),
  paperFactoryPlan: (body: PaperFactoryPlanBody) =>
    request<PaperFactoryPlanResponse>("/paper-factory/plan", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 20_000,
    }),
  paperFactoryGenerate: (body: PaperFactoryGenerateBody) =>
    request<PaperFactoryGenerateResponse>("/paper-factory/generate", {
      method: "POST",
      body: JSON.stringify(body),
      timeoutMs: 90_000,
    }),
  paperFactoryProcessJob: (jobId: string) =>
    request<PaperFactoryProcessJobResponse>(
      `/paper-factory/jobs/${encodeURIComponent(jobId)}/process`,
      { method: "POST", timeoutMs: 90_000 },
    ),
};
