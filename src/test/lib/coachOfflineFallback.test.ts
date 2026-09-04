import { describe, it, expect, beforeEach } from "vitest";
import {
  classifyCoachQuestion,
  buildOfflineCategoryHint,
  coachClassToStructureMode,
  coachClassToTemplateType,
} from "@/lib/ai/coachQuestionClassify";
import { composeHint, stripMarkdownEmphasis, splitInlineRich } from "@/lib/overlay/overlayCompositor";
import { structureForMode } from "@/lib/overlay/responseFormatters";
import { sanitizeMarkdownText } from "@/lib/security/sanitizer";
import { routeHint } from "@/lib/ai/modelRouter";
import { useNetworkStore } from "@/store/networkStore";
import { useOverlayStore } from "@/store/overlayStore";
import {
  beginOverlayProductSession,
  markOverlayProductSessionActive,
  markOverlayProductSessionReady,
  teardownOverlayProductSession,
} from "@/lib/session/overlayProductSession";
import { useOverlaySessionAuthorityStore } from "@/store/overlaySessionAuthorityStore";

describe("classifyCoachQuestion", () => {
  it("classifies SQL / DB conceptual questions as technical", () => {
    expect(
      classifyCoachQuestion(
        "What is the difference between INNER JOIN and LEFT JOIN in SQL?",
        "behavioural",
      ),
    ).toBe("technical");
    expect(classifyCoachQuestion("Explain database normalization", "mixed")).toBe("technical");
  });

  it("classifies behavioral questions as behavioural even in technical sessions", () => {
    expect(
      classifyCoachQuestion(
        "Tell me about a time you handled conflict on a team",
        "technical",
      ),
    ).toBe("behavioural");
  });

  it("classifies coding algorithm questions as coding", () => {
    expect(
      classifyCoachQuestion(
        "Write a function to reverse a linked list and state time complexity",
        "behavioural",
      ),
    ).toBe("coding");
  });

  it("classifies system design questions", () => {
    expect(
      classifyCoachQuestion(
        "How would you design a URL shortener that scales to millions of users?",
        "hr",
      ),
    ).toBe("system_design");
  });

  it("falls back to session prior when ambiguous", () => {
    expect(classifyCoachQuestion("Walk me through your approach", "coding")).toBe("coding");
    expect(classifyCoachQuestion("Walk me through your approach", "behavioural")).toBe(
      "behavioural",
    );
  });

  it("maps classes to structure modes and template keys", () => {
    expect(coachClassToStructureMode("technical")).toBe("technical");
    expect(coachClassToStructureMode("coding")).toBe("coding");
    expect(coachClassToStructureMode("behavioural")).toBe("star");
    expect(coachClassToTemplateType("coding")).toBe("coding");
  });
});

describe("buildOfflineCategoryHint", () => {
  it("uses technical framework for SQL even when session is behavioural", () => {
    const built = buildOfflineCategoryHint({
      question: "What is an index in SQL and when would you use one?",
      sessionType: "behavioural",
      hintStyle: "full_answer",
      resumeTalkingPoints: {
        intro: "I am a PM",
        skills_summary: "STAR tips",
        project_highlights: ["Led a project"],
        experience_points: ["Managed stakeholders"],
        education_line: null,
        interview_tips: ["Use STAR"],
      },
    });
    expect(built.questionClass).toBe("technical");
    expect(built.categoryLabel).toMatch(/Technical/i);
    expect(built.text.toLowerCase()).toContain("technical");
    expect(built.text.toLowerCase()).not.toContain("star framework");
  });

  it("uses STAR structure for behavioral questions", () => {
    const built = buildOfflineCategoryHint({
      question: "Tell me about a time you failed and what you learned",
      sessionType: "technical",
      hintStyle: "short_hints",
    });
    expect(built.questionClass).toBe("behavioural");
    expect(built.text.toLowerCase()).toContain("star");
  });

  it("uses coding framework for coding questions", () => {
    const built = buildOfflineCategoryHint({
      question: "Implement a binary search and discuss complexity",
      sessionType: "mixed",
      hintStyle: "full_answer",
    });
    expect(built.questionClass).toBe("coding");
    expect(built.text.toLowerCase()).toContain("coding");
  });

  it("uses system-design offline template for design questions", () => {
    const built = buildOfflineCategoryHint({
      question: "Design a system for real-time chat with CDN and sharding",
      sessionType: "behavioural",
      hintStyle: "full_answer",
    });
    expect(built.questionClass).toBe("system_design");
    expect(built.text.toLowerCase()).toMatch(/system design|requirements|trade-off/);
  });
});

describe("composeHint markdown emphasis", () => {
  it("strips ** from numbered and bullet lines", () => {
    const text = structureForMode("technical", "What is a JOIN in SQL?");
    const composed = composeHint(text, "full_answer");
    const joined = composed.lines.map((l) => l.content).join("\n");
    expect(joined).not.toMatch(/\*\*/);
    expect(joined).toContain("Definition");
    expect(joined).not.toContain("**Definition**");
  });

  it("strips italics and malformed emphasis safely", () => {
    expect(stripMarkdownEmphasis("_italic phrase_")).toBe("italic phrase");
    expect(stripMarkdownEmphasis("**bold** and more")).toBe("bold and more");
    expect(stripMarkdownEmphasis("broken **bold")).not.toContain("**");
  });

  it("preserves inline code while stripping emphasis", () => {
    const composed = composeHint("Use `SELECT *` with **care**", "full_answer");
    expect(composed.lines[0]?.content).toContain("`SELECT *`");
    expect(composed.lines[0]?.content).not.toContain("**");
    expect(composed.lines[0]?.parts?.some((p) => p.isCode && p.text === "SELECT *")).toBe(
      true,
    );
  });

  it("splitInlineRich yields bold segments without raw markers", () => {
    const parts = splitInlineRich("1. **Definition** — clarify");
    const bold = parts.find((p) => p.bold);
    expect(bold?.text).toBe("Definition");
    expect(parts.every((p) => !p.text.includes("**"))).toBe(true);
  });

  it("sanitizes XSS-like HTML from fallback text", () => {
    const dirty = "Hello <script>alert(1)</script> **World**";
    const clean = sanitizeMarkdownText(dirty);
    expect(clean.toLowerCase()).not.toContain("<script");
    expect(clean).toContain("Hello");
  });
});

describe("routeHint offline / AI-unavailable category fallback", () => {
  beforeEach(() => {
    const gen = useOverlaySessionAuthorityStore.getState().generation;
    if (gen > 0) {
      useOverlaySessionAuthorityStore.getState().markTerminal(gen, "RESET");
      teardownOverlayProductSession(gen);
    }
    const { generation } = beginOverlayProductSession({
      mode: "live",
      sessionId: "sess-offline-1",
    });
    markOverlayProductSessionReady(generation);
    markOverlayProductSessionActive(generation);

    useOverlayStore.setState({
      current_hint: "",
      hint_state: "idle",
      offline_fallback_category: null,
      offline_fallback_reason: null,
      error_message: null,
      resume_talking_points: null,
      hint_style: "full_answer",
      session_pipeline_state: "listening",
    } as never);
    useNetworkStore.setState({ mode: "offline" } as never);
  });

  it("offline path: SQL question in behavioural session → technical framework", async () => {
    await routeHint({
      question: "Explain ACID properties in databases",
      context: {
        hint_style: "full_answer",
      } as never,
      preferredModel: "gemini-flash",
      interviewType: "behavioural",
      isLive: true,
      sessionId: "sess-1",
      questionId: "q-1",
      onChunk: () => {},
      onDone: () => {},
      onError: () => {},
    });

    const state = useOverlayStore.getState();
    expect(state.hint_state).toBe("offline_fallback");
    expect(state.offline_fallback_category).toMatch(/Technical/i);
    expect(state.current_hint.toLowerCase()).toContain("technical");
    expect(state.current_hint.toLowerCase()).not.toContain("star framework");
  });

  it("AI unavailable: still category-correct and not silent offline", () => {
    const built = buildOfflineCategoryHint({
      question: "Write a function to flatten a nested array",
      sessionType: "behavioural",
      hintStyle: "full_answer",
    });
    useOverlayStore.getState().setOfflineFallback(built.text, {
      categoryLabel: built.categoryLabel,
      reason: "ai_unavailable",
      errorMessage: "provider down",
    });

    const state = useOverlayStore.getState();
    expect(state.hint_state).toBe("error");
    expect(state.error_message).toMatch(/provider down/i);
    expect(state.offline_fallback_reason).toBe("ai_unavailable");
    expect(state.offline_fallback_category).toMatch(/Coding/i);
    expect(state.current_hint.toLowerCase()).toContain("coding");
  });
});
