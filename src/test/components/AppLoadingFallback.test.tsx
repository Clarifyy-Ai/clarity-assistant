import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AppLoadingFallback,
  STUCK_TIMEOUT_MS,
} from "@/components/layout/AppLoadingFallback";
import { SPLASH_MESSAGES } from "@/lib/splash/splashCopy";

const retryAccountLoad = vi.fn().mockResolvedValue(true);

vi.mock("@/store/authStore", () => ({
  useAuthStore: Object.assign(
    (selector: (state: { user: null }) => unknown) =>
      selector({ user: null }),
    {
      getState: () => ({ retryAccountLoad }),
    },
  ),
}));

describe("AppLoadingFallback", () => {
  beforeEach(() => {
    retryAccountLoad.mockClear();
    vi.useFakeTimers();
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: true,
    });
  });

  afterEach(() => {
    cleanup();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("shows documents copy for a documents deep link", () => {
    render(
      <MemoryRouter initialEntries={["/app/documents"]}>
        <AppLoadingFallback />
      </MemoryRouter>,
    );

    expect(screen.getByText(SPLASH_MESSAGES.documents)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /try again/i })).not.toBeInTheDocument();
  });

  it("surfaces stuck recovery after 22s and retries account load", () => {
    render(
      <MemoryRouter initialEntries={["/app/dashboard"]}>
        <AppLoadingFallback />
      </MemoryRouter>,
    );

    act(() => {
      vi.advanceTimersByTime(STUCK_TIMEOUT_MS);
    });

    expect(screen.getByRole("alert")).toHaveTextContent(/taking longer than expected/i);
    expect(screen.getByRole("link", { name: /go to login/i })).toHaveAttribute(
      "href",
      expect.stringContaining("returnTo=%2Fapp%2Fdashboard"),
    );
    expect(screen.getByRole("link", { name: /continue to website/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(retryAccountLoad).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("clears the stuck timer on unmount", () => {
    const clearSpy = vi.spyOn(window, "clearTimeout");
    const { unmount } = render(
      <MemoryRouter>
        <AppLoadingFallback />
      </MemoryRouter>,
    );

    unmount();
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });

  it("shows the offline message without a loading bar", () => {
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      value: false,
    });

    const { container } = render(
      <MemoryRouter>
        <AppLoadingFallback />
      </MemoryRouter>,
    );

    expect(screen.getByText(SPLASH_MESSAGES.offline)).toBeInTheDocument();
    expect(container.querySelector(".brand-splash-bar")).toBeNull();
    expect(screen.getByRole("button", { name: /try again/i })).toBeInTheDocument();
  });
});
