import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildScorecardPdf, exportScorecardPdf } from "@/lib/export/scorecardPdf";
import type { Scorecard } from "@/types/scorecard.types";

const SCORECARD: Scorecard = {
  id: "sc1",
  session_id: "sess-abcdef12-3456",
  user_id: "u1",
  overall_score: 72,
  confidence_score: 70,
  clarity_score: 71,
  structure_score: 73,
  relevance_score: 74,
  question_scores: [
    {
      question_id: "q1",
      question_text: "Tell me about a challenge.",
      order_index: 0,
      score: 70,
      confidence_score: 70,
      star_used: true,
      key_strength: "Clear situation",
      key_weakness: "Thin result",
      coach_tip: "Quantify impact",
    },
  ],
  filler_count: 2,
  filler_rate: 0.05,
  top_filler_words: [{ word: "um", count: 2 }],
  wpm_avg: 120,
  wpm_trend: "stable",
  strengths: ["Clear structure"],
  improvements: ["Add metrics"],
  coach_note: "Solid practice session.",
  star_adherence: 60,
  is_shared: false,
  share_token: null,
  pdf_url: null,
  generated_at: "2026-09-01T00:00:00.000Z",
  evaluation_status: "completed",
  eligibility_reason: null,
  question_count: 1,
  answer_count: 1,
  evaluated_answer_count: 1,
  rubric_version: "scorecard_v2",
  attempt_count: 1,
  last_error_code: null,
};

function pdfMagic(bytes: ArrayBuffer): string {
  return new TextDecoder().decode(bytes.slice(0, 5));
}

describe("buildScorecardPdf / exportScorecardPdf", () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let click: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => "blob:scorecard-pdf");
    revokeObjectURL = vi.fn();
    click = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    const origCreate = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
      const el = origCreate(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: click });
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("produces real PDF bytes and a .pdf filename (never JSON)", () => {
    const result = buildScorecardPdf(SCORECARD, { sessionIdHint: SCORECARD.session_id });
    expect(result.mimeType).toBe("application/pdf");
    expect(result.filename).toMatch(/scorecard-.*\.pdf$/i);
    expect(result.filename.endsWith(".pdf")).toBe(true);
    expect(result.filename.endsWith(".json")).toBe(false);
    expect(pdfMagic(result.bytes)).toBe("%PDF-");
    expect(result.mimeType).not.toBe("application/json");
  });

  it("exportScorecardPdf downloads application/pdf via Blob", () => {
    const result = exportScorecardPdf(SCORECARD);
    expect(result.mimeType).toBe("application/pdf");
    expect(pdfMagic(result.bytes)).toBe("%PDF-");
    expect(createObjectURL).toHaveBeenCalled();
    const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/pdf");
    expect(click).toHaveBeenCalled();
  });
});
