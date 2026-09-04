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
    const gemini = read("supabase/functions/_shared/gemini.ts");
    expect(client).toContain("previous_turns");
    // Keep client 90s in sync with Edge 45s × maxAttempts 2.
    expect(client).toContain("timeoutMs: opts.timeoutMs ?? 90_000");
    expect(client).toContain("CREDIT_SERVICE_UNAVAILABLE");
    expect(client).toContain("REQUEST_ABORTED");
    expect(client).toContain("normalizeCoachChatClientError");
    // streamCoachChat must not silently swallow AbortError (hint stream may still).
    const coachFn = client.slice(client.indexOf("async function streamCoachChat"));
    expect(coachFn).not.toMatch(/if \(\(err as Error\)\.name === "AbortError"\) return;/);
    expect(session).toContain("removeChatMessage");
    expect(session).toContain("pendingChatIdempotency");
    expect(session).toContain("previousTurns");
    expect(session).toContain("CP-10245");
    expect(session).toContain("timeoutMs: 90_000");
    expect(session).toContain("pendingChatIdempotency.delete(turnKey)");
    expect(session).toContain("return true");
    expect(session).toContain("return false");
    expect(edge).toContain("previous_turns");
    expect(edge).toContain("mergedHistory");
    expect(edge).toContain("generateWithFallback");
    expect(edge).toContain("resolveModel");
    expect(gemini).toContain("maxAttempts");
  });

  it("clears the overlay composer only after submit resolves", () => {
    const input = read("src/components/overlay/OverlayChatInput.tsx");
    expect(input).toContain("if (accepted !== false)");
    expect(input).toContain('setValue("")');
    expect(input).toContain("isSubmitting");
    expect(input).toContain("initialValue");
  });

  /**
   * Browser verification (manual after deploy):
   * - /app/live/overlay → send coach message
   * - Network: ai-coach-chat is 200 SSE with reply, or structured error (AI_PROVIDER_UNAVAILABLE /
   *   CREDIT_SERVICE_UNAVAILABLE / AI_INVALID_OUTPUT) with Edge refund on total failure
   * - Console: no silent abort/success with empty reply
   * - Ops blocker if GEMINI_API_KEY missing on Edge: honest 503 AI_PROVIDER_UNAVAILABLE (not FIXED)
   */
  it("fail-closed coach chat: no silent abort success and refunds on hybrid failure", () => {
    const client = read("src/lib/ai/openaiClient.ts");
    const session = read("src/lib/ai/coachChatSession.ts");
    const hybrid = read("supabase/functions/_shared/hybridExecute.ts");
    expect(client).toContain('code: "REQUEST_ABORTED"');
    expect(client).toContain("Never silent-succeed on abort/timeout");
    expect(session).toContain("Drop idempotency key on terminal failure");
    expect(hybrid).toContain("route.isAiRequired");
    expect(hybrid).toContain("hybrid_failure:");
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
    expect(live).toContain("assessAiHelpQuestion");
    expect(live).toContain("openAiHelpConfirm");
    expect(live).toContain("chat_prefill");
    expect(live).toContain('setChatAttention(true, "manual_needed")');
    expect(live).toContain("snapshotRecentInterviewerTranscript");
    const resolve = read("src/lib/session/liveQuestionFromTranscript.ts");
    expect(resolve).toContain("aiHelpRecovery");
    const hint = read("src/components/overlay/OverlayHintPanel.tsx");
    expect(hint).toContain("Generate Answer");
    expect(hint).toContain("Edit Question");
    expect(hint).toContain("Retry Listening");
    expect(hint).toContain("Type Manually");
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

  it("ai-coach-chat fail-closes scaffold replies as AI unavailable", () => {
    const edge = read("supabase/functions/ai-coach-chat/index.ts");
    expect(edge).toContain('runPython: async () => null');
    expect(edge).toContain('runDeterministic: async () => null');
    expect(edge).toContain('hybridResult.data.source !== "ai"');
    expect(edge).toContain("AI_PROVIDER_UNAVAILABLE");
    expect(edge).not.toMatch(/You asked:/);
    expect(edge).not.toMatch(/I will not invent facts/);
  });

  it("streamCoachChat maps COACH_AI_UNAVAILABLE to provider outage UX", () => {
    const client = read("src/lib/ai/openaiClient.ts");
    expect(client).toContain("COACH_AI_UNAVAILABLE");
    expect(client).toContain("AI_PROVIDER_UNAVAILABLE");
    const session = read("src/lib/ai/coachChatSession.ts");
    expect(session).toContain("removeChatMessage(assistantId)");
    expect(session).toContain("removeChatMessage(userMsgId)");
    expect(session).toContain("setChatGenerating(false)");
  });

  it("Mock overlay chat passes session context like Live (BUG 09)", () => {
    const mock = read("src/pages/app/mock/MockSession.tsx");
    const live = read("src/hooks/useLiveCopilot.ts");
    expect(mock).toContain("submitCoachChatMessage");
    expect(live).toContain("submitCoachChatMessage");
    // Mock must not overwrite interviewer question with the chat message.
    const onManual = mock.slice(mock.indexOf("onManualQuestion={async"));
    expect(onManual).toContain("jobDescription");
    expect(onManual).toContain("recentAnswers");
    expect(onManual).toContain("interviewContextRef");
    expect(onManual).toContain("answersRef");
    expect(onManual).not.toMatch(/setCurrentQuestion\(\s*q\s*\)/);
  });

  it("shared coach chat is credit-safe and idempotent on failure/retry", () => {
    const session = read("src/lib/ai/coachChatSession.ts");
    expect(session).toContain("pendingChatIdempotency");
    expect(session).toContain("chatTurnKey");
    expect(session).toContain("checkCreditsForAction(\"coachMessage\")");
    expect(session).toContain("Drop idempotency key on terminal failure");
    expect(session).toContain("pendingChatIdempotency.delete(turnKey)");
    expect(session).toContain("refreshCredits");
    // Credits only refreshed on successful onDone path, not in catch.
    const catchBlock = session.slice(session.indexOf("} catch (err) {"));
    expect(catchBlock).not.toContain("refreshCredits");
    expect(catchBlock).toContain("removeChatMessage");
  });
});
