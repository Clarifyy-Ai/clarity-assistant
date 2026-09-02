/**
 * Resume in-flight company research after refresh (mirrors gov paper job storage).
 */
const STORAGE_KEY = "clarify_active_company_research_job";

export type ActiveCompanyResearchJob = {
  jobId: string;
  company: string;
  role: string;
  userId: string;
  companyNormalized?: string;
  savedAt: number;
};

export function saveActiveCompanyJob(payload: {
  jobId: string;
  company: string;
  role: string;
  userId: string;
  companyNormalized?: string;
}): void {
  try {
    sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ ...payload, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

export function loadActiveCompanyJob(userId: string): ActiveCompanyResearchJob | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveCompanyResearchJob;
    if (!parsed.jobId || parsed.userId !== userId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearActiveCompanyJob(jobId?: string): void {
  try {
    if (jobId) {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { jobId?: string };
        if (parsed.jobId && parsed.jobId !== jobId) return;
      }
    }
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export async function findInFlightCompanyJob(
  userId: string,
  companyNormalized: string,
): Promise<{ id: string; status: string; progress_stage: string | null } | null> {
  const { supabase } = await import("@/lib/supabase/client");
  const { data, error } = await supabase
    .from("company_research_jobs")
    .select("id, status, progress_stage")
    .eq("user_id", userId)
    .eq("company_name_normalized", companyNormalized)
    .in("status", ["queued", "processing"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  return data as { id: string; status: string; progress_stage: string | null };
}
