// ─────────────────────────────────────────────────────────────────────────────
// useAuth.test.ts — Tests for current useAuth hook surface:
//   signInWithEmail/login, signup, signOut, sendPasswordReset,
//   updateProfile, canAccessFeature, role flags.
// Catalog refs: T-0001..T-0040 (auth flows)
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import React from "react";

// ── Mock Supabase auth ───────────────────────────────────────────────────────
const mockSignIn = vi.fn();
const mockSignUp = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockReset = vi.fn().mockResolvedValue({ error: null });

const mockProfile = {
  id: "u1",
  email: "u@x.com",
  full_name: "Test User",
  plan_id: "free",
  credits: 10,
  onboarding_completed: true,
};

const mockGetByIdMaybe = vi.fn();
const mockProfilesUpdate = vi.fn();
const mockHasRole = vi.fn().mockResolvedValue(false);

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword: (...a: unknown[]) => mockSignIn(...a),
      signUp: (...a: unknown[]) => mockSignUp(...a),
      signOut: () => mockSignOut(),
      resetPasswordForEmail: (...a: unknown[]) => mockReset(...a),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      verifyOtp: vi.fn().mockResolvedValue({ error: null }),
      resend: vi.fn().mockResolvedValue({ error: null }),
    },
    storage: {
      from: vi.fn(() => ({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn(() => ({ data: { publicUrl: "https://cdn/x.png" } })),
      })),
    },
  },
  STORAGE_BUCKETS: { AVATARS: "avatars" },
  uploadFile: vi.fn(),
}));

vi.mock("@/lib/supabase/database", () => ({
  profilesDB: {
    getByIdMaybe: (...a: unknown[]) => mockGetByIdMaybe(...a),
    update: (...a: unknown[]) => mockProfilesUpdate(...a),
  },
  userRolesDB: {
    hasRole: (...a: unknown[]) => mockHasRole(...a),
  },
}));

import { useAuthStore } from "@/store/authStore";
import { useAuth } from "@/hooks/useAuth";

const mockUser = {
  id: "u1",
  email: "u@x.com",
  app_metadata: {},
  user_metadata: { full_name: "Test User" },
};

const mockSession = {
  access_token: "test-access-token",
  refresh_token: "test-refresh-token",
  expires_in: 3600,
  token_type: "bearer",
  user: mockUser,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

function seedProfile(plan: string, isAdmin = false) {
  useAuthStore.setState({
    user: mockUser as never,
    profile: { ...mockProfile, plan_id: plan } as never,
    session: mockSession as never,
    credits: 10,
    planId: plan,
    isAdmin,
    isAuthenticated: true,
    isLoading: false,
    status: "authenticated",
    isProfileLoaded: true,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockReset.mockResolvedValue({ error: null });
  mockSignOut.mockResolvedValue({ error: null });
  mockGetByIdMaybe.mockResolvedValue(mockProfile);
  mockProfilesUpdate.mockImplementation(async (_userId, patch) => ({
    ...mockProfile,
    ...patch,
  }));
  mockHasRole.mockResolvedValue(false);
  seedProfile("free");
});

describe("useAuth — sign in [T-0010]", () => {
  it("calls signInWithPassword with full session payload", async () => {
    mockSignIn.mockResolvedValueOnce({
      data: { session: mockSession, user: mockUser },
      error: null,
    });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      res = await result.current.login("a@b.com", "pw");
    });

    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(mockGetByIdMaybe).toHaveBeenCalledWith("u1");
    expect(res!.error).toBeNull();
    expect(useAuthStore.getState().user?.id).toBe("u1");
  });

  it("propagates error", async () => {
    mockSignIn.mockResolvedValueOnce({ data: { session: null, user: null }, error: new Error("bad") });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: Awaited<ReturnType<typeof result.current.login>>;
    await act(async () => {
      res = await result.current.login("a@b.com", "pw");
    });

    expect(res!.error?.message).toBe("bad");
  });
});

describe("useAuth — signup [T-0011]", () => {
  it("calls signUp with metadata", async () => {
    mockSignUp.mockResolvedValueOnce({ data: { user: { id: "u2" } }, error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => {
      await result.current.signup("a@b.com", "pw", { full_name: "Ann" });
    });

    expect(mockSignUp).toHaveBeenCalled();
    const arg = mockSignUp.mock.calls[0][0];
    expect(arg.email).toBe("a@b.com");
    expect(arg.options.data.full_name).toBe("Ann");
  });
});

describe("useAuth — signOut [T-0020]", () => {
  it("invokes supabase signOut", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.signOut();
    });
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("useAuth — password reset [T-0030]", () => {
  it("requests password reset email", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.sendPasswordReset("a@b.com");
    });
    expect(mockReset).toHaveBeenCalledWith("a@b.com", expect.objectContaining({
      redirectTo: expect.stringContaining("/reset-password"),
    }));
  });
});

describe("useAuth — updateProfile [T-0040]", () => {
  it("updates profile via profilesDB and store", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.updateProfile({ full_name: "New" });
    });
    expect(mockProfilesUpdate).toHaveBeenCalledWith("u1", { full_name: "New" });
    expect(useAuthStore.getState().profile?.full_name).toBe("New");
  });
});

describe("useAuth — canAccessFeature [T-0050]", () => {
  it("free plan cannot access live_copilot", () => {
    seedProfile("free");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.canAccessFeature("live_copilot")).toBe(false);
  });

  it("pro plan can access live_copilot", () => {
    seedProfile("pro");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.canAccessFeature("live_copilot")).toBe(true);
  });

  it("team_rooms is deprecated and never granted", () => {
    seedProfile("pro");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.canAccessFeature("team_rooms")).toBe(false);

    seedProfile("elite");
    const { result: eliteResult } = renderHook(() => useAuth(), { wrapper });
    expect(eliteResult.current.canAccessFeature("team_rooms")).toBe(false);

    seedProfile("enterprise");
    const { result: entResult } = renderHook(() => useAuth(), { wrapper });
    expect(entResult.current.canAccessFeature("team_rooms")).toBe(false);
  });
});

describe("useAuth — role flags [T-0051]", () => {
  it("isAdmin reflects authStore.isAdmin", () => {
    seedProfile("pro", true);
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAdmin).toBe(true);
  });
});
