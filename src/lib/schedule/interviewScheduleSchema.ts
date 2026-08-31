import { z } from "zod";

const IANA_ZONE = /^(UTC|local|[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+)$/;

export const interviewScheduleInputSchema = z.object({
  company_name: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .refine((v) => /[a-zA-Z]/.test(v), "Company name must include a letter."),
  role_title: z
    .string()
    .trim()
    .min(2)
    .max(150)
    .refine((v) => /[a-zA-Z]/.test(v), "Role title must include a letter."),
  scheduled_at: z.string().min(8),
  timezone: z.string().regex(IANA_ZONE, "timezone must be an IANA zone."),
  reminder_email: z.boolean().optional(),
});

export type InterviewScheduleInput = z.infer<typeof interviewScheduleInputSchema>;
