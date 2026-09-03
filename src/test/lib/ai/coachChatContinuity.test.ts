import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

describe("coach chat continuity", () => {
  it("passes previous turns and a bounded timeout", () => {
    const client = read("src/lib/ai/openaiClient.ts");
    const session = read("src/lib/ai/coachChatSession.ts");
    const edge = read("supabase/functions/ai-coach-chat/index.ts");
    expect(client).toContain("previous_turns");
    expect(client).toContain("timeoutMs: opts.timeoutMs ?? 45_000");
    expect(session).toContain("removeChatMessage");
    expect(session).toContain("pendingChatIdempotency");
    expect(session).toContain("previousTurns");
    expect(session).toContain("CP-10245");
    expect(session).toContain("return true");
    expect(session).toContain("return false");
    expect(edge).toContain("previous_turns");
    expect(edge).toContain("mergedHistory");
  });

  it("clears the overlay composer only after submit resolves", () => {
    const input = read("src/components/overlay/OverlayChatInput.tsx");
    expect(input).toContain("if (accepted !== false)");
    expect(input).toContain('setValue("")');
    expect(input).toContain("isSubmitting");
    expect(input).toContain("initialValue");
  });

  it("renders unified session timeline including hint history", () => {
    const panel = read("src/components/overlay/OverlayChatPanel.tsx");
    expect(panel).toContain("buildSessionConversationTimeline");
    expect(panel).toContain("hintHistory");
    expect(panel).toContain("chat_prefill");
  });

  it("surfaces chat attention on the toolbar when listening fails", () => {
    const toolbar = read("src/components/overlay/OverlayToolbar.tsx");
    expect(toolbar).toContain("chatAttention");
    expect(toolbar).toContain("animate-pulse");
    const live = read("src/pages/app/live/LiveOverlay.tsx");
    expect(live).toContain("setChatAttention(true, \"manual_needed\")");
    expect(live).toContain("requestLiveHint(trimmed)");
  });

  it("AI Help recovers unclear STT then falls back to Chat attention", () => {
    const live = read("src/pages/app/live/LiveOverlay.tsx");
    expect(live).toContain("aiHelpRecovery: true");
    expect(live).toContain("chat_prefill");
    expect(live).toContain('setChatAttention(true, "manual_needed")');
    const resolve = read("src/lib/session/liveQuestionFromTranscript.ts");
    expect(resolve).toContain("aiHelpRecovery");
  });

  it("listening timeout and low-confidence STT set chat attention", () => {
    const hint = read("src/components/overlay/OverlayHintPanel.tsx");
    expect(hint).toContain("ListeningTimeoutHelp");
    expect(hint).toMatch(/setChatAttention|chat_attention/);
    const diarization = read("src/lib/audio/diarization.ts");
    expect(diarization).toContain("low_confidence");
    expect(diarization).toContain("setChatAttention");
    const tabBar = read("src/components/overlay/OverlayTabBar.tsx");
    expect(tabBar).toContain("chatAttention");
  });

  it("presentation-safe preference does not call setContentProtection", () => {
    const prefs = read("src/lib/overlay/applyOverlayWindowPrefs.ts");
    expect(prefs).toContain("applyPresentationSafePreference");
    expect(prefs).toContain("preference is store/UI only");
    expect(prefs).not.toMatch(/api\?\.setContentProtection|electronAPI.*setContentProtection/);
  });
});
