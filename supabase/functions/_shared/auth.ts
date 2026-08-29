// supabase/functions/_shared/auth.ts
//
// Shared authentication and authorization utilities for Supabase Edge Functions.
//
// SECURITY PURPOSE:
// - Verify JWT access tokens using Supabase Auth
// - Extract the authenticated user from requests
// - Provide consistent 401 and 403 responses
// - Centralize ownership/admin checks
// - Prevent every Edge Function from implementing auth differently
//
// REQUIRED ENV SECRETS:
// - SUPABASE_URL
// - SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY
//
// IMPORTANT:
// Use service role only for trusted server-side authorization checks.
// Never expose SUPABASE_SERVICE_ROLE_KEY to frontend code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { bannedResponse, isUserBanned } from "./banCheck.ts";
import { isBillingPastDue, isPastDueAllowedPath, pastDueResponse, resolveCanonicalBillingStatus } from "./billingPastDue.ts";
import { getCorsHeaders } from "./cors.ts";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
  role: string | null;
  aud: string | null;
};

export type AuthContext = {
  user: AuthenticatedUser;
  accessToken: string;
};

/** Matches public.app_role enum: admin | moderator | user. */
export type UserRole = "user" | "admin" | "moderator";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

function assertRequiredEnv(): void {
  const missing: string[] = [];

  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SUPABASE_ANON_KEY) missing.push("SUPABASE_ANON_KEY");
  if (!SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  if (missing.length > 0) {
    throw new Error(`[auth] Missing required environment variables: ${missing.join(", ")}`);
  }
}

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  extraHeaders: Record<string, string> = {}
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

/**
 * Standard 401 Unauthorized response.
 */
export function unauthorizedResponse(message = "Unauthorized.", req?: Request): Response {
  return jsonResponse(
    {
      error: message,
      code: "UNAUTHORIZED",
    },
    401,
    req ? getCorsHeaders(req) : {}
  );
}

/**
 * Standard 403 Forbidden response.
 */
export function forbiddenResponse(message = "Forbidden.", req?: Request): Response {
  return jsonResponse(
    {
      error: message,
      code: "FORBIDDEN",
    },
    403,
    req ? getCorsHeaders(req) : {}
  );
}

/**
 * Extracts Bearer token from Authorization header.
 */
export function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");

  if (!authHeader) {
    return null;
  }

  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token || token.trim().length === 0) {
    return null;
  }

  return token.trim();
}

/**
 * Creates a Supabase client scoped to the user's JWT.
 *
 * Use this when you want RLS policies to apply.
 */
export function createUserScopedClient(accessToken: string) {
  assertRequiredEnv();

  return createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Creates a trusted service role Supabase client.
 *
 * Use only inside Edge Functions for server-side authorization checks.
 */
export function createServiceRoleClient() {
  assertRequiredEnv();

  return createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

/**
 * Verifies the incoming request JWT using Supabase Auth.
 *
 * Throws an error if token is missing or invalid.
 * Banned users throw with code ACCOUNT_BANNED (caught by getAuthContext).
 */
export async function requireAuth(req: Request): Promise<AuthContext> {
  const accessToken = extractBearerToken(req);

  if (!accessToken) {
    const authError = new Error("AUTH_REQUIRED");
    authError.name = "AuthRequiredError";
    throw authError;
  }

  // Never treat the anon/publishable key as a user JWT (client fallback when logged out).
  // Align with utils.ts: anon key → AUTH_REQUIRED (not a valid user session).
  if (accessToken === SUPABASE_ANON_KEY) {
    const authError = new Error("AUTH_REQUIRED");
    authError.name = "AuthRequiredError";
    throw authError;
  }

  const supabase = createUserScopedClient(accessToken);

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    const msg = `${error?.message ?? ""} ${error?.status ?? ""}`.toLowerCase();
    const expired =
      msg.includes("expired") ||
      msg.includes("session_not_found") ||
      error?.name === "AuthSessionMissingError";
    const authError = new Error(expired ? "AUTH_EXPIRED" : "AUTH_INVALID");
    authError.name = expired ? "AuthExpiredError" : "AuthInvalidError";
    throw authError;
  }

  const admin = createServiceRoleClient();
  if (await isUserBanned(admin, data.user.id)) {
    const banError = new Error("ACCOUNT_BANNED");
    banError.name = "AccountBannedError";
    throw banError;
  }

  if (!isPastDueAllowedPath(req)) {
    const { data: billing, error: billingError } = await admin
      .from("profiles")
      .select("subscription_status, payment_failed_at")
      .eq("id", data.user.id)
      .maybeSingle();
    const { data: subRow, error: subscriptionError } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", data.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (billingError || subscriptionError) {
      console.error("[auth] Billing authorization lookup failed:", {
        billing: billingError?.message,
        subscription: subscriptionError?.message,
      });
      const dependencyError = new Error("Authorization dependency unavailable.");
      dependencyError.name = "DependencyUnavailableError";
      throw dependencyError;
    }
    const effectiveStatus = resolveCanonicalBillingStatus(
      billing?.subscription_status,
      (subRow as { status?: string } | null)?.status,
    );
    if (isBillingPastDue({
      subscription_status: effectiveStatus,
      payment_failed_at: billing?.payment_failed_at,
    })) {
      const dueError = new Error("BILLING_PAST_DUE");
      dueError.name = "BillingPastDueError";
      throw dueError;
    }
  }

  return {
    accessToken,
    user: {
      id: data.user.id,
      email: data.user.email ?? null,
      role: data.user.role ?? null,
      aud: data.user.aud ?? null,
    },
  };
}

/**
 * Safe auth wrapper.
 *
 * Use this when you want a Response instead of throwing.
 */
export async function getAuthContext(
  req: Request
): Promise<{ context: AuthContext; error: null } | { context: null; error: Response }> {
  try {
    const context = await requireAuth(req);

    return {
      context,
      error: null,
    };
  } catch (err) {
    if (
      err instanceof Error &&
      (err.name === "AccountBannedError" || err.message === "ACCOUNT_BANNED")
    ) {
      return {
        context: null,
        error: bannedResponse(getCorsHeaders(req)),
      };
    }
    if (
      err instanceof Error &&
      (err.name === "AuthExpiredError" || err.message === "AUTH_EXPIRED")
    ) {
      return {
        context: null,
        error: jsonResponse(
          {
            error: "Session expired. Please sign in again.",
            code: "AUTH_EXPIRED",
          },
          401,
          getCorsHeaders(req),
        ),
      };
    }
    if (
      err instanceof Error &&
      (err.name === "AuthInvalidError" || err.message === "AUTH_INVALID")
    ) {
      return {
        context: null,
        error: jsonResponse(
          {
            error: "Invalid or expired token",
            code: "AUTH_INVALID",
          },
          401,
          getCorsHeaders(req),
        ),
      };
    }
    if (
      err instanceof Error &&
      (err.name === "AuthRequiredError" || err.message === "AUTH_REQUIRED")
    ) {
      return {
        context: null,
        error: jsonResponse(
          {
            error: "Missing or invalid Authorization header",
            code: "AUTH_REQUIRED",
          },
          401,
          getCorsHeaders(req),
        ),
      };
    }
    if (
      err instanceof Error &&
      (err.name === "BillingPastDueError" || err.message === "BILLING_PAST_DUE")
    ) {
      return {
        context: null,
        error: pastDueResponse(getCorsHeaders(req)),
      };
    }
    if (err instanceof Error && err.name === "DependencyUnavailableError") {
      return {
        context: null,
        error: jsonResponse(
          {
            error: "Authorization service temporarily unavailable. Please try again.",
            code: "AUTH_DEPENDENCY_UNAVAILABLE",
          },
          503,
          getCorsHeaders(req),
        ),
      };
    }
    return {
      context: null,
      error: unauthorizedResponse("Unauthorized.", req),
    };
  }
}

/**
 * Checks if a user has a role in user_roles table.
 *
 * Expected table shape:
 * user_roles:
 * - user_id uuid
 * - role text
 */
export async function userHasRole(userId: string, role: UserRole): Promise<boolean> {
  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", role)
    .maybeSingle();

  if (error) {
    console.error("[auth] Failed to check user role:", error.message);
    return false;
  }

  return Boolean(data);
}

/**
 * Checks if a user has the admin role (app_role = 'admin' only).
 */
export async function isAdmin(userId: string): Promise<boolean> {
  return userHasRole(userId, "admin");
}

export async function isModerator(userId: string): Promise<boolean> {
  return userHasRole(userId, "moderator");
}

export async function isStaff(userId: string): Promise<boolean> {
  return (await isAdmin(userId)) || (await isModerator(userId));
}

export async function requireModerator(userId: string): Promise<void> {
  const allowed = await isModerator(userId);
  if (!allowed) {
    throw new Error("Moderator role required.");
  }
}

export async function requireStaff(userId: string): Promise<void> {
  const allowed = await isStaff(userId);
  if (!allowed) {
    throw new Error("Staff role required.");
  }
}

export async function enforceStaff(userId: string, req?: Request): Promise<Response | null> {
  try {
    await requireStaff(userId);
    return null;
  } catch {
    return forbiddenResponse("Staff access required.", req);
  }
}

/** Resolve consumer plan_id from profiles (server-side only). */
export async function resolveUserPlanId(userId: string): Promise<string> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("plan_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] resolveUserPlanId failed:", error.message);
    return "free";
  }

  return String(data?.plan_id ?? "free");
}

/**
 * Standard 403 when onboarding is incomplete.
 */
export function onboardingRequiredResponse(req?: Request): Response {
  return jsonResponse(
    {
      error: "Complete onboarding before using this feature.",
      code: "ONBOARDING_REQUIRED",
    },
    403,
    req ? getCorsHeaders(req) : {},
  );
}

/**
 * Server-side onboarding gate for protected Edge capabilities.
 */
export async function requireOnboardingComplete(
  userId: string,
  req?: Request,
): Promise<Response | null> {
  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("onboarding_completed")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    console.error("[auth] onboarding check failed:", error.message);
    const dependencyError = new Error("Authorization dependency unavailable.");
    dependencyError.name = "DependencyUnavailableError";
    throw dependencyError;
  }

  if (!data?.onboarding_completed) {
    return onboardingRequiredResponse(req);
  }

  return null;
}

/**
 * Requires admin role.
 *
 * Throws if user is not admin.
 */
export async function requireAdmin(userId: string): Promise<void> {
  const allowed = await isAdmin(userId);

  if (!allowed) {
    throw new Error("Admin role required.");
  }
}

/**
 * Safe admin wrapper.
 *
 * Returns a 403 response if user is not admin.
 */
export async function enforceAdmin(userId: string, req?: Request): Promise<Response | null> {
  try {
    await requireAdmin(userId);
    return null;
  } catch {
    return forbiddenResponse("Admin access required.", req);
  }
}

/**
 * Requires the authenticated user to own the requested resource.
 *
 * If user is admin, ownership check is bypassed.
 */
export async function requireOwnershipOrAdmin(
  authenticatedUserId: string,
  resourceOwnerId: string
): Promise<void> {
  if (!authenticatedUserId || !resourceOwnerId) {
    throw new Error("Missing ownership identifiers.");
  }

  if (authenticatedUserId === resourceOwnerId) {
    return;
  }

  const allowed = await isAdmin(authenticatedUserId);

  if (!allowed) {
    throw new Error("Resource ownership required.");
  }
}

/**
 * Safe ownership/admin wrapper.
 */
export async function enforceOwnershipOrAdmin(
  authenticatedUserId: string,
  resourceOwnerId: string
): Promise<Response | null> {
  try {
    await requireOwnershipOrAdmin(authenticatedUserId, resourceOwnerId);
    return null;
  } catch {
    return forbiddenResponse("You do not have permission to access this resource.");
  }
}

/**
 * Checks ownership against a database table.
 *
 * Example:
 * await requireResourceOwnership({
 *   table: "sessions",
 *   resourceId: sessionId,
 *   resourceIdColumn: "id",
 *   ownerColumn: "user_id",
 *   authenticatedUserId: user.id,
 * });
 */
export async function requireResourceOwnership(options: {
  table: string;
  resourceId: string;
  resourceIdColumn?: string;
  ownerColumn?: string;
  authenticatedUserId: string;
}): Promise<void> {
  const {
    table,
    resourceId,
    resourceIdColumn = "id",
    ownerColumn = "user_id",
    authenticatedUserId,
  } = options;

  const supabase = createServiceRoleClient();

  const { data, error } = await supabase
    .from(table)
    .select(ownerColumn)
    .eq(resourceIdColumn, resourceId)
    .maybeSingle();

  if (error) {
    console.error("[auth] Failed to verify resource ownership:", error.message);
    throw new Error("Failed to verify resource ownership.");
  }

  if (!data) {
    throw new Error("Resource not found.");
  }

  const ownerId = data[ownerColumn] as string | undefined;

  if (!ownerId) {
    throw new Error("Resource owner not found.");
  }

  await requireOwnershipOrAdmin(authenticatedUserId, ownerId);
}

/**
 * Safe resource ownership wrapper.
 */
export async function enforceResourceOwnership(options: {
  table: string;
  resourceId: string;
  resourceIdColumn?: string;
  ownerColumn?: string;
  authenticatedUserId: string;
}): Promise<Response | null> {
  try {
    await requireResourceOwnership(options);
    return null;
  } catch {
    return forbiddenResponse("You do not have permission to access this resource.");
  }
}

/**
 * Extracts client IP from common reverse proxy headers.
 */
export function getClientIp(req: Request): string | null {
  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    return forwardedFor.split(",")[0]?.trim() ?? null;
  }

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp;

  return null;
}

/**
 * Extracts user agent.
 */
export function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent");
}

/**
 * Convenience helper for common Edge Function auth pattern.
 *
 * Usage:
 * const auth = await authenticateRequest(req);
 * if (auth.error) return auth.error;
 * const { user } = auth.context;
 */
export async function authenticateRequest(
  req: Request
): Promise<{ context: AuthContext; error: null } | { context: null; error: Response }> {
  return getAuthContext(req);
}
