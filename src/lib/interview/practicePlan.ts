/**
 * Rule-based interview practice plan from debriefs, gap analyses, and coaching context.
 * No fabricated readiness percentages.
 */

export type PracticePlanActivityType =
  | "mock_session"
  | "star_story"
  | "question_drill"
  | "resume_gap"
  | "coding_practice"
  | "revision";

export type PracticePlanItem = {
  id: string;
  title: string;
  activity_type: PracticePlanActivityType;
  competency: string;
  reason: string;
  recommended_route: string;
  completed: boolean;
  due_offset_days: number;
};

export type PracticePlanInput = {
  weakAreas: string[];
  strongAreas: string[];
  missingSkills: string[];
  targetRole?: string | null;
  interviewDate?: string | null;
};

export function buildInterviewPracticePlan(input: PracticePlanInput): PracticePlanItem[] {
  const items: PracticePlanItem[] = [];
  const weak = uniqueNonEmpty(input.weakAreas).slice(0, 5);
  const missing = uniqueNonEmpty(input.missingSkills).slice(0, 5);

  weak.forEach((area, index) => {
    items.push({
      id: `weak-${slug(area)}`,
      title: `Practice ${area}`,
      activity_type: "question_drill",
      competency: area,
      reason: `Recent sessions flagged ${area} as an improvement area.`,
      recommended_route: "/app/mock",
      completed: false,
      due_offset_days: index + 1,
    });
  });

  missing.forEach((skill, index) => {
    items.push({
      id: `gap-${slug(skill)}`,
      title: `Cover ${skill} from your job match`,
      activity_type: "resume_gap",
      competency: skill,
      reason: `This skill appears in the job description and is missing or thin on the resume.`,
      recommended_route: "/app/documents",
      completed: false,
      due_offset_days: index + 2,
    });
  });

  items.push({
    id: "star-weekly",
    title: "Rewrite one STAR story",
    activity_type: "star_story",
    competency: "structure",
    reason: "Behavioral answers improve when Situation, Task, Action, and Result are explicit.",
    recommended_route: "/app/prep/star-builder",
    completed: false,
    due_offset_days: 2,
  });

  items.push({
    id: "mock-weekly",
    title: input.targetRole
      ? `Run a timed mock for ${input.targetRole}`
      : "Run a timed mock interview",
    activity_type: "mock_session",
    competency: "overall",
    reason: "A complete mock produces transcript evidence for the next debrief.",
    recommended_route: "/app/mock",
    completed: false,
    due_offset_days: 3,
  });

  if (weak.some((w) => /code|algorithm|system design|dsalgo/i.test(w))) {
    items.push({
      id: "coding-practice",
      title: "Practice one coding problem with visible tests",
      activity_type: "coding_practice",
      competency: "coding",
      reason: "Coding coaching is for practice workspaces only — not live assessments.",
      recommended_route: "/app/prep/coding-hints",
      completed: false,
      due_offset_days: 4,
    });
  }

  items.push({
    id: "revision",
    title: "Revise last debrief recommendations",
    activity_type: "revision",
    competency: "review",
    reason: "Close the loop on the previous session before adding new material.",
    recommended_route: "/app/debriefs",
    completed: false,
    due_offset_days: 1,
  });

  return items.slice(0, 12);
}

export function daysUntilInterview(interviewDate: string | null | undefined, now = new Date()): number | null {
  if (!interviewDate) return null;
  const target = new Date(interviewDate);
  if (Number.isNaN(target.getTime())) return null;
  return Math.ceil((target.getTime() - now.getTime()) / 86_400_000);
}

function uniqueNonEmpty(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(value);
  }
  return out;
}

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}
