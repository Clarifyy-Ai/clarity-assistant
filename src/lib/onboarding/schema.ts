import { z } from "zod";
import { sanitizeText } from "@/lib/security";

const NAME_MIN = 2;
const NAME_MAX = 100;
const INTERVIEW_DATE_MAX_YEARS = 2;

const MEANINGLESS_NAMES = new Set([
  "test",
  "testing",
  "asdf",
  "qwerty",
  "n/a",
  "na",
  "none",
  "user",
  "name",
  "full name",
  "abc",
  "xyz",
  "foo",
  "bar",
  "aaaa",
  "aaa",
]);

export function isMeaningfulDisplayName(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length < NAME_MIN || trimmed.length > NAME_MAX) return false;
  if (!/[A-Za-z]/.test(trimmed)) return false;
  if (/^\d+$/.test(trimmed)) return false;
  if (/^(.)\1{2,}$/i.test(trimmed)) return false;
  if (MEANINGLESS_NAMES.has(trimmed.toLowerCase())) return false;
  return true;
}

export function isAllowedOnboardingInterviewDate(
  value: string,
  now = new Date(),
): boolean {
  const trimmed = value.trim();
  if (!trimmed) return true;
  const parsed = new Date(`${trimmed}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (parsed < today) return false;
  const max = new Date(today);
  max.setFullYear(max.getFullYear() + INTERVIEW_DATE_MAX_YEARS);
  return parsed <= max;
}

export function todayIsoDate(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function maxOnboardingInterviewIsoDate(now = new Date()): string {
  const max = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  max.setFullYear(max.getFullYear() + INTERVIEW_DATE_MAX_YEARS);
  return todayIsoDate(max);
}

export const onboardingEssentialsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(NAME_MIN, `Name must be at least ${NAME_MIN} characters.`)
    .max(NAME_MAX, `Name must be at most ${NAME_MAX} characters.`)
    .refine(isMeaningfulDisplayName, "Enter your real name — not a placeholder.")
    .transform((value) => sanitizeText(value)),
  interviewDate: z
    .string()
    .trim()
    .optional()
    .refine(
      (value) => isAllowedOnboardingInterviewDate(value ?? ""),
      "Interview date must be today or later, and within the next two years.",
    ),
});

export type OnboardingEssentialsInput = z.infer<typeof onboardingEssentialsSchema>;
