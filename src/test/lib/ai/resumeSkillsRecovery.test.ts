import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildResumeContext,
  generateResumeTalkingPoints,
} from "@/lib/ai/resumeFallback";
import type { ParsedResume } from "@/types/ai.types";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("Practice Coach resume skills recovery", () => {
  it("does not show empty-skills copy when skills are buried in summary", () => {
    const stub: ParsedResume = {
      full_name: "Shabeena Sultana Shaik",
      email: null,
      phone: null,
      location: null,
      summary:
        "Software Testing (SDET) Trainee.\n\nTechnical Skills: Selenium, Java, API Testing\n\nExperience\nQSpiders",
      skills: [],
      tech_stack: [],
      experience: [],
      projects: [],
      education: [],
      total_years_experience: null,
      seniority_signal: null,
    };

    const points = generateResumeTalkingPoints(stub, {
      role: "Software Engineer",
      company: null,
    });
    const ctx = buildResumeContext(stub);

    expect(points?.skills_summary).not.toMatch(/No skills listed/i);
    expect(points?.skills_summary).toMatch(/Selenium/i);
    expect(ctx?.skills_count).toBeGreaterThan(0);
    expect(ctx?.top_skills.join(" ")).toMatch(/Java/i);
  });

  it("parse-resume fails closed on empty-skills stubs and recovers skills from prose", () => {
    const src = fs
      .readFileSync(path.join(root, "supabase/functions/parse-resume/index.ts"), "utf8")
      .replace(/\r\n/g, "\n");

    expect(src).toContain("skills.length === 0 && experience.length === 0) return true");
    expect(src).toContain("extractSkillsFromResumeText");
    expect(src).toContain("role_keywords");
    expect(src).toMatch(/runDeterministic:\s*async\s*\(\)\s*=>\s*\{\s*\n\s*\/\/ Never short-circuit/);
    expect(src).toContain("return null;");
    expect(src).toMatch(/typeof value === "string"/);
  });
});
