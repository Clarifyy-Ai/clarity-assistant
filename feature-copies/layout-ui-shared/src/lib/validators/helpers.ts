// src/lib/validators/helpers.ts
//
// Shared validation helpers.
//
// SECURITY PURPOSE:
// - Provide safe forms and API calls// - Provide safe validation wrappers around Zod schemas
//
// Use these helpers in:
// - Form submit handlers
// - API payload validation
// - Edge function request preparation
// - Store actions before persistence

import { z } from "zod";
import { sanitizeObject, sanitizeText } from "@/lib/security";

export type ValidationFieldErrors = Record<string, string[]>;

export type ValidationSuccess<T> = {
  success: true;
  data: T;
  errors: null;
  message: null;
};

export type ValidationFailure = {
  success: false;
  data: null;
  errors: ValidationFieldErrors;
  message: string;
};

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure;

export class ValidationError extends Error {
  public readonly fieldErrors: ValidationFieldErrors;

  public constructor(message: string, fieldErrors: ValidationFieldErrors = {}) {
    super(message);
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/**
 * Converts a Zod path into a readable form field path.
 *
 * Example:
 * ["profile", "name"] -> "profile.name"
 * ["answers", 0, "text"] -> "answers.0.text"
 */
function formatZodPath(path: Array<string | number>): string {
  if (path.length === 0) {
    return "_form";
  }

  return path.map(String).join(".");
}

/**
 * Converts Zod errors into field-level error map.
 */
export function zodErrorToFieldErrors(error: z.ZodError): ValidationFieldErrors {
  const fieldErrors: ValidationFieldErrors = {};

  for (const issue of error.issues) {
    const key = formatZodPath(issue.path);

    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }

    fieldErrors[key].push(issue.message);
  }

  return fieldErrors;
}

/**
 * Returns the first readable validation error message.
 */
export function getFirstValidationMessage(errors: ValidationFieldErrors): string {
  for (const messages of Object.values(errors)) {
    const firstMessage = messages[0];

    if (firstMessage) {
      return firstMessage;
    }
  }

  return "Please check the highlighted fields and try again.";
}

/**
 * Safely validates unknown input against a Zod schema.
 *
 * Returns a discriminated result instead of throwing.
 */
export function safeValidate<T>(
  schema: z.ZodType<T>,
  input: unknown
): ValidationResult<T> {
  const result = schema.safeParse(input);

  if (result.success) {
    return {
      success: true,
      data: result.data,
      errors: null,
      message: null,
    };
  }

  const errors = zodErrorToFieldErrors(result.error);

  return {
    success: false,
    data: null,
    errors,
    message: getFirstValidationMessage(errors),
  };
}

/**
 * Sanitizes input first, then validates it.
 *
 * Use this when input comes directly from forms, API responses,
 * AI responses, document parsing, or any untrusted source.
 */
export function sanitizeAndValidate<T>(
  schema: z.ZodType<T>,
  input: unknown
): ValidationResult<T> {
  const sanitizedInput = sanitizeObject(input);

  return safeValidate(schema, sanitizedInput);
}

/**
 * Validates input and throws ValidationError if invalid.
 *
 * Use this in places where throwing is expected:
 * - store actions
 * - service functions
 * - API client methods
 */
export function validateOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = safeValidate(schema, input);

  if (!result.success) {
    throw new ValidationError(result.message, result.errors);
  }

  return result.data;
}

/**
 * Sanitizes input, validates it, and throws ValidationError if invalid.
 */
export function sanitizeValidateOrThrow<T>(
  schema: z.ZodType<T>,
  input: unknown
): T {
  const sanitizedInput = sanitizeObject(input);

  return validateOrThrow(schema, sanitizedInput);
}

/**
 * Converts FormData into a plain object.
 *
 * Handles repeated fields by converting them into arrays.
 */
export function formDataToObject(formData: FormData): Record<string, unknown> {
  const output: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    const existingValue = output[key];

    if (existingValue === undefined) {
      output[key] = value;
      continue;
    }

    if (Array.isArray(existingValue)) {
      existingValue.push(value);
      continue;
    }

    output[key] = [existingValue, value];
  }

  return output;
}

/**
 * Sanitizes FormData and returns a plain object.
 */
export function sanitizeFormData(formData: FormData): Record<string, unknown> {
  return sanitizeObject(formDataToObject(formData));
}

/**
 * Validates FormData against a schema.
 */
export function validateFormData<T>(
  schema: z.ZodType<T>,
  formData: FormData
): ValidationResult<T> {
  return sanitizeAndValidate(schema, sanitizeFormData(formData));
}

/**
 * Validates FormData and throws ValidationError if invalid.
 */
export function validateFormDataOrThrow<T>(
  schema: z.ZodType<T>,
  formData: FormData
): T {
  return sanitizeValidateOrThrow(schema, sanitizeFormData(formData));
}

/**
 * Returns a single error message for a field.
 */
export function getFieldError(
  errors: ValidationFieldErrors | null | undefined,
  fieldName: string
): string | null {
  if (!errors) {
    return null;
  }

  const messages = errors[fieldName];

  if (!messages || messages.length === 0) {
    return null;
  }

  return messages[0] ?? null;
}

/**
 * Returns all error messages for a field.
 */
export function getFieldErrors(
  errors: ValidationFieldErrors | null | undefined,
  fieldName: string
): string[] {
  if (!errors) {
    return [];
  }

  return errors[fieldName] ?? [];
}

/**
 * Checks if a field has a validation error.
 */
export function hasFieldError(
  errors: ValidationFieldErrors | null | undefined,
  fieldName: string
): boolean {
  return getFieldErrors(errors, fieldName).length > 0;
}

/**
 * Flattens all validation errors into a single array.
 */
export function flattenValidationErrors(errors: ValidationFieldErrors): string[] {
  return Object.values(errors).flat();
}

/**
 * Converts validation errors into a readable sentence.
 */
export function validationErrorsToMessage(errors: ValidationFieldErrors): string {
  const flattened = flattenValidationErrors(errors);

  if (flattened.length === 0) {
    return "Validation failed.";
  }

  return flattened.join(" ");
}

/**
 * Validates email format without throwing.
 */
export function isValidEmail(email: string): boolean {
  const result = z.string().trim().email().safeParse(email);

  return result.success;
}

/**
 * Basic password strength check.
 *
 * This mirrors the auth schema requirements:
 * - at least 8 characters
 * - lowercase
 * - uppercase
 * - number
 * - special character
 */
export function isStrongPassword(password: string): boolean {
  if (typeof password !== "string") {
    return false;
  }

  return (
    password.length >= 8 &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password) &&
    /[^A-Za-z0-9]/.test(password)
  );
}

/**
 * Gives user-friendly password strength feedback.
 */
export function getPasswordStrengthErrors(password: string): string[] {
  const errors: string[] = [];

  if (password.length < 8) {
    errors.push("Password must be at least 8 characters.");
  }

  if (!/[a-z]/.test(password)) {
    errors.push("Password must include at least one lowercase letter.");
  }

  if (!/[A-Z]/.test(password)) {
    errors.push("Password must include at least one uppercase letter.");
  }

  if (!/\d/.test(password)) {
    errors.push("Password must include at least one number.");
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    errors.push("Password must include at least one special character.");
  }

  return errors;
}

/**
 * Sanitizes a generic search query.
 *
 * Useful for search boxes, filters, admin user search, etc.
 */
export function sanitizeSearchQuery(input: string, maxLength = 200): string {
  return sanitizeText(input).slice(0, maxLength);
}

/**
 * Creates a safe validation failure manually.
 *
 * Useful when validation depends on async checks:
 * - duplicate email
 * - insufficient credits
 * - missing permission
 */
export function createValidationFailure(
  fieldName: string,
  message: string
): ValidationFailure {
  return {
    success: false,
    data: null,
    errors: {
      [fieldName]: [message],
    },
    message,
  };
}

/**
 * Creates a safe validation success manually.
 */
export function createValidationSuccess<T>(data: T): ValidationSuccess<T> {
  return {
    success: true,
    data,
    errors: null,
    message: null,
  };
}
// - Standardize user-friendly validation error messages
// - Sanitize payloads before validation/submission
