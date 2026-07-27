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

import type { AuthProvider, ProfileRow } from "@/types";
import type { UserProfile } from "@/types/user.types";

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

const SUPPORTED_OAUTH_PROVIDERS = new Set<string>([
  "google",
  "github",
  "linkedin_oidc",
  "azure",
]);

const FEATURE_PLAN_MAP: Record<FeatureKey, string[]> = {
  live_copilot: ["pro", "elite", "enterprise"],
  // Rooms are deprecated — never grant access.
  team_rooms: [],
  advanced_analytics: ["pro", "elite", "enterprise"],
  export_pdf: ["pro", "elite", "enterprise"],
  // BYOK removed — server-managed providers only.
  byok: [],
};

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
  return patch as unknown as Partial<ProfileRow>;
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
            emailRedirectTo: `${window.location.origin}/auth/callback`,
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

    const plan = currentProfile.plan_id ?? "free";

    return FEATURE_PLAN_MAP[feature]?.includes(plan) ?? false;
  }, []);

  return {
    // State
    user,
    profile,
    session,
    isAuthenticated,
    isLoading,
    isAdmin,
    isSuperAdmin: isAdmin,

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
