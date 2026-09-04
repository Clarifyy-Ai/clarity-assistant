import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { OAuthProviderSection } from "@/components/auth/OAuthProviderSection";

const readinessState = {
  availability: { google: "unavailable" as const },
  availableProviders: [] as string[],
  misconfiguredProviders: ["google"] as string[],
  checking: false,
  hasConfiguredProviders: true,
};

vi.mock("@/hooks/useOAuthReadiness", () => ({
  useOAuthReadiness: () => readinessState,
}));

vi.mock("@/lib/auth/oauthProviders", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/oauthProviders")>();
  return {
    ...actual,
    getEnabledOAuthProviders: () => ["google"] as const,
  };
});

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      signInWithOAuth: vi.fn(),
    }),
}));

describe("OAuthProviderSection", () => {
  it("keeps Continue with Google visible when preflight flags misconfigured", () => {
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

    expect(screen.getByRole("button", { name: /continue with google/i })).toBeInTheDocument();
    expect(screen.getByTestId("oauth-not-configured")).toBeInTheDocument();
    expect(screen.getByText(/or sign in with email/i)).toBeInTheDocument();
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
