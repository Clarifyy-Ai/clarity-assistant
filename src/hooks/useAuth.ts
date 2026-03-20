import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import type { UserProfile } from "@/types/user.types";
import type { Provider } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// useAuth
// Provides auth action helpers for form components (Login, Signup,
// etc.) and exposes the current auth state from the single source
// of truth (authStore, via the userStore proxy).
//
// Auth state is managed centrally by authStore.initialize() which
// is called once in App.tsx — this hook no longer sets up its own
// duplicate listener.
// ─────────────────────────────────────────────────────────────────

export function useAuth() {
  const navigate  = useNavigate();
  const authStore = useAuthStore();

  // ── Sign in with email/password ───────────────────────────────

  const signInWithEmail = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error ?? null };
  }, []);

  // ── Sign up with email/password ───────────────────────────────

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error ?? null };
  }, []);

  // ── Signup alias (used by SignupForm with options object) ─────

  const signup = useCallback(async (
    email: string,
    password: string,
    options: { full_name?: string; agreed_to_terms?: boolean; marketing_consent?: boolean }
  ): Promise<{ error: Error | null; user: unknown | null }> => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: options.full_name ?? "" },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error ?? null, user: data?.user ?? null };
  }, []);

  // ── Verify email OTP ──────────────────────────────────────────

  const verifyEmail = useCallback(async (
    email: string,
    token: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: "email",
    });
    return { error: error ?? null };
  }, []);

  // ── Resend verification email ─────────────────────────────────

  const resendVerificationEmail = useCallback(async (
    email: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.resend({
      type:  "signup",
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/verify-email` },
    });
    return { error: error ?? null };
  }, []);

  // ── OAuth sign in ─────────────────────────────────────────────

  const signInWithOAuth = useCallback(async (
    provider: Provider
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes:     provider === "google" ? "email profile" : undefined,
      },
    });
    return { error: error ?? null };
  }, []);

  // ── Sign out ──────────────────────────────────────────────────

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  // ── Password reset ────────────────────────────────────────────

  const sendPasswordReset = useCallback(async (
    email: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error ?? null };
  }, []);

  const updatePassword = useCallback(async (
    newPassword: string
  ): Promise<{ error: Error | null }> => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    return { error: error ?? null };
  }, []);

  // ── Profile update ────────────────────────────────────────────

  const updateProfile = useCallback(async (
    patch: Partial<UserProfile>
  ): Promise<{ error: Error | null }> => {
    const state = (useAuthStore as any).getState();
    const user  = state?.user;
    if (!user) return { error: new Error("Not authenticated") };

    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (!error) {
      authStore.updateProfile(patch as any);
    }

    return { error: error ?? null };
  }, [authStore]);

  // ── Avatar upload ─────────────────────────────────────────────

  const uploadAvatar = useCallback(async (
    file: File
  ): Promise<{ url: string | null; error: Error | null }> => {
    const state = (useAuthStore as any).getState();
    const user  = state?.user;
    if (!user) return { url: null, error: new Error("Not authenticated") };

    const ext  = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) return { url: null, error: uploadError };

    const { data } = supabase.storage.from("avatars").getPublicUrl(path);
    const url = data.publicUrl;

    await updateProfile({ avatar_url: url });
    return { url, error: null };
  }, [updateProfile]);

  // ── Complete onboarding ───────────────────────────────────────

  const completeOnboarding = useCallback(async (
    data: Partial<UserProfile>
  ): Promise<void> => {
    await updateProfile({ ...data, onboarding_completed: true });
    navigate("/dashboard");
  }, [updateProfile, navigate]);

  // ── Role helpers ──────────────────────────────────────────────

  const isAdmin      = authStore.profile?.is_admin === true;
  const isSuperAdmin = authStore.profile?.is_admin === true;

  const canAccessFeature = useCallback((
    feature: "live_copilot" | "team_rooms" | "advanced_analytics" | "export_pdf" | "byok"
  ): boolean => {
    const profile = (useAuthStore as any).getState()?.profile;
    if (!profile) return false;

    const plan = profile.plan;
    const featureMap: Record<string, string[]> = {
      live_copilot:        ["pro", "team", "enterprise"],
      team_rooms:          ["team", "enterprise"],
      advanced_analytics:  ["pro", "team", "enterprise"],
      export_pdf:          ["pro", "team", "enterprise"],
      byok:                ["pro", "team", "enterprise"],
    };

    return featureMap[feature]?.includes(plan) ?? false;
  }, []);

  return {
    // State
    user:             authStore.user,
    profile:          authStore.profile,
    session:          authStore.session,
    isAuthenticated:  authStore.isAuthenticated,
    isLoading:        authStore.isLoading,
    isAdmin,
    isSuperAdmin,

    // Actions
    login:            signInWithEmail,      // alias used by LoginForm
    signup,                                 // alias used by SignupForm
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
  };
}
