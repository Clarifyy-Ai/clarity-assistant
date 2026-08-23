// src/hooks/useAuth.ts
//
// Auth helper hook.
//
// SECURITY / ARCHITECTURE PURPOSE:
// - Exposes auth state from the single source of truth: authStore
// - Avoids duplicate auth listeners
// - Avoids duplicate login/signup/logout logic
// - Keeps legacy helper methods for existing components
// - Uses hardened authStore actions wherever possible

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Provider } from "@supabase/supabase-js";

import { supabase, STORAGE_BUCKETS, uploadFile } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import { sanitizeFileName } from "@/lib/security";
import { buildAuthRedirectUrl } from "@/lib/auth/redirectUrl";

import type { AuthProvider, ProfileRow } from "@/types";
import type { UserProfile } from "@/types/user.types";
import { getEnabledOAuthProviders } from "@/lib/auth/oauthProviders";
import { omitPinnedProfileColumns } from "@/lib/profile/clientUpdateGuard";
import { normalizePlanId } from "@/lib/billing/planIds";
import { FEATURE_PLAN_GATE, type FeatureFlag } from "@/lib/constants/features";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type AuthResult = {
  error: Error | null;
};

type SignupResult = {
  error: Error | null;
  user: unknown | null;
};

type AvatarUploadResult = {
  url: string | null;
  error: Error | null;
};

type SignupOptions = {
  full_name?: string;
  agreed_to_terms?: boolean;
  marketing_consent?: boolean;
};

type FeatureKey =
  | "live_copilot"
  | "team_rooms"
  | "advanced_analytics"
  | "export_pdf"
  | "byok";

const SUPPORTED_OAUTH_PROVIDERS = new Set<string>(getEnabledOAuthProviders());

const LEGACY_FEATURE_TO_FLAG: Record<FeatureKey, FeatureFlag | null> = {
  live_copilot: "overlay",
  advanced_analytics: "analytics",
  export_pdf: "analytics",
  team_rooms: null,
  byok: null,
};

const LAUNCH_PLAN_RANK: Record<"free" | "pro" | "enterprise", number> = {
  free: 0,
  pro: 2,
  enterprise: 4,
};

function plansMeetingGate(flag: FeatureFlag): string[] {
  const min = FEATURE_PLAN_GATE[flag];
  const need = LAUNCH_PLAN_RANK[min === "starter" ? "free" : min === "elite" ? "pro" : min] ?? 0;
  return (Object.keys(LAUNCH_PLAN_RANK) as Array<"free" | "pro" | "enterprise">).filter(
    (id) => LAUNCH_PLAN_RANK[id] >= need,
  );
}

/** Launch IDs only. Derived from FEATURE_PLAN_GATE so tests keep stable keys. */
export const FEATURE_PLAN_MAP: Record<FeatureKey, string[]> = {
  live_copilot: plansMeetingGate("overlay"),
  team_rooms: [],
  advanced_analytics: plansMeetingGate("analytics"),
  export_pdf: plansMeetingGate("analytics"),
  byok: [],
};

export const MFA_REQUIRED_REASON = "mfa_required" as const;
export const MFA_AAL_START_FAILED_MESSAGE =
  "We couldn't start two-factor verification. Sign in again.";

export type AuthenticatorAssuranceSnapshot = {
  currentLevel?: string | null;
  nextLevel?: string | null;
} | null | undefined;

export type MfaAssuranceDecision = "allow" | "challenge" | "fail_closed";

/**
 * Fail-closed MFA gate. AAL1 + next AAL2 must challenge; API/parse failures
 * must never continue into the private app.
 */
export function evaluateMfaAssurance(input: {
  error?: unknown;
  aal?: AuthenticatorAssuranceSnapshot;
}): MfaAssuranceDecision {
  if (input.error) return "fail_closed";
  const current = input.aal?.currentLevel;
  const next = input.aal?.nextLevel;
  if (!current) return "fail_closed";
  if (current === "aal2") return "allow";
  if (current === "aal1" && next === "aal2") return "challenge";
  if (current === "aal1") return "allow";
  return "fail_closed";
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function toError(error: unknown, fallbackMessage = "Something went wrong."): Error {
  if (error instanceof Error) {
    return error;
  }

  if (typeof error === "string" && error.trim().length > 0) {
    return new Error(error);
  }

  return new Error(fallbackMessage);
}

function normalizeOAuthProvider(provider: Provider | AuthProvider): AuthProvider {
  const raw = String(provider);

  if (!SUPPORTED_OAUTH_PROVIDERS.has(raw)) {
    throw new Error("Unsupported OAuth provider.");
  }

  return raw as AuthProvider;
}

function getSafeAvatarPath(userId: string, file: File): string {
  const rawExtension = file.name.split(".").pop() ?? "png";
  const sanitizedExtension = sanitizeFileName(rawExtension)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  const extension = sanitizedExtension || "png";

  return `${userId}/avatar.${extension}`;
}

function toProfilePatch(patch: Partial<UserProfile>): Partial<ProfileRow> {
  return omitPinnedProfileColumns(
    patch as unknown as Record<string, unknown>,
  ) as unknown as Partial<ProfileRow>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useAuth() {
  const navigate = useNavigate();

  // State
  const user = useAuthStore((state) => state.user);
  const profile = useAuthStore((state) => state.profile);
  const session = useAuthStore((state) => state.session);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);
  const isAdmin = useAuthStore((state) => state.isAdmin);

  // Store actions
  const storeSignInWithEmail = useAuthStore((state) => state.signInWithEmail);
  const storeSignUpWithEmail = useAuthStore((state) => state.signUpWithEmail);
  const storeSignInWithOAuth = useAuthStore((state) => state.signInWithOAuth);
  const storeSignOut = useAuthStore((state) => state.signOut);
  const storeSendPasswordReset = useAuthStore((state) => state.sendPasswordReset);
  const storeUpdatePassword = useAuthStore((state) => state.updatePassword);
  const storeUpdateProfile = useAuthStore((state) => state.updateProfile);
  const refreshCredits = useAuthStore((state) => state.refreshCredits);

  // ───────────────────────────────────────────────────────────────────────────
  // Email/password sign in
  // ───────────────────────────────────────────────────────────────────────────

  const signInWithEmail = useCallback(
    async (email: string, password: string): Promise<AuthResult> => {
      try {
        await storeSignInWithEmail(email, password);
        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to sign in."),
        };
      }
    },
    [storeSignInWithEmail]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Email/password sign up
  // ───────────────────────────────────────────────────────────────────────────

  const signUpWithEmail = useCallback(
    async (
      email: string,
      password: string,
      fullName: string
    ): Promise<AuthResult> => {
      try {
        await storeSignUpWithEmail(email, password, fullName);
        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to create account."),
        };
      }
    },
    [storeSignUpWithEmail]
  );

  // Legacy signup alias used by older SignupForm components.
  const signup = useCallback(
    async (
      email: string,
      password: string,
      options: SignupOptions
    ): Promise<SignupResult> => {
      try {
        if (options.agreed_to_terms === false) {
          return {
            error: new Error("You must accept the terms and privacy policy."),
            user: null,
          };
        }

        await storeSignUpWithEmail(email, password, options.full_name ?? "");

        const currentUser = useAuthStore.getState().user;

        return {
          error: null,
          user: currentUser,
        };
      } catch (error) {
        return {
          error: toError(error, "Failed to create account."),
          user: null,
        };
      }
    },
    [storeSignUpWithEmail]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Email OTP / verification helpers
  // These remain direct Supabase calls because authStore does not own OTP flows.
  // ───────────────────────────────────────────────────────────────────────────

  const verifyEmail = useCallback(
    async (email: string, token: string): Promise<AuthResult> => {
      try {
        const { error } = await supabase.auth.verifyOtp({
          email,
          token,
          type: "email",
        });

        return {
          error: error ?? null,
        };
      } catch (error) {
        return {
          error: toError(error, "Failed to verify email."),
        };
      }
    },
    []
  );

  const resendVerificationEmail = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        const { error } = await supabase.auth.resend({
          type: "signup",
          email,
          options: {
            emailRedirectTo: buildAuthRedirectUrl({
              path: "/auth/callback",
              configuredAppUrl: import.meta.env.VITE_APP_URL,
              appEnv: import.meta.env.VITE_APP_ENV,
              windowOrigin:
                typeof window !== "undefined" ? window.location.origin : null,
            }),
          },
        });

        return {
          error: error ?? null,
        };
      } catch (error) {
        return {
          error: toError(error, "Failed to resend verification email."),
        };
      }
    },
    []
  );

  // ───────────────────────────────────────────────────────────────────────────
  // OAuth
  // ───────────────────────────────────────────────────────────────────────────

  const signInWithOAuth = useCallback(
    async (provider: Provider | AuthProvider): Promise<AuthResult> => {
      try {
        const normalizedProvider = normalizeOAuthProvider(provider);
        await storeSignInWithOAuth(normalizedProvider);

        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to start OAuth sign-in."),
        };
      }
    },
    [storeSignInWithOAuth]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Sign out
  // ───────────────────────────────────────────────────────────────────────────

  const signOut = useCallback(async (): Promise<void> => {
    await storeSignOut();
  }, [storeSignOut]);

  // ───────────────────────────────────────────────────────────────────────────
  // Password reset
  // ───────────────────────────────────────────────────────────────────────────

  const sendPasswordReset = useCallback(
    async (email: string): Promise<AuthResult> => {
      try {
        await storeSendPasswordReset(email);

        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to send password reset email."),
        };
      }
    },
    [storeSendPasswordReset]
  );

  const updatePassword = useCallback(
    async (newPassword: string): Promise<AuthResult> => {
      try {
        await storeUpdatePassword(newPassword);

        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to update password."),
        };
      }
    },
    [storeUpdatePassword]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Profile update
  // ───────────────────────────────────────────────────────────────────────────

  const updateProfile = useCallback(
    async (patch: Partial<UserProfile>): Promise<AuthResult> => {
      try {
        if (!useAuthStore.getState().user) {
          return {
            error: new Error("Not authenticated."),
          };
        }

        await storeUpdateProfile(toProfilePatch(patch));

        return { error: null };
      } catch (error) {
        return {
          error: toError(error, "Failed to update profile."),
        };
      }
    },
    [storeUpdateProfile]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Avatar upload
  // ───────────────────────────────────────────────────────────────────────────

  const uploadAvatar = useCallback(
    async (file: File): Promise<AvatarUploadResult> => {
      try {
        const currentUser = useAuthStore.getState().user;

        if (!currentUser) {
          return {
            url: null,
            error: new Error("Not authenticated."),
          };
        }

        const path = getSafeAvatarPath(currentUser.id, file);

        const result = await uploadFile(
          STORAGE_BUCKETS.AVATARS,
          path,
          file
        );

        if (!result?.url) {
          return {
            url: null,
            error: new Error("Avatar upload failed."),
          };
        }

        await storeUpdateProfile(
          toProfilePatch({
            avatar_url: result.url,
          } as Partial<UserProfile>)
        );

        return {
          url: result.url,
          error: null,
        };
      } catch (error) {
        return {
          url: null,
          error: toError(error, "Failed to upload avatar."),
        };
      }
    },
    [storeUpdateProfile]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Complete onboarding
  // ───────────────────────────────────────────────────────────────────────────

  const completeOnboarding = useCallback(
    async (data: Partial<UserProfile>): Promise<void> => {
      const result = await updateProfile({
        ...data,
        onboarding_completed: true,
      });

      if (result.error) {
        throw result.error;
      }

      navigate("/app/dashboard", { replace: true });
    },
    [navigate, updateProfile]
  );

  // ───────────────────────────────────────────────────────────────────────────
  // Feature helpers
  // ───────────────────────────────────────────────────────────────────────────

  const canAccessFeature = useCallback((feature: FeatureKey): boolean => {
    const currentProfile = useAuthStore.getState().profile;

    if (!currentProfile) {
      return false;
    }

    const plan = normalizePlanId(currentProfile.plan_id ?? "free");
    const flag = LEGACY_FEATURE_TO_FLAG[feature];
    if (!flag) return false;
    const min = FEATURE_PLAN_GATE[flag];
    const need = LAUNCH_PLAN_RANK[min === "starter" ? "free" : min === "elite" ? "pro" : min] ?? 0;
    return LAUNCH_PLAN_RANK[plan] >= need;
  }, []);

  return {
    // State
    user,
    profile,
    session,
    isAuthenticated,
    isLoading,
    isAdmin,

    // Actions
    login: signInWithEmail,
    signup,
    signInWithEmail,
    signUpWithEmail,
    signInWithOAuth,
    signOut,
    sendPasswordReset,
    updatePassword,
    updateProfile,
    uploadAvatar,
    completeOnboarding,
    canAccessFeature,
    verifyEmail,
    resendVerificationEmail,
    refreshCredits,
  };
}
