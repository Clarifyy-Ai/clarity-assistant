import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  DebriefConfidenceBreakdown,
  DebriefSessionMeta,
  DebriefShareButton,
} from "@/components/debrief/DebriefAnalyticsPanels";
import {
  resolveDebriefCategoryScores,
  scorecardDimensionValues,
} from "@/types/scorecard.types";

vi.mock("@/store/userStore", () => ({
  useAuthStore: (selector: (state: { profile: { privacy_prefs: { allow_scorecard_sharing: boolean } } }) => unknown) =>
    selector({
      profile: {
        privacy_prefs: { allow_scorecard_sharing: true },
      },
    }),
}));

vi.mock("@/lib/privacy/privacyPrefs", () => ({
  canShareScorecard: () => true,
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("scorecardDimensionValues", () => {
  it("maps mapped Scorecard fields to panel dimension keys", () => {
    expect(
      scorecardDimensionValues({
        clarity_score: 88,
        confidence_score: 90,
        relevance_score: 84,
        structure_score: 86,
      }),
    ).toEqual({
      communication: 88,
      confidence: 90,
      technical: 84,
      problem_solving: 86,
    });
  });

  it("falls back to legacy DB columns when mapped fields are absent", () => {
    expect(
      scorecardDimensionValues({
        communication: 80,
        confidence: 81,
        technical: 78,
        problem_solving: 76,
      }),
    ).toEqual({
      communication: 80,
      confidence: 81,
      technical: 78,
      problem_solving: 76,
    });
  });
});

describe("resolveDebriefCategoryScores", () => {
  it("prefers mapped scorecard values over AI category_scores", () => {
    expect(
      resolveDebriefCategoryScores({
        scorecard: {
          clarity_score: 88,
          confidence_score: 90,
          relevance_score: 84,
          structure_score: 86,
        },
        session: null,
        reportCategoryScores: {
          communication: 40,
          confidence: 41,
          technical: 42,
          problem_solving: 43,
        },
      }),
    ).toEqual({
      communication: 88,
      confidence: 90,
      technical: 84,
      problem_solving: 86,
    });
  });
});

describe("DebriefSessionMeta", () => {
  it("renders mapped scorecard dimensions instead of empty breakdown", () => {
    render(
      <DebriefSessionMeta
        session={{ overall_score: 82, clarity_score: 70 }}
        debrief={{ created_at: "2026-08-01T00:00:00.000Z" }}
        scorecard={{
          overall_score: 82,
          clarity_score: 88,
          confidence_score: 90,
          relevance_score: 84,
          structure_score: 86,
        }}
      />,
    );

    expect(screen.getByText("Score by category")).toBeInTheDocument();
    expect(screen.getByText("88")).toBeInTheDocument();
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("84")).toBeInTheDocument();
    expect(screen.getByText("86")).toBeInTheDocument();
    expect(
      screen.queryByText(/may show as zero/i),
    ).not.toBeInTheDocument();
  });

  it("shows unavailable copy when scorecard and overall score are missing", () => {
    render(
      <DebriefSessionMeta
        session={null}
        debrief={{ created_at: "2026-08-01T00:00:00.000Z" }}
        scorecard={null}
      />,
    );

    expect(
      screen.getByText(/Scoring data is not available yet/i),
    ).toBeInTheDocument();
  });
});

describe("DebriefConfidenceBreakdown", () => {
  it("shows dimension values from mapped scorecard fields", () => {
    render(
      <DebriefConfidenceBreakdown
        scorecard={{
          clarity_score: 77,
          confidence_score: 79,
          relevance_score: 73,
          structure_score: 75,
        }}
        session={null}
      />,
    );

    expect(screen.getByText("77")).toBeInTheDocument();
    expect(screen.getByText("79")).toBeInTheDocument();
    expect(screen.getByText("73")).toBeInTheDocument();
    expect(screen.getByText("75")).toBeInTheDocument();
  });
});

describe("DebriefShareButton", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", {
      getRandomValues: (arr: Uint8Array) => {
        arr.fill(0xab);
        return arr;
      },
    });
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("uses a 128-bit share token and /share/{token} URL", async () => {
    const onShareToken = vi.fn().mockResolvedValue(undefined);

    render(
      <DebriefShareButton
        debriefId="debrief-1"
        report={{}}
        onShareToken={onShareToken}
        previewTitle="Mock Interview"
        previewScore={82}
        previewSummary="Solid session."
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /share link/i }));
    fireEvent.click(screen.getByRole("button", { name: /confirm share/i }));

    await waitFor(() => {
      expect(onShareToken).toHaveBeenCalledWith("abababababababababababababababab");
    });

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringMatching(/\/share\/abababababababababababababababab$/),
    );
  });
});
