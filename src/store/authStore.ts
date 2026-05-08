// ─────────────────────────────────────────────────────────────────────────────
// authStore.ts  — Single source of truth for auth state.
//
// All components that previously imported useAuthStore from userStore.ts now
// work correctly because userStore.ts re-exports this store directly.
//
// Compatibility fields added so every import pattern keeps working:
//   isLoading        – boolean, derived from status via dset()
//   isAuthenticated  – boolean, derived from status via dset()
//   clearAuth()      – alias for signOut()
//   setProfile()     – direct profile state patch (local-only)
//   setUser()        – direct user state patch (local-only)
//   setIsLoading()   – no-op (status is the source of truth)
//   updateProfile()  – local-only patch for UI-level updates
// ─────────────────────────────────────────────────────────────────────────────

import { create }            from "zustand";
import { devtools, persist } from "zustand/middleware";
import { immer }             from "zustand/middleware/immer";
import posthog               from "posthog-js";
import { supabase }          from "@/lib/supabase/client";
import { useOverlayStore }   from "@/store/overlayStore";
import {
  loadBYOKVault,
  saveBYOKVault,
  clearBYOKVault,
} from "@/lib/security/byokVault";

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
  // Core
  status:          AuthStatus;
  session:         SupabaseSession | null;
  user:            SupabaseUser    | null;
  profile:         ProfileRow      | null;
  isProfileLoaded: boolean;
  byokKeys:        BYOKKeys;
  error:           string | null;
  isAdmin:         boolean;
  isOnboarded:     boolean;
  planId:          string;
  credits:         number;

  // Derived (auto-synced with status via dset)
  isLoading:       boolean;
  isAuthenticated: boolean;
}

export interface AuthActions {
  // Lifecycle
  initialize:        () => Promise<void>;

  // Auth actions
  signInWithEmail:   (email: string, password: string) => Promise<void>;
  signUpWithEmail:   (email: string, password: string, fullName: string) => Promise<void>;
  signInWithOAuth:   (provider: AuthProvider) => Promise<void>;
  signOut:           () => Promise<void>;
  clearAuth:         () => Promise<void>;      // alias for signOut
  sendPasswordReset: (email: string) => Promise<void>;
  updatePassword:    (newPassword: string) => Promise<void>;

  // Profile
  loadProfile:    () => Promise<void>;
  updateProfile:  (updates: Partial<ProfileRow>) => Promise<void>;
  setProfile:     (profile: ProfileRow | null) => void;
  refreshCredits: () => Promise<void>;

  // BYOK
  setBYOKKey:  (provider: keyof BYOKKeys, key: string) => void;
  clearBYOKKey:(provider: keyof BYOKKeys) => void;

  // Internal setters (used by compatibility layer / hooks)
  setUser:      (user: SupabaseUser | null) => void;
  setSession:   (session: SupabaseSession | null) => void;
  setError:     (error: string | null) => void;
  setIsLoading: (loading: boolean) => void;  // no-op – status is source of truth
  reset:        () => void;
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
  // Derived
  isLoading:       true,   // "idle" counts as loading
  isAuthenticated: false,
};

// ─── Prevents listener leaks & React StrictMode doubles ──────────────────────
let _unsubAuthListener: (() => void) | null = null;

// ─── Store ────────────────────────────────────────────────────────────────────

export const useAuthStore = create<AuthStore>()(
  devtools(
    persist(
      immer((_set, get) => {
        // ── dset: wraps every mutation to auto-derive isLoading / isAuthenticated ──
        //    This is the key fix: derived booleans live in actual Zustand state, so
        //    components reading them never trigger a new-object comparison loop.
        const dset = (recipe: (draft: AuthStore) => void) =>
          _set((draft) => {
            recipe(draft);
            draft.isLoading       = draft.status === "idle" || draft.status === "loading";
            draft.isAuthenticated = draft.status === "authenticated";
          });

        return {
          ...INITIAL_STATE,

          // ── Session Init ──────────────────────────────────────────────────

          initialize: async () => {
            if (_unsubAuthListener) {
              _unsubAuthListener();
              _unsubAuthListener = null;
            }

            dset((s) => { s.status = "loading"; });

            // Hydrate BYOK keys from encrypted local vault (WebCrypto).
            // These never touch the server / DB; they're attached per-request
            // by apiClient as x-byok-* headers.
            try {
              const vault = await loadBYOKVault();
              if (Object.keys(vault).length > 0) {
                _set((s) => { s.byokKeys = vault; });
              }
            } catch (e) {
              console.warn("[authStore] BYOK vault hydration failed:", e);
            }

            try {
              const { data: { session }, error } = await supabase.auth.getSession();
              if (error) throw error;

              if (session) {
                dset((s) => {
                  s.session = session as unknown as SupabaseSession;
                  s.user    = session.user as unknown as SupabaseUser;
                });
                await get().loadProfile();
                dset((s) => { s.status = "authenticated"; });

                // Identify returning user with PostHog (was only fired on SIGNED_IN
                // event, which never runs for users restored from an existing session).
                if (import.meta.env.VITE_POSTHOG_KEY) {
                  try {
                    posthog.identify(session.user.id, { email: session.user.email });
                  } catch { /* posthog not loaded — safe to skip */ }
                }
              } else {
                dset((s) => { s.status = "unauthenticated"; });
              }
            } catch (err) {
              dset((s) => {
                s.status = "error";
                s.error  = (err as Error).message;
              });
            }

            // Single listener — owned by this store
            const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
              if (event === "SIGNED_IN" && session) {
                dset((s) => {
                  s.session = session as unknown as SupabaseSession;
                  s.user    = session.user as unknown as SupabaseUser;
                });
                await get().loadProfile();
                dset((s) => { s.status = "authenticated"; });

                if (import.meta.env.VITE_POSTHOG_KEY) {
                  posthog.identify(session.user.id, { email: session.user.email });
                }
              }

              if (event === "SIGNED_OUT") {
                if (import.meta.env.VITE_POSTHOG_KEY) posthog.reset();
                get().reset();
              }

              if (event === "TOKEN_REFRESHED" && session) {
                dset((s) => { s.session = session as unknown as SupabaseSession; });
              }

              if (event === "USER_UPDATED" && session) {
                await get().loadProfile();
              }

              if (event === "PASSWORD_RECOVERY") {
                dset((s) => { s.status = "authenticated"; });
              }
            });

            _unsubAuthListener = () => data.subscription.unsubscribe();
          },

          // ── Sign In ───────────────────────────────────────────────────────

          signInWithEmail: async (email, password) => {
            dset((s) => { s.status = "loading"; s.error = null; });

            const { data, error } = await supabase.auth.signInWithPassword({ email, password });

            if (error) {
              dset((s) => { s.status = "error"; s.error = error.message; });
              throw error;
            }

            dset((s) => {
              s.session = data.session as unknown as SupabaseSession;
              s.user    = data.user    as unknown as SupabaseUser;
              s.status  = "authenticated";
            });

            await get().loadProfile();
          },

          // ── Sign Up ───────────────────────────────────────────────────────

          signUpWithEmail: async (email, password, fullName) => {
            dset((s) => { s.status = "loading"; s.error = null; });

            const { data, error } = await supabase.auth.signUp({
              email,
              password,
              options: { data: { full_name: fullName } },
            });

            if (error) {
              dset((s) => { s.status = "error"; s.error = error.message; });
              throw error;
            }

            if (data.session) {
              dset((s) => {
                s.session = data.session as unknown as SupabaseSession;
                s.user    = data.user    as unknown as SupabaseUser;
                s.status  = "authenticated";
              });
              await get().loadProfile();
            } else {
              dset((s) => { s.status = "unauthenticated"; });
            }
          },

          // ── OAuth ─────────────────────────────────────────────────────────

          signInWithOAuth: async (provider) => {
            dset((s) => { s.status = "loading"; s.error = null; });

            const { error } = await supabase.auth.signInWithOAuth({
              provider: provider as "google" | "github" | "linkedin_oidc" | "azure",
              options: { redirectTo: `${window.location.origin}/auth/callback` },
            });

            if (error) {
              dset((s) => { s.status = "error"; s.error = error.message; });
              throw error;
            }
          },

          // ── Sign Out ──────────────────────────────────────────────────────

          signOut: async () => {
            dset((s) => { s.status = "loading"; });
            await supabase.auth.signOut();
            // Wipe BYOK vault on sign-out — protects shared devices.
            try { clearBYOKVault(); } catch { /* localStorage unavailable */ }
            get().reset();
          },

          clearAuth: async () => {
            await get().signOut();
          },

          // ── Password ──────────────────────────────────────────────────────

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

          // ── Profile ───────────────────────────────────────────────────────

          loadProfile: async () => {
            const userId = get().user?.id;
            if (!userId) return;

            const [profileRes, roleRes] = await Promise.all([
              supabase.from("profiles").select("*").eq("id", userId).single(),
              supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
            ]);

            if (profileRes.error || !profileRes.data) {
              console.error("[authStore] Failed to load profile:", profileRes.error?.message);
              return;
            }

            const row = profileRes.data as Record<string, unknown>;
            const hasAdminRole = !!roleRes.data;

            _set((s) => {
              s.profile         = profileRes.data as unknown as ProfileRow;
              s.isProfileLoaded = true;
              s.isAdmin         = hasAdminRole;
              s.isOnboarded     = (row.onboarding_completed as boolean) ?? false;
              s.planId          = (row.plan_id              as string)  ?? "free";
              s.credits         = (row.credits              as number)  ?? 0;
            });

            // FIX Issue 3: seed overlay store from profile settings
            try {
              const overlay = useOverlayStore.getState();
              const opacity = row.overlay_opacity as number | undefined;
              if (opacity != null) overlay.setStealthOpacity(opacity);
              const pos = row.overlay_position as string | undefined;
              if (pos) {
                const parsed = JSON.parse(pos);
                if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
                  overlay.setPosition({ x: parsed.x, y: parsed.y });
                }
              }
            } catch { /* overlay store not ready yet — safe to skip */ }
          },

          updateProfile: async (updates) => {
            const userId = get().user?.id;
            if (!userId) throw new Error("Not authenticated.");

            const { data, error } = await supabase
              .from("profiles")
              .update({ ...updates, updated_at: new Date().toISOString() } as any)
              .eq("id", userId)
              .select()
              .single();

            if (error) throw error;

            _set((s) => {
              s.profile = data as unknown as ProfileRow;
              if ("plan_id" in updates) s.planId  = (updates as any).plan_id as string;
              if ("credits" in updates) s.credits = updates.credits as number;
            });
          },

          setProfile: (profile) => {
            _set((s) => { s.profile = profile; });
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
              _set((s) => {
                s.credits = (data as Record<string, unknown>).credits as number ?? s.credits;
                if (s.profile) s.profile.credits = s.credits;
              });
            }
          },

          // ── BYOK ──────────────────────────────────────────────────────────
          // Keys live in encrypted localStorage (WebCrypto AES-GCM).
          // The device key never leaves the browser. Edge functions receive
          // them as `x-byok-*` headers per request and prefer them over
          // server-side fallback keys.

          setBYOKKey: (provider, key) => {
            _set((s) => { s.byokKeys[provider] = key; });
            // Fire-and-forget persist; UI surfaces failures via toast in SettingsBYOK
            void saveBYOKVault({ ...get().byokKeys, [provider]: key }).catch((e) =>
              console.error("[authStore] BYOK persist failed:", e),
            );
          },

          clearBYOKKey: (provider) => {
            _set((s) => { delete s.byokKeys[provider]; });
            const next = { ...get().byokKeys };
            delete next[provider];
            void saveBYOKVault(next).catch((e) =>
              console.error("[authStore] BYOK clear failed:", e),
            );
          },

          // ── Internal setters ──────────────────────────────────────────────

          setUser: (user) => {
            _set((s) => { s.user = user; });
          },

          setSession: (session) => {
            dset((s) => {
              s.session = session;
              s.user    = session?.user as unknown as SupabaseUser ?? null;
              s.status  = session ? "authenticated" : "unauthenticated";
            });
          },

          setError: (error) => { _set((s) => { s.error = error; }); },

          setIsLoading: (_loading) => { /* no-op — status is the source of truth */ },

          reset: () => {
            dset((s) => {
              Object.assign(s, INITIAL_STATE);
              s.status        = "unauthenticated";
              s.isLoading     = false;
              s.isAuthenticated = false;
              s.byokKeys      = {};
            });
          },
        };
      }),
      {
        name: "clarify-auth-v1",
        // ─────────────────────────────────────────────────────────────────
        // SECURITY: Persist ONLY non-privileged UI hint flags.
        //
        // Never persist:
        //   • session / user / access tokens  (Supabase manages its own
        //     httpOnly-equivalent storage — we MUST NOT duplicate JWTs)
        //   • isAdmin   — privilege escalation risk if attacker edits
        //                 localStorage. Always re-derived on loadProfile()
        //                 from the user_roles table via has_role().
        //   • planId    — billing privilege; must be re-fetched from DB
        //                 on every load to prevent feature-gate spoofing.
        //   • byokKeys  — user API keys; never written to plaintext storage.
        //                 Kept in-memory only for the active tab session.
        //
        // isOnboarded is the only persisted hint — it's purely cosmetic
        // (skips an onboarding redirect flash) and is re-validated against
        // profiles.onboarding_completed on every loadProfile() call.
        // ─────────────────────────────────────────────────────────────────
        // Persist ONLY isOnboarded. byokKeys MUST stay in-memory (security).
        partialize: (s) => ({
          isOnboarded: s.isOnboarded,
        }),
      }
    ),
    { name: "AuthStore" }
  )
);

// ─── Selectors ────────────────────────────────────────────────────────────────

export const selectIsAuthenticated    = (s: AuthStore) => s.isAuthenticated;
export const selectIsLoading          = (s: AuthStore) => s.isLoading;
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
