/**
 * Shared profile/resume/JD context for Prep Lab Edge calls.
 */
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { buildPrepProfileContext } from "@/lib/ai/buildFeatureContext";

export function getPrepToolProfileContext(): Record<string, unknown> {
  const profile = useAuthStore.getState().profile;
  const docStore = useDocumentStore.getState();
  const resume = docStore.active_context?.resume as
    | { content?: string | null }
    | null
    | undefined;
  const jd = (docStore.active_context as unknown as Record<string, unknown> | undefined)?.job_description as
    | { content?: string | null; description?: string | null }
    | null
    | undefined;

  return buildPrepProfileContext({
    role: profile?.target_role,
    experienceLevel: profile?.experience_level,
    company: (profile as { target_company?: string | null } | null)?.target_company,
    industry: profile?.industry,
    resumeSummary: resume?.content?.slice(0, 2_000) ?? null,
    jdText: (jd?.content ?? jd?.description ?? "").slice(0, 2_000) || null,
  });
}

/** Merge structured context into prep-tool request body. */
export function withPrepToolContext<T extends Record<string, unknown>>(
  body: T,
): T & { context: Record<string, unknown> } {
  return {
    ...body,
    context: getPrepToolProfileContext(),
  };
}
