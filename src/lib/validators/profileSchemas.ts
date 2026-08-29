// src/lib/validators/profileSchemas.ts
//
// Profile update validation schemas.
//
// SECURITY PURPOSE:
// - Validate profile/settings updates before API calls
// - Ensure Full Name is not blank
// - Ensure Website URL is valid
// - Prevent obviously invalid input
// - Match server-side validation

import { z } from "zod";
import { sanitizeText } from "@/lib/security";

const MAX_NAME_LENGTH = 200;
const MIN_NAME_LENGTH = 2;
const MAX_BIO_LENGTH = 500;
const MAX_URL_LENGTH = 500;

// ✅ FIX: Full Name validation
// - Required
// - Minimum 2 characters (after trim)
// - Maximum 200 characters
// - Cannot be whitespace-only
function validateFullName(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.length >= MIN_NAME_LENGTH && trimmed.length <= MAX_NAME_LENGTH;
}

// Website URL validation
function validateWebsiteUrl(url: string): boolean {
  if (!url || !url.trim()) return true; // Optional field
  
  try {
    const trimmed = url.trim();
    const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const parsed = new URL(withProtocol);
    
    // Only allow http/https
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return false;
    }
    
    // Must have a domain with at least one dot
    if (!parsed.hostname.includes(".")) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

// Profile update schema
export const profileUpdateSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(MIN_NAME_LENGTH, `Full name must be at least ${MIN_NAME_LENGTH} characters long.`)
    .max(MAX_NAME_LENGTH, `Full name must be ${MAX_NAME_LENGTH} characters or less.`)
    .refine(
      (value) => validateFullName(value),
      "Full name must be at least 2 characters long."
    ),
  
  bio: z
    .string()
    .trim()
    .max(MAX_BIO_LENGTH, `Bio must be ${MAX_BIO_LENGTH} characters or less.`)
    .optional()
    .default(""),
  
  website_url: z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, `Website URL must be ${MAX_URL_LENGTH} characters or less.`)
    .nullable()
    .optional()
    .refine(
      (value) => !value || validateWebsiteUrl(value),
      "Enter a valid website URL (e.g., https://example.com)."
    ),
  
  timezone: z
    .string()
    .trim()
    .default("UTC"),
  
  experience_years: z
    .number()
    .int()
    .min(0)
    .nullable()
    .optional(),
  
  target_role: z
    .string()
    .trim()
    .nullable()
    .optional(),
  
  avatar_url: z
    .string()
    .trim()
    .url("Avatar URL must be a valid URL.")
    .nullable()
    .optional(),
});

export type ProfileUpdateInput = z.infer<typeof profileUpdateSchema>;

// Interview scheduler validation schema
export const interviewScheduleSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters long.")
    .max(200, "Company name must be 200 characters or less.")
    .refine(
      (value) => {
        // Reject obvious placeholders
        const t = value.trim();
        if (t.length < 3) return false;
        if (/^\d+$/.test(t)) return false; // digits only
        if (/^(.)\1{2,}$/i.test(t)) return false; // repeated chars
        if (!/[a-zA-Z]/.test(t)) return false; // no letters
        const stubs = new Set(["test", "testing", "asdf", "qwerty", "company", "n/a", "na", "none"]);
        return !stubs.has(t.toLowerCase());
      },
      "Enter a real company name (not placeholder text or numbers)."
    ),
  
  role_title: z
    .string()
    .trim()
    .min(2, "Role must be at least 2 characters long.")
    .max(200, "Role must be 200 characters or less.")
    .refine(
      (value) => {
        const t = value.trim();
        if (t.length < 3) return false;
        if (/^\d+$/.test(t)) return false;
        if (/^(.)\1{2,}$/i.test(t)) return false;
        if (!/[a-zA-Z]/.test(t)) return false;
        const stubs = new Set(["test", "testing", "asdf", "role", "n/a", "na", "none"]);
        return !stubs.has(t.toLowerCase());
      },
      "Enter a real role or position title (not placeholder text or numbers)."
    ),
  
  scheduled_at: z
    .string()
    .datetime("Invalid interview date/time.")
    .refine(
      (value) => new Date(value).getTime() > Date.now(),
      "Interview must be scheduled for a future date and time."
    ),
  
  timezone: z
    .string()
    .trim()
    .default("UTC"),
  
  platform: z
    .string()
    .trim()
    .optional(),
  
  duration_minutes: z
    .number()
    .int()
    .min(15)
    .max(480)
    .optional(),
  
  interviewer_name: z
    .string()
    .trim()
    .max(200)
    .optional(),
  
  meeting_link: z
    .string()
    .trim()
    .url("Meeting link must be a valid URL.")
    .optional(),
  
  notes: z
    .string()
    .trim()
    .max(2000)
    .optional(),
  
  is_remote: z.boolean().optional(),
  
  stage: z.string().optional(),
  
  priority: z.enum(["low", "medium", "high"]).optional(),
  
  location: z.string().trim().optional(),
  
  job_posting_url: z.string().trim().url().optional(),
  
  salary_range: z.string().trim().optional(),
  
  resume_id: z.string().uuid().nullable().optional(),
  
  jd_id: z.string().uuid().nullable().optional(),
});

export type InterviewScheduleInput = z.infer<typeof interviewScheduleSchema>;
