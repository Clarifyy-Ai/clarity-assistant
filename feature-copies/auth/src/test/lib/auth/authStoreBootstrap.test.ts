import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAuthStore } from "@/store/authStore";

const mockSignIn = vi.fn();
const mockGetSession = vi.fn();
const mockOnAuthStateChange = vi.fn(() => ({
  data: { subscription: { unsubscribe: vi.fn() } },
}));
const mockGetByIdMaybe = vi.fn();
const mockUpsert = vi.fn();
const mockHasRole = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      getSession: (...a: unknown[]) => mockGetSession(...a),
      onAuthStateChange: (...a: unknown[]) => mockOnAuthStateChange(...a),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
    },
  },
}));

vi.mock("@/lib/supabase/database", () => ({
  profilesDB: {
    getByIdMaybe: (...a: unknown[]) => mockGetByIdMaybe(...a),
    upsert: (...a: unknown[]) => mockUpsert(...a),
    update: vi.fn(),
  },
  userRolesDB: {
    hasRole: (...a: unknown[]) => mockHasRole(...a),
  },
}));

vi.mock("@/lib/supabase/sessionCache", () => ({
  readCachedAuthSession: () => null,
}));

const mockProfile = {
  id: "u1",
  email: "free@example.com",
  full_name: "Free User",
  plan_id: "free",
  credits: 50,
  onboarding_completed: true,
  is_banned: false,
  preferred_model: null,
  privacy_prefs: null,
};

const mockUser = {
  id: "u1",
  email: "free@example.com",
  app_metadata: {},
  user_metadata: { full_name: "Free User" },
};

const mockSession = {
  access_token: "tok",
  refresh_token: "ref",
  expires_in: 3600,
  token_type: "bearer",
  user: mockUser,
};

describe("authStore account bootstrap", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHasRole.mockResolvedValue(false);
    mockGetByIdMaybe.mockResolvedValue(mockProfile);
    useAuthStore.setState({
      status: "unauthenticated",
      session: null,
      user: null,
      profile: null,
      isProfileLoaded: false,
      error: null,
      isAdmin: false,
      isModerator: false,
      isAdminResolved: false,
      isOnboarded: false,
      planId: "free",
      credits: 0,
      isLoading: false,
      isAuthenticated: false,
    });
  });

  it("normalizes email and loads profile without waiting on a slow role check", async () => {
    let resolveRole: (v: boolean) => void = () => undefined;
    mockHasRole.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveRole = resolve;
        }),
    );
    mockSignIn.mockResolvedValueOnce({
      data: { session: mockSession, user: mockUser },
      error: null,
    });

    const signInPromise = useAuthStore
      .getState()
      .signInWithEmail("  Free@Example.COM ", "password123");

    // Profile should complete and authenticate even while role is pending.
    await vi.waitFor(() => {
      expect(useAuthStore.getState().isProfileLoaded).toBe(true);
    });
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "free@example.com",
      password: "password123",
    });
    expect(useAuthStore.getState().status).toBe("authenticated");

    await signInPromise;
    resolveRole(false);
    await vi.waitFor(() => {
      expect(useAuthStore.getState().isAdminResolved).toBe(true);
    });
    expect(useAuthStore.getState().isAdmin).toBe(false);
  });

  it("dedupes concurrent sign-in calls into one token request", async () => {
    mockSignIn.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve({
                data: { session: mockSession, user: mockUser },
                error: null,
              }),
            20,
          );
        }),
    );

    const a = useAuthStore.getState().signInWithEmail("a@b.com", "pw");
    const b = useAuthStore.getState().signInWithEmail("a@b.com", "pw");
    await Promise.all([a, b]);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it("dedupes concurrent loadProfile calls", async () => {
    useAuthStore.setState({
      user: mockUser as never,
      session: mockSession as never,
      status: "loading",
    });
    mockGetByIdMaybe.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve(mockProfile), 30);
        }),
    );

    const p1 = useAuthStore.getState().loadProfile();
    const p2 = useAuthStore.getState().loadProfile();
    await Promise.all([p1, p2]);
    expect(mockGetByIdMaybe).toHaveBeenCalledTimes(1);
  });

  it("maps invalid credentials to a safe user-facing error", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    await expect(
      useAuthStore.getState().signInWithEmail("a@b.com", "wrong"),
    ).rejects.toThrow(/Incorrect email or password|Invalid email or password/i);
    expect(useAuthStore.getState().error).toMatch(
      /Incorrect email or password|Invalid email or password/i,
    );
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("does not trim or case-fold the password", async () => {
    const password = "  P@ssW0rd! ";
    mockSignIn.mockResolvedValueOnce({
      data: { session: mockSession, user: mockUser },
      error: null,
    });
    await useAuthStore.getState().signInWithEmail("free@example.com", password);
    expect(mockSignIn).toHaveBeenCalledWith({
      email: "free@example.com",
      password,
    });
  });

  it("upserts a missing profile once and does not grant admin", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: mockSession, user: mockUser },
      error: null,
    });
    mockGetByIdMaybe.mockResolvedValueOnce(null);
    mockUpsert.mockResolvedValueOnce({
      ...mockProfile,
      onboarding_completed: false,
    });
    mockHasRole.mockResolvedValue(false);

    await useAuthStore.getState().signInWithEmail("free@example.com", "password123");
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().isAdmin).toBe(false);
    expect(useAuthStore.getState().status).toBe("authenticated");
  });

  it("bounds retryAccountLoad", async () => {
    useAuthStore.setState({
      user: mockUser as never,
      session: mockSession as never,
      status: "error",
      recoveryAttempts: 3,
      isProfileLoaded: false,
    });
    const ok = await useAuthStore.getState().retryAccountLoad();
    expect(ok).toBe(false);
    expect(mockGetByIdMaybe).not.toHaveBeenCalled();
  });
});
