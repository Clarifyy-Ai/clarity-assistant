import { useCallback, useMemo } from "react";
import { useDocumentStore } from "@/store/documentStore";
import type { ParsedResume, ParsedJD } from "@/types/ai.types";

function parseResumeContent(content: unknown): ParsedResume | null {
  if (!content || typeof content !== "string") return null;
  try {
    const parsed = JSON.parse(content) as ParsedResume;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// useResumeContext
// Exposes the active resume + JD parsed data for injection into
// AI prompts and the session coaching context.
// ─────────────────────────────────────────────────────────────────

export function useResumeContext() {
  const docStore = useDocumentStore();

  const activeResume  = docStore.active_context.resume;
  const activeVersion = docStore.active_context.resume_version;

  const parsedResume: ParsedResume | null = useMemo(() => {
    if (activeVersion?.parsed_data) {
      return activeVersion.parsed_data as ParsedResume;
    }
    const content = (activeResume as { content?: string | null } | null)?.content;
    return parseResumeContent(content);
  }, [activeVersion?.parsed_data, activeResume]);
  const activeJD      = docStore.active_context.jd;
  const parsedJD: ParsedJD | null = activeJD?.parsed_data ?? null;

  // ── Build a compact context string for AI prompts ─────────────

  const buildResumeSnippet = useCallback((): string => {
    if (!parsedResume) return "No resume uploaded.";

    const skills   = parsedResume.skills?.slice(0, 15).join(", ")    ?? "N/A";
    const role     = parsedResume.experience?.[0]?.title              ?? "Unknown role";
    const years    = parsedResume.total_years_experience              ?? "?";
    const recent   = parsedResume.experience?.[0]?.company            ?? "Unknown company";

    return `Role: ${role} | ${years} years exp | Current/last: ${recent} | Skills: ${skills}`;
  }, [parsedResume]);

  const buildJDSnippet = useCallback((): string => {
    if (!parsedJD) return "No job description provided.";

    const required = parsedJD.required_skills?.slice(0, 10).join(", ") ?? "N/A";
    const level    = parsedJD.seniority_level                           ?? "unknown";

    return `Target: ${parsedJD.role_title} (${level}) | Requires: ${required}`;
  }, [parsedJD]);

  return {
    activeResume,
    activeVersion,
    parsedResume,
    activeJD,
    parsedJD,
    hasResume: !!parsedResume,
    hasJD:     !!parsedJD,
    buildResumeSnippet,
    buildJDSnippet,
  };
}
