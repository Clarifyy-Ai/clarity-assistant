import { describe, expect, it, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CookieConsent } from "@/components/common/CookieConsent";
import { COOKIE_CONSENT_KEY, getCookieConsent } from "@/lib/privacy/cookieConsent";

describe("CookieConsent", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows the security information modal immediately when consent is missing", () => {
    render(<CookieConsent />);
    expect(screen.getByRole("dialog", { name: /cookie notice/i })).toBeInTheDocument();
    expect(screen.getByText(/Privacy & Security Notice/i)).toBeInTheDocument();
    expect(screen.getByText(/Practice and rehearsal only/i)).toBeInTheDocument();
  });

  it("does not show when consent was already recorded", () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, "accepted");
    render(<CookieConsent />);
    expect(screen.queryByRole("dialog", { name: /cookie notice/i })).not.toBeInTheDocument();
  });

  it("persists accept choice and closes the modal", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /Accept All/i }));
    expect(getCookieConsent()).toBe("accepted");
    expect(screen.queryByRole("dialog", { name: /cookie notice/i })).not.toBeInTheDocument();
  });

  it("persists decline choice and closes the modal", () => {
    render(<CookieConsent />);
    fireEvent.click(screen.getByRole("button", { name: /Decline optional cookies/i }));
    expect(getCookieConsent()).toBe("declined");
    expect(screen.queryByRole("dialog", { name: /cookie notice/i })).not.toBeInTheDocument();
  });
});
