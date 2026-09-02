import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { GovPaperReviewGenerationTimer } from "@/components/gov-exam/GovPaperReviewGenerationTimer";
import {
  beginGenerationSession,
  failGenerationSession,
  initialGenerationSession,
} from "@/lib/gov-exam/govPaperReviewSession";

describe("GovPaperReviewGenerationTimer", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing on first render without an active generation session", () => {
    const { container } = render(
      <GovPaperReviewGenerationTimer session={initialGenerationSession()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders elapsed label only when generation session is active", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:01:05.000Z"));
    const jobId = "11111111-1111-1111-1111-111111111111";
    const session = beginGenerationSession(jobId, {
      nowMs: new Date("2026-01-01T00:01:00.000Z").getTime(),
    });
    render(<GovPaperReviewGenerationTimer session={session} />);
    expect(screen.getByText(/Generating for 0:05/i)).toBeInTheDocument();
  });

  it("does not throw after worker failure clears timer metadata", () => {
    const jobId = "11111111-1111-1111-1111-111111111111";
    const failed = failGenerationSession(
      beginGenerationSession(jobId, { nowMs: Date.now() }),
      jobId,
      { errorCode: "WORKER_UNAVAILABLE", retryable: true },
    );
    const { container } = render(<GovPaperReviewGenerationTimer session={failed} />);
    expect(container).toBeEmptyDOMElement();
  });
});
