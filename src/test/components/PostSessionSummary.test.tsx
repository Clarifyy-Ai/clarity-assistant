import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { PostSessionSummary } from "@/components/session/PostSessionSummary";
import { saveLastSessionSummary } from "@/lib/session/lastSessionSummary";

describe("PostSessionSummary scorecard eval", () => {
  beforeEach(() => {
    saveLastSessionSummary({
      sessionId: "sess-1",
      durationSeconds: 180,
      questionsDetected: 3,
      hintsUsed: 1,
      endedAt: Date.now(),
    });
  });

  it("disables View Scorecard while scoring", () => {
    render(
      <MemoryRouter>
        <PostSessionSummary sessionId="sess-1" onStartNew={() => undefined} scorecardEval="processing" />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("scorecard-scoring")).toHaveTextContent("Scoring");
    expect(screen.getByRole("button", { name: /Scoring/ })).toBeDisabled();
    expect(screen.queryByRole("link", { name: /View Scorecard/i })).not.toBeInTheDocument();
  });

  it("enables View Scorecard only when ready", () => {
    render(
      <MemoryRouter>
        <PostSessionSummary sessionId="sess-1" onStartNew={() => undefined} scorecardEval="ready" />
      </MemoryRouter>,
    );
    const link = screen.getByRole("link", { name: /View Scorecard/i });
    expect(link).toHaveAttribute("href", "/app/scorecard/sess-1");
  });

  it("shows retry when generation failed and does not invent a score", () => {
    const onRetry = vi.fn();
    render(
      <MemoryRouter>
        <PostSessionSummary
          sessionId="sess-1"
          onStartNew={() => undefined}
          scorecardEval="failed"
          onRetryScorecard={onRetry}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText(/Scorecard could not be generated/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /View Scorecard/i })).toBeDisabled();
    expect(screen.queryByText(/%|overall score/i)).not.toBeInTheDocument();
  });
});
