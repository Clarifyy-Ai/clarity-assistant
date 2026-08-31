import { describe, expect, it } from "vitest";
import { profileUpdateSchema } from "@/lib/validators/profileSchemas";

const base = {
  full_name: "Ada Lovelace",
  bio: "",
  timezone: "UTC",
  website_url: null,
  experience_years: null,
  target_role: null,
  avatar_url: null,
};

describe("profileUpdateSchema", () => {
  it("rejects empty or single-character full names", () => {
    expect(profileUpdateSchema.safeParse({ ...base, full_name: "" }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...base, full_name: " " }).success).toBe(false);
    expect(profileUpdateSchema.safeParse({ ...base, full_name: "A" }).success).toBe(false);
  });

  it("accepts a two-character name", () => {
    expect(profileUpdateSchema.safeParse({ ...base, full_name: "Al" }).success).toBe(true);
  });

  it("treats an empty avatar URL as unset", () => {
    expect(profileUpdateSchema.safeParse({ ...base, avatar_url: "" }).success).toBe(true);
    expect(profileUpdateSchema.safeParse({ ...base, avatar_url: null }).success).toBe(true);
  });

  it("requires an http(s) scheme on avatar URLs and rejects github.com/foo", () => {
    const noScheme = profileUpdateSchema.safeParse({
      ...base,
      avatar_url: "github.com/foo",
    });
    expect(noScheme.success).toBe(false);

    const ftp = profileUpdateSchema.safeParse({
      ...base,
      avatar_url: "ftp://example.com/a.png",
    });
    expect(ftp.success).toBe(false);

    const ok = profileUpdateSchema.safeParse({
      ...base,
      avatar_url: "https://cdn.example.com/avatar.png",
    });
    expect(ok.success).toBe(true);
  });
});
