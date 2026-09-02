import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OAuthProviderSection } from "@/components/auth/OAuthProviderSection";

const readinessState = {
  availability: { google: "unavailable" as const },
  availableProviders: [] as const,
  misconfiguredProviders: ["google"] as const,
  checking: false,
  hasConfiguredProviders: true,
};

vi.mock("@/hooks/useOAuthReadiness", () => ({
  useOAuthReadiness: () => readinessState,
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      signInWithOAuth: vi.fn(),
    }),
}));

describe("OAuthProviderSection", () => {
  it("shows not-configured copy instead of a broken Google CTA", () => {
    readinessState.availability = { google: "unavailable" };
    readinessState.availableProviders = [];
    readinessState.misconfiguredProviders = ["google"];
    readinessState.checking = false;
    readinessState.hasConfiguredProviders = true;

    render(
      <MemoryRouter>
        <OAuthProviderSection dividerLabel="or sign in with email" />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("oauth-not-configured")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /continue with google/i })).not.toBeInTheDocument();
    expect(screen.getByText(/not configured/i)).toBeInTheDocument();
  });

  it("renders provider buttons when preflight passes", () => {
    readinessState.availability = { google: "available" };
    readinessState.availableProviders = ["google"];
    readinessState.misconfiguredProviders = [];
    readinessState.checking = false;
    readinessState.hasConfiguredProviders = true;

    render(
      <MemoryRouter>
        <OAuthProviderSection dividerLabel="or sign in with email" />
      </MemoryRouter>,
    );

    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByText(/or sign in with email/i)).toBeInTheDocument();
  });
});
