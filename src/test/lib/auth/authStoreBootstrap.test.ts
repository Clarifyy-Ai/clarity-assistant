import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { useAuthStore } from "@/store/authStore";

const authStoreSrcPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../store/authStore.ts",
);

const mockSignIn = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
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
      signOut: (...a: unknown[]) => mockSignOut(...a),
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

vi.mock("@/lib/supabase/ensureWarmed", () => ({
  ensureSupabaseWarmed: vi.fn(async () => undefined),
  resetSupabaseWarmForTests: vi.fn(),
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
  email_confirmed_at: "2026-01-01T00:00:00Z",
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

  it("revokes local session when password login returns an unverified user", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: {
        session: mockSession,
        user: { ...mockUser, email_confirmed_at: null },
      },
      error: null,
    });

    await expect(
      useAuthStore.getState().signInWithEmail("a@b.com", "password123"),
    ).rejects.toMatchObject({
      code: "AUTH_EMAIL_NOT_VERIFIED",
      message: expect.stringMatching(/verify your email/i),
    });
    expect(mockSignOut).toHaveBeenCalledWith({ scope: "local" });
    expect(useAuthStore.getState().status).toBe("unauthenticated");
    expect(useAuthStore.getState().session).toBeNull();
    expect(mockGetByIdMaybe).not.toHaveBeenCalled();
  });

  it("maps invalid credentials to a safe user-facing error", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: { message: "Invalid login credentials", code: "invalid_credentials" },
    });

    await expect(
      useAuthStore.getState().signInWithEmail("a@b.com", "wrong"),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Incorrect email or password/i),
      code: "AUTH_INVALID_CREDENTIALS",
    });
    expect(useAuthStore.getState().error).toMatch(
      /Incorrect email or password|Invalid email or password/i,
    );
    expect(useAuthStore.getState().status).toBe("unauthenticated");
  });

  it("maps unknown-email token errors to the same safe copy without GoTrue status", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: {
        message: "password token invalid",
        code: "otp_expired",
        status: 400,
      },
    });

    let thrown: { status?: number; code?: string; message?: string } | undefined;
    try {
      await useAuthStore.getState().signInWithEmail("missing@example.com", "any-password");
    } catch (error) {
      thrown = error as { status?: number; code?: string; message?: string };
    }
    expect(thrown?.message).toMatch(/Incorrect email or password/i);
    expect(thrown?.code).toBe("AUTH_INVALID_CREDENTIALS");
    expect(thrown?.status).toBeUndefined();
    expect(useAuthStore.getState().error).toMatch(/Incorrect email or password/i);
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

  it("does not retry profile schema/config errors", async () => {
    useAuthStore.setState({
      user: mockUser as never,
      session: mockSession as never,
      status: "loading",
      isProfileLoaded: false,
      profile: null,
    });
    mockGetByIdMaybe.mockRejectedValue(
      new Error("column profiles.is_admin does not exist"),
    );

    const ok = await useAuthStore.getState().loadProfile();

    expect(ok).toBe(false);
    expect(mockGetByIdMaybe).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().status).toBe("error");
    expect(useAuthStore.getState().error).toMatch(/Unable to load your account/i);
  });

  it("retries profile once after password grant if the first load times out", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: mockSession, user: mockUser },
      error: null,
    });
    mockGetByIdMaybe
      .mockRejectedValueOnce(new Error("Profile load timed out after 15s"))
      .mockRejectedValueOnce(new Error("Profile load timed out after 15s"))
      .mockResolvedValueOnce(mockProfile);

    await useAuthStore
      .getState()
      .signInWithEmail("free@example.com", "password123");

    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().isProfileLoaded).toBe(true);
    expect(mockGetByIdMaybe.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("awaits PROFILE_COLD_RETRY_DELAY_MS wiring before the second profile fetch on timeout", () => {
    // Source contract: cold delay constant is imported and used before retry.
    const src = fs.readFileSync(authStoreSrcPath, "utf8");
    expect(src).toContain("PROFILE_COLD_RETRY_DELAY_MS");
    expect(src).toMatch(
      /if \(timedOut\)[\s\S]*?PROFILE_COLD_RETRY_DELAY_MS[\s\S]*?fetchProfile\(\)/,
    );
  });

  it("soft-timeout keep_cached_profile schedules admin role resolve and background revalidate", () => {
    const src = fs.readFileSync(authStoreSrcPath, "utf8");
    expect(src).toContain('recoveryAction: "keep_cached_profile"');
    expect(src).toMatch(
      /keep_cached_profile[\s\S]*?if \(!get\(\)\.isAdminResolved\)[\s\S]*?scheduleAdminRoleResolve/,
    );
    expect(src).toMatch(
      /softFailBackgroundRevalidateScheduled[\s\S]*?loadProfile\(\{\s*force:\s*true,\s*background:\s*true\s*\}\)/,
    );
  });

  it("keeps cached profile on soft timeout and schedules admin role when unresolved", async () => {
    useAuthStore.setState({
      user: mockUser as never,
      session: mockSession as never,
      status: "authenticated",
      isProfileLoaded: true,
      profile: mockProfile as never,
      isAdminResolved: false,
      isAdmin: false,
    });
    // Seed module cache via a successful load first
    mockGetByIdMaybe.mockResolvedValueOnce(mockProfile);
    await useAuthStore.getState().loadProfile({ force: true });
    await vi.waitFor(() => {
      expect(useAuthStore.getState().isAdminResolved).toBe(true);
    });

    // Reset role so soft-fail path must re-schedule resolve
    useAuthStore.setState({ isAdminResolved: false, isAdmin: false });
    mockHasRole.mockClear();
    mockHasRole.mockResolvedValue(true);
    mockGetByIdMaybe.mockRejectedValue(
      new Error("Profile load timed out after 15s"),
    );

    const ok = await useAuthStore.getState().loadProfile({ force: true });
    expect(ok).toBe(true);
    expect(useAuthStore.getState().status).toBe("authenticated");
    expect(useAuthStore.getState().isProfileLoaded).toBe(true);
    await vi.waitFor(() => {
      expect(mockHasRole).toHaveBeenCalled();
    });
    await vi.waitFor(() => {
      expect(useAuthStore.getState().isAdminResolved).toBe(true);
    });
    expect(useAuthStore.getState().isAdmin).toBe(true);
  });
});
