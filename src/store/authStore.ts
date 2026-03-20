// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts
// ─────────────────────────────────────────────────────────────────────────────

import { create }                    from "zustand";
import { devtools, persist }         from "zustand/middleware";
import { immer }                     from "zustand/middleware/immer";
import posthog                       from "posthog-js";
import { supabase }                  from "@/integrations/supabase/client";

import type {
  SupabaseSession,
  SupabaseUser,
  ProfileRow,
  AuthProvider,
} from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | "idle"
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export interface BYOKKeys {
  openai?:    string;
  anthropic?: string;
  gemini?:    string;
}

export interface AuthState {
  status:          AuthStatus;
  session:         SupabaseSession | null;
  user:            SupabaseUser    | null;
  profile:         ProfileRow | null;
  isProfileLoaded: boolean;
  byokKeys:        BYOKKeys;
  error:           string | null;
  isAdmin:         boolean;
  isOnboarded:     boolean;
  planId:          string;
  credits:         number;
}

export interface AuthActions {
  initialize:        () => Promise<void>;
  signInWithEmail:   (email: string, password: string) => Promise<void>;
  signUpWithEmail:   (email: string, password: string, fullName: string) => Promise<void>;
  signInWithOAuth:   (provider: AuthProvider) => Promise<void>;
  signOut:           () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword:    (newPassword: string) => Promise<void>;
  loadProfile:       () => Promise<void>;
  updateProfile:     (updates: Partial<ProfileRow>) => Promise<void>;
  refreshCredits:    () => Promise<void>;
  setBYOKKey:        (provider: keyof BYOKKeys, key: string) => void;
  clearBYOKKey:      (provider: keyof BYOKKeys) => void;
  setSession:        (session: SupabaseSession | null) => void;
  setError:          (error: string | null) => void;
  reset:             () => void;
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

// ─── Module-level unsubscribe ref — prevents listener leak & StrictMode doubles ──
let _unsubAuthListener: (() => void) | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      immer((set, get) => ({
        ...INITIAL_STATE,

        // ── Session Init ────────────────────────────────────────────────────

        initialize: async () => {
          // Kill any existing listener before mounting a new one.
          // This prevents doubles in React StrictMode and on HMR.
          if (_unsubAuthListener) {
            _unsubAuthListener();
            _unsubAuthListener = null;
          }

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

          // Single listener — owned entirely by this store
          const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
            if (event === "SIGNED_IN" && session) {
              set((s) => {
                s.session = session as unknown as SupabaseSession;
                s.user    = session.user as unknown as SupabaseUser;
              });
              await get().loadProfile();
              set((s) => { s.status = "authenticated"; });

              if (import.meta.env.VITE_POSTHOG_KEY) {
                posthog.identify(session.user.id, { email: session.user.email });
              }
            }

            if (event === "SIGNED_OUT") {
              if (import.meta.env.VITE_POSTHOG_KEY) posthog.reset();
              get().reset();
            }

            if (event === "TOKEN_REFRESHED" && session) {
              set((s) => { s.session = session as unknown as SupabaseSession; });
            }

            if (event === "PASSWORD_RECOVERY") {
              set((s) => { s.status = "authenticated"; });
            }
          });

          // Store cleanup ref for next initialize() call
          _unsubAuthListener = () => data.subscription.unsubscribe();
        },

        // ── Sign In ─────────────────────────────────────────────────────────

        signInWithEmail: async (email, password) => {
          set((s) => { s.status = "loading"; s.error = null; });

          const { data, error } = await supabase.auth.signInWithPassword({ email, password });

          if (error) {
            set((s) => { s.status = "error"; s.error = error.message; });
            throw error;
          }

          set((s) => {
            s.session = data.session as unknown as SupabaseSession;
            s.user    = data.user    as unknown as SupabaseUser;
            s.status  = "authenticated";
          });

          await get().loadProfile();
        },

        // ── Sign Up ─────────────────────────────────────────────────────────

        signUpWithEmail: async (email, password, fullName) => {
          set((s) => { s.status = "loading"; s.error = null; });

          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: { data: { full_name: fullName } },
          });

          if (error) {
            set((s) => { s.status = "error"; s.error = error.message; });
            throw error;
          }

          if (data.session) {
            set((s) => {
              s.session = data.session as unknown as SupabaseSession;
              s.user    = data.user    as unknown as SupabaseUser;
              s.status  = "authenticated";
            });
            await get().loadProfile();
          } else {
            set((s) => { s.status = "unauthenticated"; });
          }
        },

        // ── OAuth ───────────────────────────────────────────────────────────

        signInWithOAuth: async (provider) => {
          set((s) => { s.status = "loading"; s.error = null; });

          const { error } = await supabase.auth.signInWithOAuth({
            provider: provider as "google" | "github" | "linkedin_oidc" | "azure",
            options: { redirectTo: `${window.location.origin}/auth/callback` },
          });

          if (error) {
            set((s) => { s.status = "error"; s.error = error.message; });
            throw error;
          }
        },

        // ── Sign Out ────────────────────────────────────────────────────────

        signOut: async () => {
          set((s) => { s.status = "loading"; });
          await supabase.auth.signOut();
          get().reset();
        },

        // ── Password ────────────────────────────────────────────────────────

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

        // ── Profile ─────────────────────────────────────────────────────────

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

          const row = data as Record<string, unknown>;

          set((s) => {
            s.profile         = data as unknown as ProfileRow;
            s.isProfileLoaded = true;
            s.isAdmin         = (row.is_admin   as boolean) ?? false;
            s.isOnboarded     = (row.onboarding_completed as boolean) ?? false;
            s.planId          = (row.plan_id    as string)  ?? "free";
            s.credits         = (row.credits    as number)  ?? 0;
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
            if ("plan_id" in updates) s.planId  = updates.plan_id  as string;
            if ("credits" in updates) s.credits = updates.credits  as number;
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

        // ── BYOK ────────────────────────────────────────────────────────────

        setBYOKKey:  (provider, key) => { set((s) => { s.byokKeys[provider] = key; }); },
        clearBYOKKey:(provider) =>      { set((s) => { delete s.byokKeys[provider]; }); },

        // ── Internal ────────────────────────────────────────────────────────

        setSession: (session) => {
          set((s) => {
            s.session = session;
            s.user    = session?.user as unknown as SupabaseUser ?? null;
            s.status  = session ? "authenticated" : "unauthenticated";
          });
        },

        setError: (error) => { set((s) => { s.error = error; }); },

        reset: () => {
          set((s) => {
            Object.assign(s, INITIAL_STATE);
            s.status   = "unauthenticated";
            s.byokKeys = {};
          });
        },
      })),
      {
        name: "clarity-auth-v1",
        // Only persist non-sensitive UI flags — NEVER persist session/user/keys
        partialize: (s) => ({
          isOnboarded: s.isOnboarded,
          planId:      s.planId,
          isAdmin:     s.isAdmin,
        }),
      }
    ),
    { name: "AuthStore" }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectIsAuthenticated    = (s: AuthStore) => s.status === "authenticated";
export const selectIsLoading          = (s: AuthStore) => s.status === "loading" || s.status === "idle";
export const selectUser               = (s: AuthStore) => s.user;
export const selectProfile            = (s: AuthStore) => s.profile;
export const selectPlanId             = (s: AuthStore) => s.planId;
export const selectCredits            = (s: AuthStore) => s.credits;
export const selectIsAdmin            = (s: AuthStore) => s.isAdmin;
export const selectHasByok            = (s: AuthStore) => Boolean(s.byokKeys.openai || s.byokKeys.anthropic || s.byokKeys.gemini);
export const selectPreferredModel     = (s: AuthStore) => s.profile?.preferred_model ?? "gpt-4o";
export const selectSubscriptionActive = (s: AuthStore) => {
  const status = s.profile?.subscription_status;
  return status === "active" || status === "trialing";
};
