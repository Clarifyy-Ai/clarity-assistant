// ─────────────────────────────────────────────────────────────────────────────
// auth.ts — High-level auth helpers built on top of the Supabase client.
// All auth operations in the app go through here — never call supabase.auth
// directly from components or hooks.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase/client";
import { AuthError, ErrorCode, tryCatch } from "@/lib/errors";
import type { User, Session, AuthChangeEvent } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SignUpCredentials {
  email:     string;
  password:  string;
  fullName?: string;
  avatarUrl?: string;
}

export interface SignInCredentials {
  email:    string;
  password: string;
}

export type OAuthProvider = "google" | "github" | "linkedin_oidc";

export interface AuthResult {
  user:    User | null;
  session: Session | null;
}

export interface ResetPasswordResult {
  success: boolean;
  message: string;
}

// ─── Session ──────────────────────────────────────────────────────────────────

/**
 * Get the current active session.
 * Returns null if the user is not authenticated.
 */
export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  return data.session;
}

/**
 * Get the currently authenticated user.
 * Returns null if not authenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error) return null;
  return data.user;
}

/**
 * Get the current user's ID.
 * Throws AuthError if not authenticated.
 */
export async function requireUserId(): Promise<string> {
  const user = await getCurrentUser();
  if (!user) {
    throw new AuthError(
      "You must be signed in to perform this action.",
      ErrorCode.AUTH_NOT_AUTHENTICATED
    );
  }
  return user.id;
}

/**
 * Check if the user is currently authenticated.
 */
export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession();
  return session !== null;
}

// ─── Sign Up ──────────────────────────────────────────────────────────────────

/**
 * Create a new account with email + password.
 * Sends a verification email automatically via Supabase.
 */
export async function signUp(credentials: SignUpCredentials): Promise<AuthResult> {
  const { email, password, fullName, avatarUrl } = credentials;

  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name:  fullName  ?? "",
          avatar_url: avatarUrl ?? "",
        },
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });

    if (error) throw error;
    return data;
  });

  if (err) {
    throw new AuthError(
      err.message ?? "Sign up failed. Please try again.",
      ErrorCode.AUTH_SIGNUP_FAILED,
      { email }
    );
  }

  return { user: data?.user ?? null, session: data?.session ?? null };
}

// ─── Sign In ──────────────────────────────────────────────────────────────────

/**
 * Sign in with email + password.
 */
export async function signIn(credentials: SignInCredentials): Promise<AuthResult> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    return data;
  });

  if (err) {
    const isInvalidCreds =
      err.message?.toLowerCase().includes("invalid") ||
      err.message?.toLowerCase().includes("credentials");

    throw new AuthError(
      isInvalidCreds
        ? "Incorrect email or password."
        : (err.message ?? "Sign in failed."),
      isInvalidCreds
        ? ErrorCode.AUTH_INVALID_CREDENTIALS
        : ErrorCode.AUTH_NOT_AUTHENTICATED,
      { email: credentials.email }
    );
  }

  return { user: data?.user ?? null, session: data?.session ?? null };
}

// ─── OAuth ────────────────────────────────────────────────────────────────────

/**
 * Sign in with an OAuth provider (Google, GitHub, LinkedIn).
 * Redirects the browser — no return value needed.
 */
export async function signInWithOAuth(provider: OAuthProvider): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: {
          access_type: "offline",
          prompt: "consent",
        },
      },
    });
    if (error) throw error;
  });

  if (err) {
    throw new AuthError(
      `OAuth sign in with ${provider} failed.`,
      ErrorCode.AUTH_OAUTH_FAILED,
      { provider }
    );
  }
}

// ─── Magic Link ───────────────────────────────────────────────────────────────

/**
 * Send a magic link to the user's email.
 */
export async function sendMagicLink(email: string): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) throw error;
  });

  if (err) {
    throw new AuthError(
      "Failed to send magic link. Please try again.",
      ErrorCode.AUTH_SIGNUP_FAILED,
      { email }
    );
  }
}

// ─── Password Reset ───────────────────────────────────────────────────────────

/**
 * Send a password reset email.
 */
export async function sendPasswordReset(email: string): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    });
    if (error) throw error;
  });

  if (err) {
    throw new AuthError(
      "Failed to send password reset email.",
      ErrorCode.AUTH_PASSWORD_RESET_FAILED,
      { email }
    );
  }
}

/**
 * Update the user's password after clicking the reset link.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  });

  if (err) {
    throw new AuthError(
      "Failed to update password.",
      ErrorCode.AUTH_PASSWORD_RESET_FAILED
    );
  }
}

// ─── Sign Out ─────────────────────────────────────────────────────────────────

/**
 * Sign out the current user and clear the local session.
 */
export async function signOut(): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  });

  if (err) {
    // Even if server-side sign-out fails, clear local storage
    try { localStorage.clear(); } catch {}
    console.warn("[auth] Sign out error (session cleared locally):", err.message);
  }
}

// ─── Profile Update ───────────────────────────────────────────────────────────

/**
 * Update the authenticated user's metadata.
 */
export async function updateUserProfile(updates: {
  fullName?:  string;
  avatarUrl?: string;
  email?:     string;
  data?:      Record<string, unknown>;
}): Promise<User> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await supabase.auth.updateUser({
      email: updates.email,
      data:  {
        full_name:  updates.fullName,
        avatar_url: updates.avatarUrl,
        ...updates.data,
      },
    });
    if (error) throw error;
    return data.user;
  });

  if (err || !data) {
    throw new AuthError(
      "Failed to update profile.",
      ErrorCode.AUTH_NOT_AUTHENTICATED
    );
  }

  return data;
}

// ─── Email Verification ───────────────────────────────────────────────────────

/**
 * Resend the email verification link.
 */
export async function resendVerificationEmail(email: string): Promise<void> {
  const [, err] = await tryCatch(async () => {
    const { error } = await supabase.auth.resend({
      type:  "signup",
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/verify-email`,
      },
    });
    if (error) throw error;
  });

  if (err) {
    throw new AuthError(
      "Failed to resend verification email.",
      ErrorCode.AUTH_EMAIL_NOT_VERIFIED,
      { email }
    );
  }
}

/**
 * Check if the current user's email is verified.
 */
export async function isEmailVerified(): Promise<boolean> {
  const user = await getCurrentUser();
  return user?.email_confirmed_at !== null && user?.email_confirmed_at !== undefined;
}

// ─── Auth State Listener ──────────────────────────────────────────────────────

/**
 * Subscribe to auth state changes (sign in, sign out, token refresh, etc.)
 * Returns an unsubscribe function — call it on cleanup.
 *
 * @example
 * const unsubscribe = onAuthStateChange((event, session) => {
 *   if (event === "SIGNED_IN") setUser(session?.user ?? null);
 *   if (event === "SIGNED_OUT") setUser(null);
 * });
 * return () => unsubscribe();
 */
export function onAuthStateChange(
  callback: (event: AuthChangeEvent, session: Session | null) => void
): () => void {
  const { data } = supabase.auth.onAuthStateChange(callback);
  return () => data.subscription.unsubscribe();
}

// ─── Token Helpers ────────────────────────────────────────────────────────────

/**
 * Get the current access token for API calls.
 */
export async function getAccessToken(): Promise<string | null> {
  const session = await getSession();
  return session?.access_token ?? null;
}

/**
 * Force a session refresh — use when token is close to expiry.
 */
export async function refreshSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error) return null;
  return data.session;
}
