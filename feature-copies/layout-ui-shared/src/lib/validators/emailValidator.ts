// ─────────────────────────────────────────────────────────────────────────────
// emailValidator.ts — Email, password, auth form, and user input validation.
// Used by all auth forms, profile updates, and invite flows.
// ─────────────────────────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ValidationResult {
  valid:    boolean;
  error?:   string;
  warnings?: string[];
}

export interface PasswordStrength {
  score:       0 | 1 | 2 | 3 | 4;   // 0 = very weak, 4 = very strong
  label:       "Very Weak" | "Weak" | "Fair" | "Strong" | "Very Strong";
  color:       "red" | "orange" | "yellow" | "blue" | "green";
  feedback:    string[];
  isAcceptable: boolean;             // score >= 2 to allow signup
}

export interface SignUpFormData {
  email:           string;
  password:        string;
  confirmPassword: string;
  fullName?:       string;
}

export interface SignUpFormErrors {
  email?:          string;
  password?:       string;
  confirmPassword?: string;
  fullName?:       string;
}

// ─── Email ────────────────────────────────────────────────────────────────────

// RFC 5322 simplified — covers 99.9% of real emails
const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/;

// Common disposable email domains to warn about
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com", "guerrillamail.com", "tempmail.com",
  "throwaway.email", "yopmail.com", "trashmail.com",
  "sharklasers.com", "guerrillamailblock.com", "10minutemail.com",
]);

// Common corporate/personal domains — always trusted
const TRUSTED_DOMAINS = new Set([
  "gmail.com", "outlook.com", "hotmail.com", "yahoo.com",
  "icloud.com", "protonmail.com", "live.com", "msn.com",
]);

/**
 * Validate an email address format.
 *
 * @example
 * validateEmail("user@example.com") // → { valid: true }
 * validateEmail("not-an-email")     // → { valid: false, error: "Invalid email format." }
 */
export function validateEmail(email: string): ValidationResult {
  const trimmed = email.trim();

  if (!trimmed) {
    return { valid: false, error: "Email address is required." };
  }

  if (trimmed.length > 254) {
    return { valid: false, error: "Email address is too long." };
  }

  if (!EMAIL_REGEX.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address." };
  }

  const domain = trimmed.split("@")[1]?.toLowerCase();
  const warnings: string[] = [];

  if (domain && DISPOSABLE_DOMAINS.has(domain)) {
    warnings.push("Disposable email addresses may not receive important notifications.");
  }

  // Check for common typos in popular domains
  const typoSuggestion = detectEmailTypo(trimmed);
  if (typoSuggestion) {
    warnings.push(`Did you mean ${typoSuggestion}?`);
  }

  return { valid: true, warnings: warnings.length ? warnings : undefined };
}

/**
 * Detect common email domain typos and suggest corrections.
 */
function detectEmailTypo(email: string): string | null {
  const domain = email.split("@")[1]?.toLowerCase();
  if (!domain) return null;

  const TYPO_MAP: Record<string, string> = {
    "gmai.com":    "gmail.com",
    "gmial.com":   "gmail.com",
    "gmail.co":    "gmail.com",
    "gmail.cm":    "gmail.com",
    "gnail.com":   "gmail.com",
    "hotmai.com":  "hotmail.com",
    "hotmial.com": "hotmail.com",
    "outloo.com":  "outlook.com",
    "outlok.com":  "outlook.com",
    "yaho.com":    "yahoo.com",
    "yahooo.com":  "yahoo.com",
    "iclod.com":   "icloud.com",
  };

  const correction = TYPO_MAP[domain];
  if (!correction) return null;

  const local = email.split("@")[0];
  return `${local}@${correction}`;
}

// ─── Password ─────────────────────────────────────────────────────────────────

const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const COMMON_PASSWORDS = new Set([
  "password", "password1", "123456", "123456789", "qwerty",
  "abc123", "iloveyou", "admin", "letmein", "monkey",
  "welcome", "password123", "dragon", "master", "sunshine",
]);

/**
 * Validate password meets minimum requirements.
 */
export function validatePassword(password: string): ValidationResult {
  if (!password) {
    return { valid: false, error: "Password is required." };
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    return {
      valid: false,
      error: `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`,
    };
  }

  if (password.length > PASSWORD_MAX_LENGTH) {
    return {
      valid: false,
      error: `Password must be less than ${PASSWORD_MAX_LENGTH} characters.`,
    };
  }

  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return { valid: false, error: "This password is too common. Please choose something unique." };
  }

  return { valid: true };
}

/**
 * Compute password strength score and feedback.
 *
 * @example
 * const strength = getPasswordStrength("MyP@ssw0rd!");
 * // → { score: 3, label: "Strong", isAcceptable: true, feedback: [] }
 */
export function getPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const feedback: string[] = [];

  if (!password) {
    return { score: 0, label: "Very Weak", color: "red", feedback: ["Enter a password."], isAcceptable: false };
  }

  // Length
  if (password.length >= 8)  score++;
  if (password.length >= 12) score++;
  else feedback.push("Use 12+ characters for a stronger password.");

  // Character variety
  const hasLower   = /[a-z]/.test(password);
  const hasUpper   = /[A-Z]/.test(password);
  const hasDigit   = /[0-9]/.test(password);
  const hasSpecial = /[^a-zA-Z0-9]/.test(password);

  const varietyCount = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  if (varietyCount >= 3) score++;
  if (varietyCount === 4) score++;

  if (!hasUpper)   feedback.push("Add uppercase letters.");
  if (!hasDigit)   feedback.push("Add numbers.");
  if (!hasSpecial) feedback.push("Add special characters (!@#$%^&*).");

  // Common password penalty
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    score = Math.max(0, score - 2);
    feedback.unshift("Avoid common passwords.");
  }

  // Repeated chars penalty
  if (/(.)\1{3,}/.test(password)) {
    score = Math.max(0, score - 1);
    feedback.push("Avoid repeating characters.");
  }

  const clamped = Math.min(4, Math.max(0, score)) as 0 | 1 | 2 | 3 | 4;

  const LABELS: PasswordStrength["label"][] = ["Very Weak", "Weak", "Fair", "Strong", "Very Strong"];
  const COLORS: PasswordStrength["color"][] = ["red", "orange", "yellow", "blue", "green"];

  return {
    score:        clamped,
    label:        LABELS[clamped],
    color:        COLORS[clamped],
    feedback:     feedback.slice(0, 3),
    isAcceptable: clamped >= 2,
  };
}

// ─── Form Validators ──────────────────────────────────────────────────────────

/**
 * Validate the full sign-up form in one pass.
 * Returns an errors object — empty means all fields are valid.
 *
 * @example
 * const errors = validateSignUpForm({ email, password, confirmPassword, fullName });
 * if (Object.keys(errors).length === 0) proceed();
 */
export function validateSignUpForm(data: SignUpFormData): SignUpFormErrors {
  const errors: SignUpFormErrors = {};

  const emailResult = validateEmail(data.email);
  if (!emailResult.valid) errors.email = emailResult.error;

  const passwordResult = validatePassword(data.password);
  if (!passwordResult.valid) errors.password = passwordResult.error;

  if (!data.confirmPassword) {
    errors.confirmPassword = "Please confirm your password.";
  } else if (data.password !== data.confirmPassword) {
    errors.confirmPassword = "Passwords do not match.";
  }

  if (data.fullName !== undefined) {
    const nameResult = validateFullName(data.fullName);
    if (!nameResult.valid) errors.fullName = nameResult.error;
  }

  return errors;
}

/**
 * Validate sign-in form fields.
 */
export function validateSignInForm(data: {
  email: string;
  password: string;
}): Pick<SignUpFormErrors, "email" | "password"> {
  const errors: Pick<SignUpFormErrors, "email" | "password"> = {};

  const emailResult = validateEmail(data.email);
  if (!emailResult.valid) errors.email = emailResult.error;

  if (!data.password) errors.password = "Password is required.";

  return errors;
}

// ─── Name & Profile ───────────────────────────────────────────────────────────

export function validateFullName(name: string): ValidationResult {
  const trimmed = name.trim();

  if (!trimmed) {
    return { valid: false, error: "Full name is required." };
  }
  if (trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters." };
  }
  if (trimmed.length > 100) {
    return { valid: false, error: "Name must be under 100 characters." };
  }
  if (/[<>{}[\]\\\/]/.test(trimmed)) {
    return { valid: false, error: "Name contains invalid characters." };
  }
  return { valid: true };
}

export function validateURL(url: string): ValidationResult {
  if (!url) return { valid: true }; // optional field

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "URL must start with http:// or https://" };
    }
    return { valid: true };
  } catch {
    return { valid: false, error: "Please enter a valid URL." };
  }
}

export function validateLinkedInURL(url: string): ValidationResult {
  if (!url) return { valid: true };

  const urlResult = validateURL(url);
  if (!urlResult.valid) return urlResult;

  if (!url.includes("linkedin.com/in/")) {
    return { valid: false, error: "Please enter a valid LinkedIn profile URL." };
  }
  return { valid: true };
}

// ─── Generic Text Validators ──────────────────────────────────────────────────

export function validateRequired(value: string, fieldName = "This field"): ValidationResult {
  if (!value?.trim()) {
    return { valid: false, error: `${fieldName} is required.` };
  }
  return { valid: true };
}

export function validateMaxLength(
  value: string,
  max: number,
  fieldName = "This field"
): ValidationResult {
  if (value.length > max) {
    return { valid: false, error: `${fieldName} must be under ${max} characters. (${value.length}/${max})` };
  }
  return { valid: true };
}

export function validateMinLength(
  value: string,
  min: number,
  fieldName = "This field"
): ValidationResult {
  if (value.trim().length < min) {
    return { valid: false, error: `${fieldName} must be at least ${min} characters.` };
  }
  return { valid: true };
}
