import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { shouldRestartQuestionTts } from "@/lib/mock/mockTts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function readRepo(relative: string): string {
  return fs.readFileSync(path.join(root, relative), "utf8").replace(/\r\n/g, "\n");
}

describe("mock session render stability", () => {
  it("does not restart TTS across many timer ticks of the same question", () => {
    const id = { id: "q-1", text: "Walk me through a time you led a team." };
    let prev = id;
    for (let tick = 0; tick < 180; tick += 1) {
      expect(shouldRestartQuestionTts(prev, id)).toBe(false);
      prev = id;
    }
  });

  it("Mock Interview TTS effect is keyed by question identity, not callback identity", () => {
    const src = readRepo("src/pages/app/mock/MockSession.tsx");
    expect(src).toContain("ttsIdentity.id");
    expect(src).toContain("ttsIdentity.text");
    expect(src).toContain("playInterviewerVoiceRef.current");
    expect(src).not.toMatch(
      /}, \[phase, question, qIndex, injectInterviewerQuestion, playInterviewerVoice\]/,
    );
  });

  it("useAudioSession does not subscribe to 10 Hz analyser levels", () => {
    const src = readRepo("src/hooks/useAudioSession.ts");
    expect(src).not.toMatch(/useAudioStore\(\(s\) => s\.levels\?\.current_level/);
    expect(src).not.toMatch(/useAudioStore\(\(s\) => s\.levels\?\.is_speaking/);
  });

  it("exposes an explicit blocked-audio fallback control", () => {
    const src = readRepo("src/pages/app/mock/MockSession.tsx");
    expect(src).toContain("mock-play-interviewer-voice");
    expect(src).toContain("mock-tts-blocked");
    expect(src).toContain("unlockBrowserTts");
  });
});
