import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const {
  mockRecordReferral,
  mockLoadProfile,
  mockToastSuccess,
  mockToastError,
} = vi.hoisted(() => ({
  mockRecordReferral: vi.fn(),
  mockLoadProfile: vi.fn().mockResolvedValue(true),
  mockToastSuccess: vi.fn(),
  mockToastError: vi.fn(),
}));

vi.mock("@/lib/referrals", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/referrals")>();
  return {
    ...actual,
    recordReferral: (...args: unknown[]) => mockRecordReferral(...args),
    resolveReferralCodeForClaim: () => "FRIEND01",
    getPendingReferralFromUserMetadata: () => "FRIEND01",
    getStoredRefCode: () => "FRIEND01",
  };
});

vi.mock("@/lib/billing/creditsManager", () => ({
  refreshCredits: vi.fn(async () => null),
}));

vi.mock("@/lib/auth/emailVerification", () => ({
  isUserEmailConfirmed: () => true,
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { warn: vi.fn() },
}));

import { refreshCredits } from "@/lib/billing/creditsManager";
import { useAuthStore } from "@/store/authStore";
import { useClaimStoredReferral } from "@/hooks/useClaimStoredReferral";

function seedAuth(overrides: Record<string, unknown> = {}) {
  useAuthStore.setState({
    status: "authenticated",
    isProfileLoaded: true,
    user: {
      id: "user-referee",
      email: "referee@example.com",
      user_metadata: { pending_referral_code: "FRIEND01" },
      email_confirmed_at: new Date().toISOString(),
    },
    profile: { id: "user-referee", referred_by: null, credits: 0 },
    loadProfile: mockLoadProfile,
    ...overrides,
  } as never);
}

describe("useClaimStoredReferral", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    seedAuth();
    mockRecordReferral.mockResolvedValue({
      applied: true,
      alreadyRecorded: false,
      refereeCredits: 25,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows success toast and refreshes profile after applied claim", async () => {
    renderHook(() => useClaimStoredReferral("user-referee"));

    await waitFor(() => {
      expect(mockRecordReferral).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(mockToastSuccess).toHaveBeenCalledWith(
        "Referral applied — 25 bonus credits added to your account.",
      );
    });

    expect(vi.mocked(refreshCredits)).toHaveBeenCalled();
  });

  it("shows error toast on terminal self_referral", async () => {
    mockRecordReferral.mockResolvedValue({
      applied: false,
      alreadyRecorded: false,
      reason: "self_referral",
      retryable: false,
    });

    renderHook(() => useClaimStoredReferral("user-referee"));

    await waitFor(() => {
      expect(mockToastError).toHaveBeenCalledWith(
        "You can't use your own referral code.",
      );
    });
  });

  it("skips claim when profile already has referred_by", async () => {
    seedAuth({
      profile: { id: "user-referee", referred_by: "referrer-id", credits: 25 },
    });

    renderHook(() => useClaimStoredReferral("user-referee"));

    await waitFor(() => {
      expect(mockRecordReferral).not.toHaveBeenCalled();
    });
  });
});
