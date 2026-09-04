import { describe, expect, it } from "vitest";
import {
  buildPracticeCoachContextSnapshot,
  frozenResumePromptFromSnapshot,
  isPracticeCoachContextSnapshot,
  practiceCoachSnapshotMeta,
} from "@/lib/session/practiceCoachContext";
import type { LiveSessionConfig } from "@/types/session.types";

const baseConfig = {
  company: "Acme",
  role: "Backend Engineer",
  hint_style: "bullets",
  model: "gemini-2.5-flash",
  smart_routing: true,
  stealth_mode: false,
  resume_id: "resume-1",
  jd_id: "jd-1",
  interview_type: "behavioral",
  instructions: "Focus on ownership",
  enable_system_audio: true,
  seniority: "senior",
  industry: "SaaS",
  interview_stage: "onsite",
  focus_competencies: ["ownership"],
  topics_to_avoid: ["salary"],
  skills_to_emphasize: ["Go"],
  skills_not_to_claim: ["Kubernetes"],
  answer_bank_context_ids: ["ab-1"],
  duration_minutes: 30,
  language: "en",
} as LiveSessionConfig;

describe("practiceCoachContext snapshot freeze", () => {
  it("freezes resume/jd hashes, preferences, and checksum at build time", () => {
    const snap = buildPracticeCoachContextSnapshot({
      config: baseConfig,
      resumeText: "Built APIs at Acme using Go for 4 years.",
      jdText: "Role: Backend Engineer\nCompany: Acme",
      answerBankSnippets: ["Q: Ownership — Led migration"],
      now: new Date("2026-09-04T10:00:00.000Z"),
      snapshotId: "snap-fixed",
    });

    expect(isPracticeCoachContextSnapshot(snap)).toBe(true);
    expect(snap.version).toBe("practice_coach_context_v1");
    expect(snap.snapshot_id).toBe("snap-fixed");
    expect(snap.resume_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(snap.jd_hash).toMatch(/^[0-9a-f]{8}$/);
    expect(snap.checksum).toMatch(/^[0-9a-f]{8}$/);
    expect(snap.skills_not_to_claim).toEqual(["Kubernetes"]);
    expect(snap.answer_bank_snippets[0]).toContain("Ownership");
    expect(snap.preference_block).toContain("Seniority: senior");
    expect(frozenResumePromptFromSnapshot(snap)).toContain("Built APIs at Acme");

    const meta = practiceCoachSnapshotMeta(snap);
    expect(meta.checksum).toBe(snap.checksum);
    expect(meta.snapshot_id).toBe("snap-fixed");
  });

  it("produces a stable checksum for identical freeze inputs", () => {
    const a = buildPracticeCoachContextSnapshot({
      config: baseConfig,
      resumeText: "Same resume",
      jdText: "Same jd",
      snapshotId: "same-id",
    });
    const b = buildPracticeCoachContextSnapshot({
      config: baseConfig,
      resumeText: "Same resume",
      jdText: "Same jd",
      snapshotId: "same-id",
    });
    expect(a.checksum).toBe(b.checksum);
    expect(a.resume_hash).toBe(b.resume_hash);
  });

  it("changes checksum when resume content drifts", () => {
    const a = buildPracticeCoachContextSnapshot({
      config: baseConfig,
      resumeText: "Original",
      snapshotId: "same-id",
    });
    const b = buildPracticeCoachContextSnapshot({
      config: baseConfig,
      resumeText: "Edited mid-session",
      snapshotId: "same-id",
    });
    expect(a.checksum).not.toBe(b.checksum);
  });
});
