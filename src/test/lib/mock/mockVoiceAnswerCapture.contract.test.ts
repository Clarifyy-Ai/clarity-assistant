import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("MockSession voice answer capture contracts (BUG 08)", () => {
  const source = fs.readFileSync(
    path.join(root, "src/pages/app/mock/MockSession.tsx"),
    "utf8",
  );

  it("opens listening with streamListeningWatermarkMs, not Date.now for STT filter", () => {
    expect(source).toContain("streamListeningWatermarkMs");
    expect(source).toContain(
      "listeningStreamWatermarkRef.current = streamListeningWatermarkMs(existingUtterances)",
    );
    expect(source).not.toMatch(
      /listeningStreamWatermarkRef\.current\s*=\s*Date\.now\(\)/,
    );
    expect(source).not.toMatch(
      /listeningStartedAtRef\.current\s*=\s*Date\.now\(\)/,
    );
  });

  it("snapshots STT before suspendCandidateCapture on Next", () => {
    const nextIdx = source.indexOf("async function handleNextQuestion");
    expect(nextIdx).toBeGreaterThan(0);
    const chunk = source.slice(nextIdx, nextIdx + 2500);
    const snapIdx = chunk.indexOf("captureSnapshot");
    const firstSuspend = chunk.indexOf("suspendCandidateCapture");
    expect(snapIdx).toBeGreaterThan(0);
    expect(firstSuspend).toBeGreaterThan(snapIdx);
  });

  it("live-binds voice into Your Answer field", () => {
    expect(source).toContain('data-testid="mock-typed-answer"');
    expect(source).toContain("preferTyped: false");
    expect(source).toContain("userTypedOverrideRef");
    expect(source).toContain("collectCandidateAnswerText");
  });
});
