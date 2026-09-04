import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearSessionAiContext,
  getOrBuildSessionAiContext,
  lastTranscriptSlice,
  sessionAiContextFingerprint,
  type SessionAiContextLoaders,
} from "@/lib/ai/sessionAiContext";

describe("sessionAiContext cache", () => {
  afterEach(() => {
    clearSessionAiContext();
  });

  it("builds once then reuses cover letter / answer bank loaders", async () => {
    const buildResumeBlock = vi.fn(async () => "RESUME_BLOCK");
    const loadJdKeywords = vi.fn(async () => ["react"]);
    const loadStarStories = vi.fn(async () => "\n\nSTAR");
    const loaders: SessionAiContextLoaders = {
      buildResumeBlock,
      loadJdKeywords,
      loadStarStories,
    };
    const input = {
      userId: "user-1",
      resumeId: "r1",
      jdId: "j1",
      instructions: "be concise",
    };

    const first = await getOrBuildSessionAiContext(input, loaders);
    const second = await getOrBuildSessionAiContext(input, loaders);

    expect(first.fingerprint).toBe(sessionAiContextFingerprint(input));
    expect(first.resumeBlock).toContain("RESUME_BLOCK");
    expect(first.resumeBlock).toContain("react");
    expect(second).toBe(first);
    expect(buildResumeBlock).toHaveBeenCalledTimes(1);
    expect(loadJdKeywords).toHaveBeenCalledTimes(1);
    expect(loadStarStories).toHaveBeenCalledTimes(1);
  });

  it("slices transcript to the last 2500 characters", () => {
    const long = "a".repeat(3000);
    expect(lastTranscriptSlice(long).length).toBe(2500);
    expect(lastTranscriptSlice("short")).toBe("short");
  });

  it("uses frozen resume/jd text and skips live loaders when checksum is set", async () => {
    const buildResumeBlock = vi.fn(async () => "SHOULD_NOT_RUN");
    const loadJdKeywords = vi.fn(async () => ["SHOULD_NOT_RUN"]);
    const loadStarStories = vi.fn(async () => "SHOULD_NOT_RUN");
    const loaders: SessionAiContextLoaders = {
      buildResumeBlock,
      loadJdKeywords,
      loadStarStories,
    };

    const built = await getOrBuildSessionAiContext(
      {
        userId: "user-1",
        resumeId: "r1",
        jdId: "j1",
        contextChecksum: "abc12345",
        frozenResumeText: "FROZEN_RESUME",
        frozenJdText: "FROZEN_JD",
      },
      loaders,
    );

    expect(built.resumeBlock).toContain("FROZEN_RESUME");
    expect(built.resumeBlock).toContain("FROZEN_JD");
    expect(built.fingerprint).toContain("abc12345");
    expect(buildResumeBlock).not.toHaveBeenCalled();
    expect(loadJdKeywords).not.toHaveBeenCalled();
    expect(loadStarStories).not.toHaveBeenCalled();
  });
});
