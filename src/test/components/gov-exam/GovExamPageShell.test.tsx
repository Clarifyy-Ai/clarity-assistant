import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { GovExamPageShell } from "@/components/gov-exam/GovExamPageShell";
import { useAuthStore } from "@/store/authStore";

describe("GovExamPageShell", () => {
  it("shows route state for temporary backend failure", () => {
    useAuthStore.setState({
      status: "authenticated",
      user: { id: "u1", email_confirmed_at: "2026-01-01" } as never,
      profile: { onboarding_completed: true } as never,
      isProfileLoaded: true,
    });

    render(
      <MemoryRouter initialEntries={["/app/mock-test/generate"]}>
        <GovExamPageShell
          loadResolution={{
            phase: "TEMPORARY_BACKEND_FAILURE",
            message: "Rate limited — retry shortly.",
            retryable: true,
          }}
          onRetry={() => undefined}
        >
          <div>Child content</div>
        </GovExamPageShell>
      </MemoryRouter>,
    );

    expect(screen.getByText(/Temporary failure/i)).toBeInTheDocument();
    expect(screen.getByText(/Rate limited/i)).toBeInTheDocument();
    expect(screen.queryByText("Child content")).not.toBeInTheDocument();
  });
});
