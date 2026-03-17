import type { CoachingContext, AnswerSummary, ResumeProject } from "@/types/ai.types";
import type { UserProfile } from "@/types/user.types";
import type { SessionConfig, LiveSessionConfig } from "@/types/session.types";
import type { ActiveDocumentContext } from "@/types/document.types";
import { useCoachStore } from "@/store/coachStore";
import { useSessionStore } from "@/store/sessionStore";
import { useDocumentStore } from "@/store/documentStore";
import { useAuthStore } from "@/store/userStore";

// ─────────────────────────────────────────────────────────────────
// Context Envelope Builder
// Assembles the full CoachingContext object sent with every AI call.
// This is the most important personalisation layer in the entire app.
// ─────────────────────────────────────────────────────────────────

export function buildCoachingContext(
  profile: UserProfile,
  config: SessionConfig | LiveSessionConfig,
  documentContext: ActiveDocumentContext,
  sessionOverrides?: Partial<CoachingContext>
): CoachingContext {
  const parsed = documentContext.resume_version?.parsed_data;
  const parsedJD = documentContext.jd?.parsed_data;
  const gapAnalysis = documentContext.gap_analysis?.result;

  // ── Resume intelligence ──────────────────────────────────
  const resumeSkills: string[] = parsed?.skills ?? [];
  const resumeTechStack: string[] = parsed?.tech_stack ?? [];
  const allResumeSkills = [...new Set([...resumeSkills, ...resumeTechStack])];

  const resumeProjects: ResumeProject[] = (parsed?.projects ?? []).map((p) => ({
    name: p.name,
    role: p.role,
    tech_stack: p.tech_stack,
    impact_metric: p.impact_metric,
  }));

  const resumeExperienceSummary = parsed?.summary
    ?? buildExperienceSummaryFromParsed(parsed);

  // ── JD intelligence ──────────────────────────────────────
  const jdRequiredSkills = parsedJD?.required_skills ?? [];
  const jdSenioritySignals = parsedJD?.key_phrases ?? [];
  const gapSkills = gapAnalysis?.missing_required_skills ?? [];

  // ── Historical weakness / strength ───────────────────────
  // These come from persisted profile data enriched by past sessions
  const weakAreas = extractWeakAreas(profile);
  const strongAreas = extractStrongAreas(profile);

  // ── Session config fields ─────────────────────────────────
  const sessionConfig = config as SessionConfig;
  const liveConfig = config as LiveSessionConfig;
  const targetCompany = sessionConfig.company ?? liveConfig.company ?? null;

  const context: CoachingContext = {
    // Identity
    user_id:            profile.id,
    full_name:          profile.full_name,
    role:               sessionConfig.role ?? profile.role ?? null,
    domain:             profile.domain,
    experience_level:   (sessionConfig.experience_level as CoachingContext["experience_level"])
                        ?? profile.experience_level,
    years_of_experience: profile.years_of_experience,
    target_company:     targetCompany,
    coach_tone:         profile.coach_tone,
    hint_style:         sessionConfig.hint_style ?? liveConfig.hint_style ?? profile.hint_style,

    // Resume
    resume_skills:              allResumeSkills,
    resume_projects:            resumeProjects,
    resume_experience_summary:  resumeExperienceSummary,

    // JD
    jd_required_skills:    jdRequiredSkills,
    jd_seniority_signals:  jdSenioritySignals,
    gap_skills:            gapSkills,

    // Session state (starts empty, updated during session)
    session_goals:         [],
    filler_words_to_watch: [],
    current_filler_count:  0,
    current_wpm:           0,

    // Historical
    weak_areas:               weakAreas,
    strong_areas:             strongAreas,
    last_3_answer_summaries:  [],
    avg_confidence_score:     0,

    // Session config
    session_type:    (sessionConfig.interview_type) ?? "mixed",
    question_number: 1,
    total_questions: sessionConfig.question_count ?? 5,

    // Apply any overrides
    ...sessionOverrides,
  };

  return context;
}

// ─────────────────────────────────────────────────────────────────
// Convenience — build context from Zustand stores directly
// ─────────────────────────────────────────────────────────────────

export function buildContextFromStores(): CoachingContext | null {
  const { profile } = useAuthStore.getState();
  const { config } = useSessionStore.getState();
  const { active_context } = useDocumentStore.getState();
  const { context } = useCoachStore.getState();

  if (!profile || !config) return context; // return cached if available

  return buildCoachingContext(profile, config, active_context);
}

// ─────────────────────────────────────────────────────────────────
// Serialise context for AI prompt injection
// ─────────────────────────────────────────────────────────────────

export function serialiseContextForPrompt(ctx: CoachingContext): string {
  const lines: string[] = [
    `Candidate: ${ctx.full_name ?? "Unknown"}, ${ctx.role ?? "Engineer"}, ${ctx.experience_level ?? "mid"}-level`,
    `Domain: ${ctx.domain ?? "Technology"}`,
    `Years of experience: ${ctx.years_of_experience ?? "unknown"}`,
    ctx.target_company
      ? `Target company: ${ctx.target_company}`
      : "",
    ctx.resume_skills.length > 0
      ? `Skills: ${ctx.resume_skills.slice(0, 20).join(", ")}`
      : "",
    ctx.resume_experience_summary
      ? `Background: ${ctx.resume_experience_summary}`
      : "",
    ctx.gap_skills.length > 0
      ? `Skills gaps (from JD): ${ctx.gap_skills.join(", ")}`
      : "",
    ctx.weak_areas.length > 0
      ? `Known weak areas: ${ctx.weak_areas.join(", ")}`
      : "",
    ctx.strong_areas.length > 0
      ? `Strong areas: ${ctx.strong_areas.join(", ")}`
      : "",
    ctx.filler_words_to_watch.length > 0
      ? `Filler words to watch: ${ctx.filler_words_to_watch.join(", ")}`
      : "",
    ctx.session_goals.length > 0
      ? `Session goals: ${ctx.session_goals.join(", ")}`
      : "",
    `Coach tone: ${ctx.coach_tone}`,
    `Hint style: ${ctx.hint_style}`,
    `Interview type: ${ctx.session_type}`,
    `Question ${ctx.question_number} of ${ctx.total_questions}`,
    ctx.last_3_answer_summaries.length > 0
      ? `Recent answers:\n${ctx.last_3_answer_summaries
          .map((a) => `  Q: "${a.question}" → Score: ${a.score}${a.key_weakness ? `, Weakness: ${a.key_weakness}` : ""}`)
          .join("\n")}`
      : "",
  ].filter(Boolean);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────
// System prompts per hint style
// ─────────────────────────────────────────────────────────────────

export function buildSystemPrompt(
  ctx: CoachingContext,
  isLive: boolean
): string {
  const ctxStr = serialiseContextForPrompt(ctx);
  const hintStyle = ctx.hint_style;

  const styleInstruction =
    hintStyle === "full_answer"
      ? "Provide a complete, well-structured 2-3 paragraph answer the candidate can use as a guide. Use STAR format for behavioural questions. Be specific and impressive."
      : hintStyle === "short_hints"
      ? "Provide 3-4 concise bullet point talking points only. No full sentences. Bullets should be concrete and memorable."
      : "Provide 5-8 keywords and key phrases only. One per line. No sentences.";

  const urgencyInstruction = isLive
    ? "This is a LIVE interview. Speed is critical. Start with the most important point immediately. No preamble."
    : "This is a practice session. Be thorough and educational in your response.";

  return `You are ConfideQ, an expert interview coach AI. You generate personalised interview hints.

${urgencyInstruction}

${styleInstruction}

Candidate context:
${ctxStr}

Rules:
- Never say "Great question" or similar filler phrases
- Never mention that you are an AI
- Calibrate vocabulary and depth to the candidate's experience level
- If targeting a specific company, align answer with their values and interview style
- For coding questions: give thinking framework only, never give code
- Keep response under 250 words maximum
- Respond only with the hint content, nothing else`;
}

// ─────────────────────────────────────────────────────────────────
// Private helpers
// ─────────────────────────────────────────────────────────────────

function buildExperienceSummaryFromParsed(
  parsed: ReturnType<typeof useDocumentStore.getState>["active_context"]["resume_version"]["parsed_data"]
): string | null {
  if (!parsed) return null;
  const parts: string[] = [];
  if (parsed.total_years_experience) {
    parts.push(`${parsed.total_years_experience} years of experience`);
  }
  if (parsed.experience.length > 0) {
    const companies = parsed.experience
      .slice(0, 3)
      .map((e) => e.company)
      .join(", ");
    parts.push(`previously at ${companies}`);
  }
  if (parsed.education.length > 0) {
    const edu = parsed.education[0];
    if (edu.degree && edu.institution) {
      parts.push(`${edu.degree} from ${edu.institution}`);
    }
  }
  return parts.length > 0 ? parts.join("; ") : null;
}

function extractWeakAreas(profile: UserProfile): string[] {
  // In a real implementation this would query analytics
  // For now return empty — populated during session via coachStore
  return [];
}

function extractStrongAreas(profile: UserProfile): string[] {
  return [];
}
