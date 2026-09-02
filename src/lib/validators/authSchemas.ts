// src/lib/validators/authSchemas.ts
//
// Authentication validation schemas.
//
// SECURITY PURPOSE:
// - Validate auth form inputs before Supabase/API calls
// - Prevent malformed email/password submissions
// - Enforce password strength rules
// - Sanitize user-controlled display fields like fullName
//
// Use these schemas in:
// - Login forms
// - Signup forms
// - Reset password forms
// - Change password forms
// - Profile identity forms

import { z } from "zod";
import { sanitizeText } from "@/lib/security";

const EMAIL_MAX_LENGTH = 254;
const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;
const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 100;

const emailSchema = z
  .string()
  .trim()
  .min(1, "Email is required.")
  .max(EMAIL_MAX_LENGTH, "Email is too long.")
  .email("Enter a valid email address.")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`);

const strongPasswordSchema = passwordSchema
  .refine((value) => /[a-z]/.test(value), {
    message: "Password must include at least one lowercase letter.",
  })
  .refine((value) => /[A-Z]/.test(value), {
    message: "Password must include at least one uppercase letter.",
  })
  .refine((value) => /\d/.test(value), {
    message: "Password must include at least one number.",
  })
  .refine((value) => /[^A-Za-z0-9]/.test(value), {
    message: "Password must include at least one special character.",
  });

const fullNameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, `Name must be at least ${NAME_MIN_LENGTH} characters.`)
  .max(NAME_MAX_LENGTH, `Name must be at most ${NAME_MAX_LENGTH} characters.`)
  .transform((value) => sanitizeText(value));

/** Login accepts any non-empty password; strength rules apply at signup only. */
const loginPasswordSchema = z
  .string()
  .max(
    PASSWORD_MAX_LENGTH,
    `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`,
  )
  .refine((value) => value.trim().length > 0, "Password is required.");

export const loginSchema = z.object({
  email: emailSchema,
  password: loginPasswordSchema,
});

export const signupSchema = z
  .object({
    fullName: fullNameSchema,
    email: emailSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required."),
    acceptTerms: z.boolean().refine((value) => value === true, {
      message: "You must accept the terms and privacy policy.",
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const resetPasswordSchema = z.object({
  email: emailSchema,
});

export const updatePasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export const changePasswordSchema = z
  .object({
    currentPassword: passwordSchema,
    newPassword: strongPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm password is required."),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from current password.",
    path: ["newPassword"],
  });

export const magicLinkSchema = z.object({
  email: emailSchema,
});

export const oauthProviderSchema = z.object({
  provider: z.enum(["google", "github", "linkedin"], {
    errorMap: () => ({ message: "Unsupported OAuth provider." }),
  }),
});

export const profileIdentitySchema = z.object({
  fullName: fullNameSchema,
  email: emailSchema.optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type UpdatePasswordInput = z.infer<typeof updatePasswordSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type MagicLinkInput = z.infer<typeof magicLinkSchema>;
export type OAuthProviderInput = z.infer<typeof oauthProviderSchema>;
export type ProfileIdentityInput = z.infer<typeof profileIdentitySchema>;
