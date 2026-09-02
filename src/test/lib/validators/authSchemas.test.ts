/**
 * Registration validation — T-0568 (valid data) and T-0569 (duplicate email is
 * enforced at the API layer; schema rejects invalid payloads before submit).
 */
import { describe, it, expect } from "vitest";
import { loginSchema, signupSchema } from "@/lib/validators/authSchemas";

const VALID_SIGNUP = {
  fullName: "Jane Smith",
  email: "jane.smith@example.com",
  password: "Str0ng!Pass",
  confirmPassword: "Str0ng!Pass",
  acceptTerms: true,
};

describe("signupSchema — T-0568 registration with valid data", () => {
  it("accepts a complete valid registration payload", () => {
    const result = signupSchema.safeParse(VALID_SIGNUP);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane.smith@example.com");
      expect(result.data.fullName).toBe("Jane Smith");
    }
  });

  it("normalizes email to lowercase", () => {
    const result = signupSchema.safeParse({
      ...VALID_SIGNUP,
      email: "Jane.Smith@Example.COM",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("jane.smith@example.com");
    }
  });
});

describe("signupSchema — T-0569 invalid / duplicate-prone registration", () => {
  it("rejects mismatched password confirmation", () => {
    const result = signupSchema.safeParse({
      ...VALID_SIGNUP,
      confirmPassword: "Different1!",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const confirmError = result.error.flatten().fieldErrors.confirmPassword?.[0];
      expect(confirmError).toMatch(/match/i);
    }
  });

  it("rejects weak passwords before reaching the API", () => {
    const result = signupSchema.safeParse({
      ...VALID_SIGNUP,
      password: "weakpass",
      confirmPassword: "weakpass",
    });
    expect(result.success).toBe(false);
  });

  it("rejects signup when terms are not accepted", () => {
    const result = signupSchema.safeParse({
      ...VALID_SIGNUP,
      acceptTerms: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const termsError = result.error.flatten().fieldErrors.acceptTerms?.[0];
      expect(termsError).toMatch(/terms/i);
    }
  });

  it("rejects invalid email format", () => {
    const result = signupSchema.safeParse({
      ...VALID_SIGNUP,
      email: "not-an-email",
    });
    expect(result.success).toBe(false);
  });
});

describe("loginSchema — email normalize, password preservation", () => {
  it("trims and lowercases email without changing the password", () => {
    const password = "  Str0ng!Pass  ";
    const result = loginSchema.safeParse({
      email: "  Free.User@Example.COM ",
      password,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("free.user@example.com");
      expect(result.data.password).toBe(password);
    }
  });
});

describe("loginSchema — TC-AUTH-004 required-field validation", () => {
  it("rejects empty email", () => {
    const result = loginSchema.safeParse({ email: "", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toBe(
        "Email is required.",
      );
    }
  });

  it("rejects empty password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password?.[0]).toBe(
        "Password is required.",
      );
    }
  });

  it("rejects when both fields are empty", () => {
    const result = loginSchema.safeParse({ email: "", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fieldErrors = result.error.flatten().fieldErrors;
      expect(fieldErrors.email?.[0]).toBe("Email is required.");
      expect(fieldErrors.password?.[0]).toBe("Password is required.");
    }
  });

  it("rejects invalid email format", () => {
    const result = loginSchema.safeParse({
      email: "not-an-email",
      password: "secret",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toBe(
        "Enter a valid email address.",
      );
    }
  });

  it("rejects whitespace-only email", () => {
    const result = loginSchema.safeParse({ email: "   ", password: "secret" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.email?.[0]).toBe(
        "Email is required.",
      );
    }
  });

  it("rejects whitespace-only password", () => {
    const result = loginSchema.safeParse({
      email: "user@example.com",
      password: "   ",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.password?.[0]).toBe(
        "Password is required.",
      );
    }
  });

  it("accepts valid credentials", () => {
    const result = loginSchema.safeParse({
      email: "User@Example.com",
      password: "any-password",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("user@example.com");
      expect(result.data.password).toBe("any-password");
    }
  });
});
