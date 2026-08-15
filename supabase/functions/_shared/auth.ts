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

export type UserRole = "user" | "admin" | "super_admin";

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
export function unauthorizedResponse(message = "Unauthorized."): Response {
  return jsonResponse(
    {
      error: message,
      code: "UNAUTHORIZED",
    },
    401
  );
}

/**
 * Standard 403 Forbidden response.
 */
export function forbiddenResponse(message = "Forbidden."): Response {
  return jsonResponse(
    {
      error: message,
      code: "FORBIDDEN",
    },
    403
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
    throw new Error("Missing or invalid Authorization header.");
  }

  const supabase = createUserScopedClient(accessToken);

  const { data, error } = await supabase.auth.getUser(accessToken);

  if (error || !data.user) {
    throw new Error("Invalid or expired access token.");
  }

  const admin = createServiceRoleClient();
  if (await isUserBanned(admin, data.user.id)) {
    const banError = new Error("ACCOUNT_BANNED");
    banError.name = "AccountBannedError";
    throw banError;
  }

  if (!isPastDueAllowedPath(req)) {
    const { data: billing } = await admin
      .from("profiles")
      .select("subscription_status, payment_failed_at")
      .eq("id", data.user.id)
      .maybeSingle();
    const { data: subRow } = await admin
      .from("subscriptions")
      .select("status")
      .eq("user_id", data.user.id)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
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
        error: bannedResponse({}),
      };
    }
    if (
      err instanceof Error &&
      (err.name === "BillingPastDueError" || err.message === "BILLING_PAST_DUE")
    ) {
      return {
        context: null,
        error: pastDueResponse({}),
      };
    }
    return {
      context: null,
      error: unauthorizedResponse(),
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
 * Checks if a user is admin or super_admin.
 */
export async function isAdmin(userId: string): Promise<boolean> {
  const [admin, superAdmin] = await Promise.all([
    userHasRole(userId, "admin"),
    userHasRole(userId, "super_admin"),
  ]);

  return admin || superAdmin;
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
export async function enforceAdmin(userId: string): Promise<Response | null> {
  try {
    await requireAdmin(userId);
    return null;
  } catch {
    return forbiddenResponse("Admin access required.");
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
