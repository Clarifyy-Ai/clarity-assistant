/**
 * Shared application context for Prep Lab Edge calls (profile + documents + history).
 */
import { useAuthStore } from "@/store/userStore";
import { useDocumentStore } from "@/store/documentStore";
import { buildPrepProfileContext } from "@/lib/ai/buildFeatureContext";
import {
  loadUserApplicationContext,
  userApplicationContextForPrep,
} from "@/lib/ai/userApplicationContext";

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

/** Merge full application context into prep-tool request body. */
export async function withPrepToolContext<T extends Record<string, unknown>>(
  body: T,
): Promise<T & { context: Record<string, unknown> }> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) {
    return {
      ...body,
      context: getPrepToolProfileContext(),
    };
  }

  try {
    const app = await loadUserApplicationContext(userId, { includeHistory: true });
    return {
      ...body,
      context: userApplicationContextForPrep(app),
    };
  } catch {
    return {
      ...body,
      context: getPrepToolProfileContext(),
    };
  }
}
