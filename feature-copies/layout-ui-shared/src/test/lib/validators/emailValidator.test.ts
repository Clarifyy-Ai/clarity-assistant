// Auth validators — covers Auth section P0 items in QA catalog
// (T-IDs: email format validation, password strength, terms required, etc.)
import { describe, it, expect } from "vitest";
import {
  validateEmail,
  validatePassword,
  getPasswordStrength,
  validateSignUpForm,
  validateSignInForm,
  validateFullName,
  validateURL,
  validateLinkedInURL,
} from "@/lib/validators/emailValidator";

describe("validateEmail – email format checks (T-Auth email validation)", () => {
  it("accepts a normal email", () => {
    expect(validateEmail("user@example.com").valid).toBe(true);
  });

  it("trims whitespace before validating", () => {
    expect(validateEmail("  user@example.com  ").valid).toBe(true);
  });

  it("rejects empty input", () => {
    const r = validateEmail("");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/required/i);
  });

  it("rejects malformed addresses", () => {
    expect(validateEmail("not-an-email").valid).toBe(false);
    expect(validateEmail("foo@").valid).toBe(false);
    expect(validateEmail("@bar.com").valid).toBe(false);
    expect(validateEmail("foo@bar").valid).toBe(false);
  });

  it("rejects emails over 254 chars", () => {
    const long = "a".repeat(250) + "@x.co";
    expect(validateEmail(long).valid).toBe(false);
  });

  it("warns on disposable domains", () => {
    const r = validateEmail("foo@mailinator.com");
    expect(r.valid).toBe(true);
    expect(r.warnings?.[0]).toMatch(/disposable/i);
  });

  it("suggests typo correction (gmial.com → gmail.com)", () => {
    const r = validateEmail("user@gmial.com");
    expect(r.warnings?.some((w) => w.includes("gmail.com"))).toBe(true);
  });
});

describe("validatePassword – minimum requirements", () => {
  it("rejects empty", () => {
    expect(validatePassword("").valid).toBe(false);
  });
  it("rejects under 8 chars", () => {
    const r = validatePassword("Abc1!");
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/at least 8/i);
  });
  it("rejects over 128 chars", () => {
    expect(validatePassword("A".repeat(129) + "1!").valid).toBe(false);
  });
  it("rejects common passwords", () => {
    expect(validatePassword("password").valid).toBe(false);
    expect(validatePassword("PASSWORD").valid).toBe(false); // case-insensitive
  });
  it("accepts strong password", () => {
    expect(validatePassword("MyP@ssw0rd!").valid).toBe(true);
  });
});

describe("getPasswordStrength – real-time strength meter", () => {
  it("returns Very Weak for empty", () => {
    expect(getPasswordStrength("").score).toBe(0);
  });
  it("flags missing uppercase", () => {
    const s = getPasswordStrength("lowercase123!");
    expect(s.feedback.some((f) => /uppercase/i.test(f))).toBe(true);
  });
  it("scores strong password high", () => {
    const s = getPasswordStrength("MyV3ryStr0ng!Pass");
    expect(s.score).toBeGreaterThanOrEqual(3);
    expect(s.isAcceptable).toBe(true);
  });
  it("penalises common passwords", () => {
    const s = getPasswordStrength("password");
    expect(s.score).toBeLessThanOrEqual(1);
  });
  it("penalises repeated characters", () => {
    const s = getPasswordStrength("aaaaA1!aaaa");
    expect(s.feedback.some((f) => /repeating/i.test(f))).toBe(true);
  });
});

describe("validateSignUpForm – integrated form validation", () => {
  it("returns no errors on valid input", () => {
    const errors = validateSignUpForm({
      email: "u@e.com",
      password: "MyP@ssw0rd!",
      confirmPassword: "MyP@ssw0rd!",
      fullName: "Jane Doe",
    });
    expect(Object.keys(errors)).toHaveLength(0);
  });
  it("flags mismatched password confirmation", () => {
    const errors = validateSignUpForm({
      email: "u@e.com",
      password: "MyP@ssw0rd!",
      confirmPassword: "different",
    });
    expect(errors.confirmPassword).toMatch(/match/i);
  });
  it("requires confirm password", () => {
    const errors = validateSignUpForm({
      email: "u@e.com",
      password: "MyP@ssw0rd!",
      confirmPassword: "",
    });
    expect(errors.confirmPassword).toBeTruthy();
  });
});

describe("validateSignInForm", () => {
  it("requires email and password", () => {
    const errors = validateSignInForm({ email: "", password: "" });
    expect(errors.email).toBeTruthy();
    expect(errors.password).toBeTruthy();
  });
  it("accepts valid pair", () => {
    const errors = validateSignInForm({ email: "u@e.com", password: "anything" });
    expect(errors.email).toBeUndefined();
    expect(errors.password).toBeUndefined();
  });
});

describe("validateFullName", () => {
  it("rejects names < 2 chars", () => {
    expect(validateFullName("A").valid).toBe(false);
  });
  it("rejects names with HTML/script chars", () => {
    expect(validateFullName("Bob <script>").valid).toBe(false);
  });
  it("accepts normal names", () => {
    expect(validateFullName("Jane Doe").valid).toBe(true);
  });
});

describe("validateURL & validateLinkedInURL", () => {
  it("optional URL passes when empty", () => {
    expect(validateURL("").valid).toBe(true);
  });
  it("rejects ftp protocol", () => {
    expect(validateURL("ftp://example.com").valid).toBe(false);
  });
  it("accepts https URL", () => {
    expect(validateURL("https://example.com").valid).toBe(true);
  });
  it("LinkedIn requires linkedin.com/in/ path", () => {
    expect(validateLinkedInURL("https://example.com").valid).toBe(false);
    expect(validateLinkedInURL("https://linkedin.com/in/jane").valid).toBe(true);
  });
});
