// @ts-nocheck
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

// ── Mock Supabase ────────────────────────────────────────────────────────────
const mockSignIn  = vi.fn();
const mockSignUp  = vi.fn();
const mockSignOut = vi.fn().mockResolvedValue({ error: null });
const mockReset   = vi.fn().mockResolvedValue({ error: null });
const mockUpdate  = vi.fn();
const mockEq      = vi.fn();

vi.mock("@/lib/supabase/client", () => ({
  supabase: {
    auth: {
      signInWithPassword:    (...a: unknown[]) => mockSignIn(...a),
      signUp:                (...a: unknown[]) => mockSignUp(...a),
      signOut:               () => mockSignOut(),
      resetPasswordForEmail: (...a: unknown[]) => mockReset(...a),
      signInWithOAuth:       vi.fn().mockResolvedValue({ error: null }),
      updateUser:            vi.fn().mockResolvedValue({ error: null }),
      verifyOtp:             vi.fn().mockResolvedValue({ error: null }),
      resend:                vi.fn().mockResolvedValue({ error: null }),
    },
    from: vi.fn(() => ({
      update: (...a: unknown[]) => { mockUpdate(...a); return { eq: mockEq }; },
    })),
    storage: {
      from: vi.fn(() => ({
        upload:        vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl:  vi.fn(() => ({ data: { publicUrl: "https://cdn/x.png" } })),
      })),
    },
  },
}));

import { useAuthStore } from "@/store/userStore";
import { useAuth } from "@/hooks/useAuth";

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

function seedProfile(plan: string, isAdmin = false) {
  useAuthStore.setState({
    user:    { id: "u1", email: "u@x.com" } as never,
    profile: { id: "u1", plan_id: plan, is_admin: isAdmin, credits: 10 } as never,
    session: { access_token: "tok" } as never,
    isAuthenticated: true,
    isLoading: false,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockEq.mockResolvedValue({ error: null });
  seedProfile("free");
});

describe("useAuth — sign in [T-0010]", () => {
  it("calls signInWithPassword", async () => {
    mockSignIn.mockResolvedValueOnce({ error: null });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: any;
    await act(async () => {
      res = await result.current.login("a@b.com", "pw");
    });

    expect(mockSignIn).toHaveBeenCalledWith({ email: "a@b.com", password: "pw" });
    expect(res.error).toBeNull();
  });

  it("propagates error", async () => {
    mockSignIn.mockResolvedValueOnce({ error: new Error("bad") });
    const { result } = renderHook(() => useAuth(), { wrapper });

    let res: any;
    await act(async () => { res = await result.current.login("a@b.com", "pw"); });

    expect(res.error?.message).toBe("bad");
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
    await act(async () => { await result.current.signOut(); });
    expect(mockSignOut).toHaveBeenCalled();
  });
});

describe("useAuth — password reset [T-0030]", () => {
  it("requests password reset email", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => { await result.current.sendPasswordReset("a@b.com"); });
    expect(mockReset).toHaveBeenCalledWith("a@b.com", expect.objectContaining({
      redirectTo: expect.stringContaining("/reset-password"),
    }));
  });
});

describe("useAuth — updateProfile [T-0040]", () => {
  it("updates profile in DB and store", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.updateProfile({ full_name: "New" });
    });
    expect(mockUpdate).toHaveBeenCalled();
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

  it("only team/enterprise can access team_rooms", () => {
    seedProfile("pro");
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.canAccessFeature("team_rooms")).toBe(false);
    seedProfile("team");
    const { result: r2 } = renderHook(() => useAuth(), { wrapper });
    expect(r2.current.canAccessFeature("team_rooms")).toBe(true);
  });
});

describe("useAuth — role flags [T-0051]", () => {
  it("isAdmin reflects profile.is_admin", () => {
    seedProfile("pro", true);
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.isAdmin).toBe(true);
  });
});
