import type { InterviewType } from "@/types/session.types";

export type InterviewTypeOption = {
  value: InterviewType | string;
  label: string;
  desc?: string;
};

/** All supported session / interview categories (not limited to corporate roles). */
export const INTERVIEW_TYPE_OPTIONS: InterviewTypeOption[] = [
  { value: "behavioral", label: "Behavioural", desc: "STAR stories, teamwork, conflict" },
  { value: "technical", label: "Technical", desc: "Role-specific technical depth" },
  { value: "coding", label: "Coding", desc: "Algorithms, data structures, live coding" },
  { value: "system_design", label: "System Design", desc: "Architecture & scalability" },
  { value: "hr", label: "HR / Culture", desc: "Motivation, values, culture fit" },
  { value: "product", label: "Product", desc: "PM, roadmap, metrics" },
  { value: "leadership", label: "Leadership", desc: "Management & executive" },
  { value: "case_study", label: "Case Study", desc: "Consulting & analytical cases" },
  { value: "sales", label: "Sales", desc: "Pitch, objection handling, quota" },
  { value: "customer_success", label: "Customer Success", desc: "Retention, escalations" },
  { value: "internship", label: "Internship / Campus", desc: "Early-career & campus hiring" },
  { value: "academic", label: "Academic", desc: "PhD, research, faculty roles" },
  { value: "government_exam", label: "Government / Public Sector", desc: "Civil service & govt panels" },
  { value: "mixed", label: "Mixed / General", desc: "Blend of question styles" },
];

export function interviewTypeLabel(value: string | null | undefined): string {
  const found = INTERVIEW_TYPE_OPTIONS.find((o) => o.value === value);
  return found?.label ?? value ?? "General";
}

/** Interview types where screen capture is the primary toolbar action. */
const CAPTURE_PRIMARY_TYPES = new Set<string>(["coding", "technical", "system_design"]);

export function isCapturePrimaryForInterviewType(
  value: string | null | undefined,
): boolean {
  return CAPTURE_PRIMARY_TYPES.has(value ?? "");
}

/** Any active session may use capture; non-primary types get it in the overflow menu. */
export function isCaptureAvailableForInterviewType(
  _value: string | null | undefined,
): boolean {
  return true;
}
