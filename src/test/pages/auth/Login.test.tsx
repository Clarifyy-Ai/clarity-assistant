import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import Login from "@/pages/auth/Login";

const signInWithEmail = vi.fn();

vi.mock("@/hooks/usePageMeta", () => ({
  usePageMeta: vi.fn(),
}));

vi.mock("@/store/authStore", () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      status: "idle",
      user: null,
      isAdmin: false,
      isProfileLoaded: false,
      signInWithEmail,
      error: null,
    }),
}));

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: vi.fn().mockResolvedValue({
          data: { currentLevel: "aal1", nextLevel: "aal1" },
          error: null,
        }),
      },
    },
  },
}));

function getEmailInput(): HTMLElement {
  return document.querySelector('input[name="email"]') as HTMLElement;
}

function getPasswordInput(): HTMLElement {
  return document.querySelector('input[name="password"]') as HTMLElement;
}

function renderLogin(): ReturnType<typeof render> {
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <Login />
    </MemoryRouter>,
  );
}

describe("Login form validation — TC-AUTH-004", () => {
  beforeEach(() => {
    signInWithEmail.mockReset();
    signInWithEmail.mockResolvedValue(undefined);
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "none");
  });

  it("keeps Sign in enabled with empty fields so submit can surface errors", () => {
    renderLogin();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  });

  it("shows email required when email is empty on submit", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(getPasswordInput(), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("shows password required when password is empty on submit", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), "user@example.com");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Password is required.")).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("shows both field errors when both are empty", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("shows invalid email format error", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), "not-an-email");
    await user.type(getPasswordInput(), "secret");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(
      await screen.findByText("Enter a valid email address."),
    ).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("rejects whitespace-only values", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), "   ");
    await user.type(getPasswordInput(), "   ");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(screen.getByText("Password is required.")).toBeInTheDocument();
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  it("focuses the first invalid field on submit", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("Email is required.")).toBeInTheDocument();
    expect(getEmailInput()).toHaveFocus();
  });

  it("submits valid credentials without client-side errors", async () => {
    const user = userEvent.setup();
    renderLogin();

    await user.type(getEmailInput(), "User@Example.com");
    await user.type(getPasswordInput(), "valid-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(signInWithEmail).toHaveBeenCalledWith(
      "user@example.com",
      "valid-password",
    );
    expect(screen.queryByText("Email is required.")).not.toBeInTheDocument();
    expect(screen.queryByText("Password is required.")).not.toBeInTheDocument();
  });
});

describe("Login failure copy — BUG-015 / TC-AUTH-002", () => {
  beforeEach(() => {
    signInWithEmail.mockReset();
    vi.stubEnv("VITE_OAUTH_PROVIDERS", "none");
    window.localStorage.clear();
  });

  it("shows the same safe message for invalid email and invalid password", async () => {
    const user = userEvent.setup();
    const leakyUnknownEmail = Object.assign(new Error("password token invalid"), {
      code: "otp_expired",
      status: 400,
    });
    const leakyWrongPassword = Object.assign(new Error("invalid_grant"), {
      code: "invalid_grant",
      status: 401,
    });

    signInWithEmail.mockRejectedValueOnce(leakyUnknownEmail);
    const first = renderLogin();
    await user.type(getEmailInput(), "missing@example.com");
    await user.type(getPasswordInput(), "any-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const firstAlert = await screen.findByRole("alert");
    expect(firstAlert).toHaveTextContent(/Incorrect email or password/i);
    expect(firstAlert).not.toHaveTextContent(/token|jwt|invalid_grant|supabase/i);
    first.unmount();

    signInWithEmail.mockRejectedValueOnce(leakyWrongPassword);
    renderLogin();
    await user.type(getEmailInput(), "user@example.com");
    await user.type(getPasswordInput(), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    const secondAlert = await screen.findByRole("alert");
    expect(secondAlert).toHaveTextContent(/Incorrect email or password/i);
    expect(secondAlert).not.toHaveTextContent(/token|jwt|invalid_grant|supabase/i);
  });

  it("sanitizes leaky error_description query params and stays on login", async () => {
    render(
      <MemoryRouter
        initialEntries={[
          "/login?error=access_denied&error_description=password%20token%20invalid",
        ]}
      >
        <Login />
      </MemoryRouter>,
    );

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incorrect email or password.");
    expect(alert).not.toHaveTextContent(/token/i);
    expect(screen.getByRole("button", { name: "Sign in" })).toBeVisible();
  });
});
