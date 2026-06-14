/**
 * FastAPI scraper client.
 *
 * Targets the self-hosted scraper service whose URL is configured via
 * VITE_SCRAPER_URL. All requests carry the current Supabase user JWT;
 * the scraper verifies the JWT against the project JWKS and enforces the
 * `admin` role server-side.
 */
import { supabase } from "@/lib/supabase/client";

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

const BASE = (import.meta.env.VITE_SCRAPER_URL as string | undefined)?.replace(/\/$/, "") ?? "";

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  if (!BASE) throw new ScraperNotConfiguredError();
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      detail = (JSON.parse(text) as { detail?: string }).detail ?? text;
    } catch {
      /* not json */
    }
    throw new Error(`Scraper ${res.status}: ${detail || res.statusText}`);
  }
  return res.json() as Promise<T>;
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
};
