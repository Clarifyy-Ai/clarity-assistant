import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrandSplash } from "@/components/brand/BrandSplash";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { SPLASH_MESSAGES } from "@/lib/splash/splashCopy";

const motionState = { reduced: false };

vi.mock("@/hooks/usePrefersReducedMotion", () => ({
  usePrefersReducedMotion: () => motionState.reduced,
}));

describe("BrandSplash", () => {
  it("exposes polite status text while loading", () => {
    motionState.reduced = false;
    render(<BrandSplash statusMessage={SPLASH_MESSAGES.default} />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("data-splash-motion", "full");
    expect(screen.getByText(PRODUCT_NAMES.tagline)).toBeInTheDocument();
    expect(status.querySelector(".brand-splash-sweep")).not.toBeNull();
  });

  it("shows focusable retry, login, and public actions when stuck", async () => {
    motionState.reduced = false;
    const onRetry = vi.fn();
    const user = userEvent.setup();

    render(
      <BrandSplash
        statusMessage={SPLASH_MESSAGES.default}
        stuck
        onRetry={onRetry}
        loginHref="/login?returnTo=%2Fapp%2Fdashboard"
        showContinueToWebsite
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveAttribute("aria-live", "assertive");
    expect(alert).toHaveAttribute("data-splash-motion", "calm");

    const retry = screen.getByRole("button", { name: /try again/i });
    await user.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(1);

    const login = screen.getByRole("link", { name: /go to login/i });
    expect(login).toHaveAttribute("href", "/login?returnTo=%2Fapp%2Fdashboard");
    login.focus();
    expect(login).toHaveFocus();

    expect(screen.getByRole("link", { name: /continue to website/i })).toHaveAttribute(
      "href",
      "/",
    );
  });

  it("drops the logo sweep when reduced motion is preferred", () => {
    motionState.reduced = true;
    const { container } = render(
      <BrandSplash statusMessage={SPLASH_MESSAGES.default} />,
    );

    const root = container.querySelector(".brand-splash");
    expect(root).toHaveAttribute("data-splash-motion", "reduced");
    expect(container.querySelector(".brand-splash-sweep")).toBeNull();
  });
});
