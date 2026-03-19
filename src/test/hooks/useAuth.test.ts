// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// useAuth.test.ts — Unit tests for authentication state, session lifecycle,
// sign-in/out flows, profile loading, and BYOK key management.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor }                        from "@testing-library/react";

// ─── Mock Supabase ────────────────────────────────────────────────────────────

const mockGetSession    = vi.fn();
const mockSignIn        = vi.fn();
const mockSignUp        = vi.fn();
const mockSignOut       = vi.fn();
const mockUpdateUser    = vi.fn();
const mockOnAuthChange  = vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }));
const mockProfileSelect = vi.fn();
const mockProfileUpdate = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      getSession:          mockGetSession,
      signInWithPassword:  mockSignIn,
      signUp:              mockSignUp,
      signOut:             mockSignOut,
      updateUser:          mockUpdateUser,
      onAuthStateChange:   mockOnAuthChange,
      resetPasswordForEmail: vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      select:  vi.fn().mockReturnThis(),
      update:  vi.fn().mockReturnThis(),
      eq:      vi.fn().mockReturnThis(),
      single:  mockProfileSelect,
    })),
  },
}));

// ─── Mock profile data ────────────────────────────────────────────────────────

const MOCK_USER = {
  id:    "user-123",
  email: "test@example.com",
};

const MOCK_SESSION = {
  user:          MOCK_USER,
  access_token:  "tok_abc",
  refresh_token: "ref_abc",
  expires_at:    Date.now() / 1000 + 3600,
  expires_in:    3600,
  token_type:    "bearer",
};

const MOCK_PROFILE = {
  id:                   "user-123",
  email:                "test@example.com",
  full_name:            "Test User",
  plan_id:              "pro",
  credits:              42,
  is_admin:             false,
  onboarding_completed: true,
  preferred_model:      "gpt-4o",
  subscription_status:  "active",
  created_at:           "2026-01-01T00:00:00Z",
  updated_at:           "2026-01-01T00:00:00Z",
};

// ─── Import store after mocks ─────────────────────────────────────────────────

import { useAuthStore } from "@/store/authStore";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetStore() {
  useAuthStore.setState({
    status:          "idle",
    session:         null,
    user:            null,
    profile:         null,
    isProfileLoaded: false,
    byokKeys:        {},
    error:           null,
    isAdmin:         false,
    isOnboarded:     false,
    planId:          "free",
    credits:         0,
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("useAuthStore — initialization", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockProfileSelect.mockResolvedValue({ data: MOCK_PROFILE, error: null });
  });

  it("starts in idle status", () => {
    const { status } = useAuthStore.getState();
    expect(status).toBe("idle");
  });

  it("sets authenticated status when a valid session exists", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: MOCK_SESSION },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().user?.id).toBe("user-123");
  });

  it("sets unauthenticated when no session exists", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().user).toBeNull();
  });

  it("sets error status on getSession failure", async () => {
    mockGetSession.mockResolvedValueOnce({
      data: { session: null },
      error: { message: "Network error" },
    });

    await act(async () => {
      await useAuthStore.getState().initialize();
    });

    expect(useAuthStore.getState().status).toBe("error");
    expect(useAuthStore.getState().error).toBe("Network error");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — sign in", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    mockProfileSelect.mockResolvedValue({ data: MOCK_PROFILE, error: null });
  });

  it("signs in with valid credentials and loads profile", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: MOCK_SESSION, user: MOCK_USER },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().signInWithEmail("test@example.com", "password123");
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("authenticated");
    expect(state.user?.email).toBe("test@example.com");
    expect(state.profile?.plan_id).toBe("pro");
    expect(state.credits).toBe(42);
    expect(state.planId).toBe("pro");
  });

  it("sets error on invalid credentials", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials" },
    });

    await expect(
      act(async () => {
        await useAuthStore.getState().signInWithEmail("bad@example.com", "wrong");
      })
    ).rejects.toBeDefined();

    expect(useAuthStore.getState().status).toBe("error");
    expect(useAuthStore.getState().error).toBe("Invalid login credentials");
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — sign out", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    useAuthStore.setState({
      status:  "authenticated",
      user:    MOCK_USER as never,
      session: MOCK_SESSION as never,
      profile: MOCK_PROFILE as never,
      planId:  "pro",
      credits: 42,
    });
  });

  it("clears all state on sign out", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    const state = useAuthStore.getState();
    expect(state.status).toBe("unauthenticated");
    expect(state.user).toBeNull();
    expect(state.session).toBeNull();
    expect(state.profile).toBeNull();
    expect(state.credits).toBe(0);
    expect(state.byokKeys).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — profile", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
    useAuthStore.setState({ user: MOCK_USER as never, status: "authenticated" });
  });

  it("loads and maps profile fields correctly", async () => {
    mockProfileSelect.mockResolvedValueOnce({ data: MOCK_PROFILE, error: null });

    await act(async () => {
      await useAuthStore.getState().loadProfile();
    });

    const state = useAuthStore.getState();
    expect(state.isProfileLoaded).toBe(true);
    expect(state.planId).toBe("pro");
    expect(state.credits).toBe(42);
    expect(state.isAdmin).toBe(false);
    expect(state.isOnboarded).toBe(true);
  });

  it("marks admin correctly when is_admin is true", async () => {
    mockProfileSelect.mockResolvedValueOnce({
      data: { ...MOCK_PROFILE, is_admin: true },
      error: null,
    });

    await act(async () => {
      await useAuthStore.getState().loadProfile();
    });

    expect(useAuthStore.getState().isAdmin).toBe(true);
  });

  it("does not throw when profile load fails", async () => {
    mockProfileSelect.mockResolvedValueOnce({ data: null, error: { message: "DB error" } });

    await act(async () => {
      await useAuthStore.getState().loadProfile();
    });

    expect(useAuthStore.getState().isProfileLoaded).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — BYOK keys", () => {
  beforeEach(() => resetStore());

  it("stores a BYOK key in memory", () => {
    act(() => {
      useAuthStore.getState().setBYOKKey("openai", "sk-test-abc123");
    });
    expect(useAuthStore.getState().byokKeys.openai).toBe("sk-test-abc123");
  });

  it("clears a specific BYOK key", () => {
    useAuthStore.setState({ byokKeys: { openai: "sk-test", anthropic: "ant-test" } });

    act(() => {
      useAuthStore.getState().clearBYOKKey("openai");
    });

    expect(useAuthStore.getState().byokKeys.openai).toBeUndefined();
    expect(useAuthStore.getState().byokKeys.anthropic).toBe("ant-test");
  });

  it("clears ALL byok keys on sign out", async () => {
    mockSignOut.mockResolvedValueOnce({ error: null });
    useAuthStore.setState({
      byokKeys: { openai: "sk-x", anthropic: "ant-y", gemini: "gem-z" },
      status:   "authenticated",
    });

    await act(async () => {
      await useAuthStore.getState().signOut();
    });

    expect(useAuthStore.getState().byokKeys).toEqual({});
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe("useAuthStore — selectors", () => {
  it("selectIsAuthenticated returns true when authenticated", () => {
    useAuthStore.setState({ status: "authenticated" });
    const { selectIsAuthenticated } = await import("@/store/authStore");
    expect(selectIsAuthenticated(useAuthStore.getState())).toBe(true);
  });

  it("selectIsLoading returns true when idle or loading", () => {
    const { selectIsLoading } = await import("@/store/authStore");

    useAuthStore.setState({ status: "idle" });
    expect(selectIsLoading(useAuthStore.getState())).toBe(true);

    useAuthStore.setState({ status: "loading" });
    expect(selectIsLoading(useAuthStore.getState())).toBe(true);

    useAuthStore.setState({ status: "authenticated" });
    expect(selectIsLoading(useAuthStore.getState())).toBe(false);
  });

  it("selectSubscriptionActive returns true for active and trialing", () => {
    const { selectSubscriptionActive } = await import("@/store/authStore");

    useAuthStore.setState({ profile: { ...MOCK_PROFILE, subscription_status: "active" } as never });
    expect(selectSubscriptionActive(useAuthStore.getState())).toBe(true);

    useAuthStore.setState({ profile: { ...MOCK_PROFILE, subscription_status: "trialing" } as never });
    expect(selectSubscriptionActive(useAuthStore.getState())).toBe(true);

    useAuthStore.setState({ profile: { ...MOCK_PROFILE, subscription_status: "canceled" } as never });
    expect(selectSubscriptionActive(useAuthStore.getState())).toBe(false);
  });
});
