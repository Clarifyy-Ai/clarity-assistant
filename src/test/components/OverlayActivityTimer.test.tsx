import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { OverlayActivityTimer } from "@/components/overlay/OverlayActivityTimer";

const sessionState = {
  status: "paused" as string,
  elapsed_seconds: 125,
};

vi.mock("@/store/sessionStore", () => ({
  useSessionStore: (selector: (state: typeof sessionState) => unknown) =>
    selector(sessionState),
}));

describe("OverlayActivityTimer", () => {
  beforeEach(() => {
    sessionState.status = "paused";
    sessionState.elapsed_seconds = 125;
  });

  it("shows frozen elapsed_seconds while paused", () => {
    render(<OverlayActivityTimer />);
    expect(screen.getByTestId("overlay-activity-timer")).toHaveTextContent("02:05");
    expect(screen.getByLabelText(/session time 02:05/i)).toBeInTheDocument();
  });

  it("shows the same elapsed while active", () => {
    sessionState.status = "active";
    sessionState.elapsed_seconds = 65;
    render(<OverlayActivityTimer />);
    expect(screen.getByTestId("overlay-activity-timer")).toHaveTextContent("01:05");
  });

  it("hides when session is idle", () => {
    sessionState.status = "idle";
    sessionState.elapsed_seconds = 125;
    const { container } = render(<OverlayActivityTimer />);
    expect(container).toBeEmptyDOMElement();
  });
});
