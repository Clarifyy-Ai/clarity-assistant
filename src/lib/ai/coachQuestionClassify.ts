/**
 * Question-level classification for Practice Coach offline fallbacks.
 * Separate from session interview_type — a SQL question in a behavioral
 * session must not receive a STAR framework by default.
 */

import type { InterviewType } from "@/types/session.types";
import type { HintStyle } from "@/types/user.types";
import {
  structureForMode,
  type ResponseStructureMode,
} from "@/lib/overlay/responseFormatters";
import { getOfflineTemplate } from "@/lib/ai/offlineTemplates";
import {
  formatTalkingPointsAsHint,
  type ResumeTalkingPoints,
} from "@/lib/ai/resumeFallback";

export type CoachQuestionClass =
  | "behavioural"
  | "technical"
  | "coding"
  | "system_design"
  | "product"
  | "leadership"
  | "hr"
  | "mixed";

export function normalizeInterviewType(
  input: InterviewType | string | undefined | null,
): InterviewType {
  const raw = String(input ?? "").toLowerCase().trim();
  if (raw === "behavioral" || raw === "behavioural") return "behavioural";
  if (raw === "coding") return "coding";
  if (raw === "technical") return "technical";
  if (raw === "system_design" || raw === "system-design" || raw === "system design") {
    return "system_design";
  }
  if (raw === "hr") return "hr";
  if (raw === "product") return "product";
  if (raw === "leadership") return "leadership";
  if (raw === "mixed") return "mixed";
  if (raw === "government_exam") return "government_exam";
  if (raw === "case_study") return "case_study";
  if (raw) return raw as InterviewType;
  return "mixed";
}

function sessionClassAsPrior(sessionType: InterviewType | string | undefined): CoachQuestionClass {
  const t = normalizeInterviewType(sessionType);
  switch (t) {
    case "behavioural":
    case "behavioral":
      return "behavioural";
    case "technical":
      return "technical";
    case "coding":
      return "coding";
    case "system_design":
      return "system_design";
    case "product":
      return "product";
    case "leadership":
      return "leadership";
    case "hr":
      return "hr";
    case "government_exam":
    case "academic":
      return "technical";
    default:
      return "mixed";
  }
}

/** Map classifier output to offlineTemplates InterviewType keys. */
export function coachClassToTemplateType(cls: CoachQuestionClass): InterviewType {
  switch (cls) {
    case "behavioural":
      return "behavioural";
    case "technical":
      return "technical";
    case "coding":
      return "coding";
    case "system_design":
      return "system_design";
    case "product":
      return "product";
    case "leadership":
      return "leadership";
    case "hr":
      return "hr";
    case "mixed":
    default:
      return "mixed";
  }
}

/** Map classifier output to structureForMode framework. */
export function coachClassToStructureMode(cls: CoachQuestionClass): ResponseStructureMode {
  switch (cls) {
    case "behavioural":
    case "leadership":
    case "hr":
      return "star";
    case "coding":
      return "coding";
    case "system_design":
      return "detailed";
    case "technical":
    case "product":
      return "technical";
    case "mixed":
    default:
      return "balanced";
  }
}

export function coachClassLabel(cls: CoachQuestionClass): string {
  switch (cls) {
    case "behavioural":
      return "Behavioral / STAR";
    case "technical":
      return "Technical";
    case "coding":
      return "Coding";
    case "system_design":
      return "System design";
    case "product":
      return "Product";
    case "leadership":
      return "Leadership";
    case "hr":
      return "HR";
    case "mixed":
    default:
      return "General";
  }
}

/**
 * Classify a finalized interviewer question for offline / degraded coaching.
 * Session type is only a weak prior when the text is ambiguous.
 */
export function classifyCoachQuestion(
  questionText: string,
  sessionType?: InterviewType | string | null,
): CoachQuestionClass {
  const q = String(questionText ?? "").trim().toLowerCase();
  const prior = sessionClassAsPrior(sessionType);

  if (!q) return prior;

  const systemDesign =
    /\b(system design|design (a|an|the)\s+\w+|high[- ]?level design|hld|scalability|load balanc|cdn|sharding|microservices|cap theorem|consistent hashing)\b/.test(
      q,
    ) || /\bhow would you (design|architect|scale)\b/.test(q);

  if (systemDesign) return "system_design";

  const coding =
    /\b(write (a |the )?(function|method|code|program)|leetcode|pseudocode|time complexity|space complexity|big[- ]?o|binary tree|linked list|array|hash ?map|dfs|bfs|dynamic programming|implement (a|an|the))\b/.test(
      q,
    ) || /\b(coding|algorithm|data structure)\b/.test(q);

  if (coding && !/\b(sql|database|query|join|index)\b/.test(q)) return "coding";

  const technicalSql =
    /\b(sql|select\b|join\b|index(?:es)?|normali[sz]e|acid|transaction|query plan|foreign key|primary key|nosql|postgres|mysql|mongodb|redis|database|schema|orm)\b/.test(
      q,
    ) ||
    /\b(what is|explain|difference between|how does|define)\b/.test(q) &&
      /\b(api|http|rest|graphql|cache|concurrency|thread|lock|gc|memory|latency|throughput|tcp|udp|dns|oauth|jwt|encryption|hashing)\b/.test(
        q,
      );

  if (technicalSql) return "technical";

  const leadership =
    /\b(lead(?:ership|ing)?|managed a team|influence without authority|conflict on (?:the )?team|mentored|performance review)\b/.test(
      q,
    );

  if (leadership) return "leadership";

  const behavioural =
    /\b(tell me about a time|describe a (?:time|situation)|give (?:me )?an example|conflict|challenging (?:situation|project)|failure|mistake you made|proud of)\b/.test(
      q,
    );

  if (behavioural) return "behavioural";

  const hr =
    /\b(why (?:do you want|this company|this role)|salary|notice period|relocation|strengths? and weaknesses?|where do you see yourself)\b/.test(
      q,
    );

  if (hr) return "hr";

  const product =
    /\b(prioriti[sz]e|rice|ice|moscow|go[- ]to[- ]market|product (?:sense|strategy|roadmap)|user persona|north star metric)\b/.test(
      q,
    );

  if (product) return "product";

  // Weak prior from session when text is ambiguous.
  if (prior !== "mixed") return prior;
  return "mixed";
}

export interface OfflineCategoryHint {
  text: string;
  questionClass: CoachQuestionClass;
  categoryLabel: string;
}

/**
 * Build category-aware offline / AI-unavailable coaching text.
 * Resume talking points only apply to story-shaped classes — never override SQL/coding.
 */
export function buildOfflineCategoryHint(opts: {
  question: string;
  sessionType?: InterviewType | string | null;
  hintStyle: HintStyle;
  resumeTalkingPoints?: ResumeTalkingPoints | null;
}): OfflineCategoryHint {
  const cls = classifyCoachQuestion(opts.question, opts.sessionType);
  const categoryLabel = coachClassLabel(cls);
  const templateType = coachClassToTemplateType(cls);
  const mode = coachClassToStructureMode(cls);

  const storyClass = cls === "behavioural" || cls === "leadership" || cls === "hr";
  if (storyClass && opts.resumeTalkingPoints) {
    return {
      text: formatTalkingPointsAsHint(opts.resumeTalkingPoints),
      questionClass: cls,
      categoryLabel,
    };
  }

  if (mode === "star" || mode === "technical" || mode === "coding") {
    return {
      text: structureForMode(mode, opts.question || "the current question"),
      questionClass: cls,
      categoryLabel,
    };
  }

  return {
    text: getOfflineTemplate(templateType, opts.hintStyle),
    questionClass: cls,
    categoryLabel,
  };
}
