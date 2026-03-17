import { useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { useGamificationStore } from "@/hooks/useGamification";
import type { UserProfile } from "@/types/user.types";
import type { Provider } from "@supabase/supabase-js";

// ─────────────────────────────────────────────────────────────────
// useAuth
// Central auth hook — session listening, sign-in/out, profile sync,
// onboarding gate, and role-based access helpers.
// ─────────────────────────────────────────────────────────────────

export function useAuth() {
  const navigate  = useNavigate();
  const authStore = useAuthStore();

  // ── Bootstrap auth listener (call once in App.tsx) ────────────

  useEffect(() => {
    // Hydrate existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      authStore.setSession(session);
      authStore.setUser(session?.user ?? null);
      if (session?.user) loadProfile(session.user.id);
    });

    // Listen to all future auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        authStore.setSession(session);
        authStore.setUser(session?.user ?? null);

        switch (event) {
          case "SIGNED_IN":
            if (session?.user) {
              await loadProfile(session.user.id);
              handlePostSignIn(session.user.id);
            }
            break;

          case "SIGNED_OUT":
            authStore.clearAuth();
            useGamificationStore.getState().resetGamification();
            navigate("/login");
            break;

          case "TOKEN_REFRESHED":
            authStore.setSession(session);
            break;

          case "USER_UPDATED":
            if (session?.user) loadProfile(session.user.id);
            break;
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  // ── Load profile from DB ──────────────────────────────────────

  async function loadProfile(userId: string): Promise<void> {
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error || !data) {
      // Profile doesn't exist yet — new user, create it
      await createProfile(userId);
      return;
    }

    authStore.setProfile(data as UserProfile);
  }

  // ── Create profile for new user ───────────────────────────────

  async function createProfile(userId: string): Promise<void> {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData?.user;
    if (!user) return;

    const newProfile: Partial<UserProfile> = {
      id:                userId,
      email:             user.email ?? "",
      full_name:         user.user_metadata?.full_name ?? "",
      avatar_url:        user.user_metadata?.avatar_url ?? null,
      plan:              "free",
      credits: 5,
      role:              "software_engineer" as const,
      experience_level:  "mid",
      domain:            "Technology",
      coach_tone:        "encouraging",
      hint_style:        "short_hints",
      preferred_model:   "gemini-flash",
      onboarding_completed: false,
      created_at:        new Date().toISOString(),
      updated_at:        new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("profiles")
      .insert(newProfile)
      .select()
      .single();

    if (!error && data) {
      authStore.setProfile(data as UserProfile);
    }
  }

  // ── Post sign-in routing ──────────────────────────────────────

  async function handlePostSignIn(userId: string): Promise<void> {
    const profile = useAuthStore.getState().profile;

    if (!profile?.onboarding_completed) {
      navigate("/onboarding");
    } else {
      navigate("/dashboard");
    }
  }

  // ── Sign in with email/password ───────────────────────────────

  const signInWithEmail = useCallback(async (
    email: string,
    password: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error: error?.message ?? null };
  }, []);

  // ── Sign up with email/password ───────────────────────────────

  const signUpWithEmail = useCallback(async (
    email: string,
    password: string,
    fullName: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  // ── OAuth sign in ─────────────────────────────────────────────

  const signInWithOAuth = useCallback(async (
    provider: Provider
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes:     provider === "google" ? "email profile" : undefined,
      },
    });
    return { error: error?.message ?? null };
  }, []);

  // ── Sign out ──────────────────────────────────────────────────

  const signOut = useCallback(async (): Promise<void> => {
    await supabase.auth.signOut();
  }, []);

  // ── Password reset ────────────────────────────────────────────

  const sendPasswordReset = useCallback(async (
    email: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    return { error: error?.message ?? null };
  }, []);

  const updatePassword = useCallback(async (
    newPassword: string
  ): Promise<{ error: string | null }> => {
    const { error } = await supabase.auth.updateUser({
      password: newPassword,
    });
    return { error: error?.message ?? null };
  }, []);

  // ── Profile update ────────────────────────────────────────────

  const updateProfile = useCallback(async (
    patch: Partial<UserProfile>
  ): Promise<{ error: string | null }> => {
    const { user } = useAuthStore.getState();
    if (!user) return { error: "Not authenticated" };

    const { error } = await supabase
      .from("profiles")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", user.id);

    if (!error) {
      authStore.updateProfile(patch);
    }

    return { error: error?.message ?? null };
  }, []);

  // ── Avatar upload ─────────────────────────────────────────────

  const uploadAvatar = useCallback(async (
    file: File
  ): Promise<{ url: string | null; error: string | null }> => {
    const { user } = useAuthStore.getState();
    if (!user) return { url: null, error: "Not authenticated" };

    const ext  = file.name.split(".").pop();
    const path = `${user.id}/avatar.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, file, { upsert: true });

    if (uploadError) return { url: null, error: uploadError.message };

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

  const isAdmin = authStore.profile?.role === "admin" ||
                  authStore.profile?.role === "super_admin";

  const isSuperAdmin = authStore.profile?.role === "super_admin";

  const canAccessFeature = useCallback((
    feature: "live_copilot" | "team_rooms" | "advanced_analytics" | "export_pdf" | "byok"
  ): boolean => {
    const profile = useAuthStore.getState().profile;
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
  };
}
