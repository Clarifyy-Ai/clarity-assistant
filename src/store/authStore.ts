// @ts-nocheck
// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts — Authentication state, Supabase session management,
// profile hydration, and BYOK key storage.
// Central auth source of truth — all components read from here.
// ─────────────────────────────────────────────────────────────────────────────

import { create }          from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer }           from "zustand/middleware/immer";
import { supabase }        from "@/integrations/supabase/client";

import type {
  SupabaseSession,
  SupabaseUser,
  ProfileRow,
  AuthProvider,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | "idle"           // not yet checked
  | "loading"        // checking session / signing in
  | "authenticated"  // session valid, profile loaded
  | "unauthenticated"// no session
  | "error";         // auth error occurred

export interface BYOKKeys {
  openai?:    string;   // stored encrypted in profile, decrypted client-side
  anthropic?: string;
  gemini?:    string;
}

export interface AuthState {
  // Session
  status:        AuthStatus;
  session:       SupabaseSession | null;
  user:          SupabaseUser   | null;

  // Profile (mirrors profiles table row)
  profile:       ProfileRow | null;
  isProfileLoaded: boolean;

  // BYOK keys (decrypted, in-memory only — never persisted)
  byokKeys:      BYOKKeys;

  // Error
  error:         string | null;

  // Flags
  isAdmin:       boolean;
  isOnboarded:   boolean;
  planId:        string;
  credits:       number;
}

export interface AuthActions {
  // Session init
  initialize:          () => Promise<void>;

  // Auth flows
  signInWithEmail:     (email: string, password: string) => Promise<void>;
  signUpWithEmail:     (email: string, password: string, fullName: string) => Promise<void>;
  signInWithOAuth:     (provider: AuthProvider) => Promise<void>;
  signOut:             () => Promise<void>;

  // Password
  sendPasswordReset:   (email: string) => Promise<void>;
  updatePassword:      (newPassword: string) => Promise<void>;

  // Profile
  loadProfile:         () => Promise<void>;
  updateProfile:       (updates: Partial<ProfileRow>) => Promise<void>;
  refreshCredits:      () => Promise<void>;

  // BYOK
  setBYOKKey:          (provider: keyof BYOKKeys, key: string) => void;
  clearBYOKKey:        (provider: keyof BYOKKeys) => void;

  // Internal
  setSession:          (session: SupabaseSession | null) => void;
  setError:            (error: string | null) => void;
  reset:               () => void;
}

export type AuthStore = AuthState & AuthActions;

// ─── Initial State ────────────────────────────────────────────────────────────

const INITIAL_STATE: AuthState = {
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
};

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  devtools(
    immer((set, get) => ({
      ...INITIAL_STATE,

      // ── Session Init ──────────────────────────────────────────────────────

      initialize: async () => {
        set((s) => { s.status = "loading"; });

        try {
          const { data: { session }, error } = await supabase.auth.getSession();

          if (error) throw error;

          if (session) {
            set((s) => {
              s.session = session as unknown as SupabaseSession;
              s.user    = session.user as unknown as SupabaseUser;
            });
            await get().loadProfile();
            set((s) => { s.status = "authenticated"; });
          } else {
            set((s) => { s.status = "unauthenticated"; });
          }
        } catch (err) {
          set((s) => {
            s.status = "error";
            s.error  = (err as Error).message;
          });
        }

        // Subscribe to future auth changes
        supabase.auth.onAuthStateChange(async (event, session) => {
          if (event === "SIGNED_IN" && session) {
            set((s) => {
              s.session = session as unknown as SupabaseSession;
              s.user    = session.user as unknown as SupabaseUser;
            });
            await get().loadProfile();
            set((s) => { s.status = "authenticated"; });
          }

          if (event === "SIGNED_OUT") {
            get().reset();
          }

          if (event === "TOKEN_REFRESHED" && session) {
            set((s) => { s.session = session as unknown as SupabaseSession; });
          }

          if (event === "PASSWORD_RECOVERY") {
            set((s) => { s.status = "authenticated"; });
          }
        });
      },

      // ── Sign In ───────────────────────────────────────────────────────────

      signInWithEmail: async (email, password) => {
        set((s) => { s.status = "loading"; s.error = null; });

        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error) {
          set((s) => { s.status = "error"; s.error = error.message; });
          throw error;
        }

        set((s) => {
          s.session = data.session as unknown as SupabaseSession;
          s.user    = data.user as unknown as SupabaseUser;
          s.status  = "authenticated";
        });

        await get().loadProfile();
      },

      // ── Sign Up ───────────────────────────────────────────────────────────

      signUpWithEmail: async (email, password, fullName) => {
        set((s) => { s.status = "loading"; s.error = null; });

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName },
          },
        });

        if (error) {
          set((s) => { s.status = "error"; s.error = error.message; });
          throw error;
        }

        // If email confirmation is required, session will be null
        if (data.session) {
          set((s) => {
            s.session = data.session as unknown as SupabaseSession;
            s.user    = data.user as unknown as SupabaseUser;
            s.status  = "authenticated";
          });
          await get().loadProfile();
        } else {
          // Awaiting email verification
          set((s) => { s.status = "unauthenticated"; });
        }
      },

      // ── OAuth ─────────────────────────────────────────────────────────────

      signInWithOAuth: async (provider) => {
        set((s) => { s.status = "loading"; s.error = null; });

        const { error } = await supabase.auth.signInWithOAuth({
          provider: provider as "google" | "github" | "linkedin_oidc" | "azure",
          options: {
            redirectTo: `${window.location.origin}/auth/callback`,
          },
        });

        if (error) {
          set((s) => { s.status = "error"; s.error = error.message; });
          throw error;
        }
      },

      // ── Sign Out ──────────────────────────────────────────────────────────

      signOut: async () => {
        set((s) => { s.status = "loading"; });
        await supabase.auth.signOut();
        get().reset();
      },

      // ── Password ──────────────────────────────────────────────────────────

      sendPasswordReset: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
      },

      updatePassword: async (newPassword) => {
        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) throw error;
      },

      // ── Profile ───────────────────────────────────────────────────────────

      loadProfile: async () => {
        const userId = get().user?.id;
        if (!userId) return;

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", userId)
          .single();

        if (error || !data) {
          console.error("[authStore] Failed to load profile:", error?.message);
          return;
        }

        set((s) => {
          s.profile         = data as unknown as ProfileRow;
          s.isProfileLoaded = true;
          s.isAdmin         = (data as Record<string, unknown>).is_admin as boolean ?? false;
          s.isOnboarded     = (data as Record<string, unknown>).onboarding_completed as boolean ?? false;
          s.planId          = (data as Record<string, unknown>).plan_id as string ?? "free";
          s.credits         = (data as Record<string, unknown>).credits as number ?? 0;
        });
      },

      updateProfile: async (updates) => {
        const userId = get().user?.id;
        if (!userId) throw new Error("Not authenticated.");

        const { data, error } = await supabase
          .from("profiles")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", userId)
          .select()
          .single();

        if (error) throw error;

        set((s) => {
          s.profile = data as unknown as ProfileRow;
          if ("plan_id" in updates) s.planId  = updates.plan_id as string;
          if ("credits" in updates) s.credits = updates.credits as number;
        });
      },

      refreshCredits: async () => {
        const userId = get().user?.id;
        if (!userId) return;

        const { data } = await supabase
          .from("profiles")
          .select("credits")
          .eq("id", userId)
          .single();

        if (data) {
          set((s) => {
            s.credits = (data as Record<string, unknown>).credits as number ?? s.credits;
            if (s.profile) s.profile.credits = s.credits;
          });
        }
      },

      // ── BYOK ─────────────────────────────────────────────────────────────

      setBYOKKey: (provider, key) => {
        set((s) => { s.byokKeys[provider] = key; });
      },

      clearBYOKKey: (provider) => {
        set((s) => { delete s.byokKeys[provider]; });
      },

      // ── Internal ──────────────────────────────────────────────────────────

      setSession: (session) => {
        set((s) => {
          s.session = session;
          s.user    = session?.user as unknown as SupabaseUser ?? null;
          s.status  = session ? "authenticated" : "unauthenticated";
        });
      },

      setError: (error) => {
        set((s) => { s.error = error; });
      },

      reset: () => {
        set((s) => {
          Object.assign(s, INITIAL_STATE);
          s.status  = "unauthenticated";
          s.byokKeys = {};  // always clear keys on sign-out
        });
      },
    })),
    { name: "AuthStore" }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectIsAuthenticated = (s: AuthStore) =>
  s.status === "authenticated";

export const selectIsLoading = (s: AuthStore) =>
  s.status === "loading" || s.status === "idle";

export const selectUser    = (s: AuthStore) => s.user;
export const selectProfile = (s: AuthStore) => s.profile;
export const selectPlanId  = (s: AuthStore) => s.planId;
export const selectCredits = (s: AuthStore) => s.credits;
export const selectIsAdmin = (s: AuthStore) => s.isAdmin;

export const selectHasByok = (s: AuthStore) =>
  Boolean(s.byokKeys.openai || s.byokKeys.anthropic || s.byokKeys.gemini);

export const selectPreferredModel = (s: AuthStore) =>
  s.profile?.preferred_model ?? "gpt-4o";

export const selectSubscriptionActive = (s: AuthStore) => {
  const status = s.profile?.subscription_status;
  return status === "active" || status === "trialing";
};
