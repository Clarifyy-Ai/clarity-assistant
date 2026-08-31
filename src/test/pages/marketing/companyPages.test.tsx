import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import About from "@/pages/marketing/About";
import Industries from "@/pages/marketing/Industries";
import Cookies from "@/pages/marketing/Cookies";
import Faq from "@/pages/marketing/Faq";

vi.mock("@/components/layout/MarketingLayout", () => ({
  MarketingLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

function renderPage(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("TC-PUB-014 marketing company pages", () => {
  it("renders About without invented metrics", () => {
    renderPage(<About />);
    expect(screen.getByRole("heading", { name: "About", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/Payara Labs/)).toBeInTheDocument();
    expect(screen.queryByText(/our team of \d+/i)).not.toBeInTheDocument();
  });

  it("renders Industries without customer logos", () => {
    renderPage(<Industries />);
    expect(screen.getByRole("heading", { name: "Industries", level: 1 })).toBeInTheDocument();
    expect(screen.getByText(/government and entrance exams/i)).toBeInTheDocument();
    expect(screen.getByText(/do not publish customer names or logos/i)).toBeInTheDocument();
  });

  it("renders Cookies with Privacy Policy and telemetry vendors", () => {
    renderPage(<Cookies />);
    expect(screen.getByRole("heading", { name: "Cookies", level: 1 })).toBeInTheDocument();
    const privacyLinks = screen.getAllByRole("link", { name: "Privacy Policy" });
    expect(privacyLinks.length).toBeGreaterThan(0);
    expect(privacyLinks.every((el) => el.getAttribute("href") === "/privacy")).toBe(true);
    expect(screen.getAllByText(/PostHog/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Sentry/).length).toBeGreaterThan(0);
  });

  it("renders FAQ with product topics and Help Center link", () => {
    renderPage(<Faq />);
    expect(screen.getByRole("heading", { name: "FAQ", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("How do credits work?")).toBeInTheDocument();
    expect(screen.getByText("How does Practice Coach work?")).toBeInTheDocument();
    expect(screen.getByText("What government exams can I practice?")).toBeInTheDocument();
    expect(screen.getByText("How much do paid plans cost?")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Help Center" }).length).toBeGreaterThan(0);
  });
});
