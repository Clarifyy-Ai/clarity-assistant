import { describe, expect, it } from "vitest";

/**
 * M5: Documents that bulk_update_users is GRANTed to authenticated but MUST
 * fail closed unless has_role(auth.uid(), 'admin') — mirrors the SQL guard in
 * supabase/migrations/20260430204228_*.sql:
 *
 *   IF NOT public.has_role(auth.uid(),'admin') THEN
 *     RAISE EXCEPTION 'Admin only';
 *   END IF;
 *
 * Client-side code should never call this RPC without an admin check; the
 * server SQL check is the source of truth.
 */

type Role = "admin" | "user" | "moderator" | null;

function assertBulkUpdateUsersAllowed(callerRole: Role): void {
  if (callerRole !== "admin") {
    throw new Error("Admin only");
  }
}

/** Client-side guard pattern before invoking bulk_update_users RPC. */
function canInvokeBulkUpdateUsers(opts: {
  isAuthenticated: boolean;
  isAdmin: boolean;
}): boolean {
  return opts.isAuthenticated && opts.isAdmin;
}

describe("bulk_update_users admin gate (M5)", () => {
  it("SQL-pattern guard raises for non-admin roles", () => {
    expect(() => assertBulkUpdateUsersAllowed("user")).toThrow("Admin only");
    expect(() => assertBulkUpdateUsersAllowed("moderator")).toThrow("Admin only");
    expect(() => assertBulkUpdateUsersAllowed(null)).toThrow("Admin only");
  });

  it("SQL-pattern guard allows admin", () => {
    expect(() => assertBulkUpdateUsersAllowed("admin")).not.toThrow();
  });

  it("client-side guard requires authenticated admin", () => {
    expect(canInvokeBulkUpdateUsers({ isAuthenticated: true, isAdmin: true })).toBe(true);
    expect(canInvokeBulkUpdateUsers({ isAuthenticated: true, isAdmin: false })).toBe(false);
    expect(canInvokeBulkUpdateUsers({ isAuthenticated: false, isAdmin: true })).toBe(false);
  });
});
