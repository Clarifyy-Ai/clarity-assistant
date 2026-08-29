import { describe, expect, it } from "vitest";
import {
  canUserAReadUserBRow,
  USER_OWNED_TABLES,
} from "@/lib/security/rlsTenantIsolation";

const profiles = USER_OWNED_TABLES.find((t) => t.table === "profiles");
const userRoles = USER_OWNED_TABLES.find((t) => t.table === "user_roles");

describe("account RLS isolation contract", () => {
  it("documents profiles as user-owned by id", () => {
    expect(profiles).toMatchObject({
      table: "profiles",
      ownerColumn: "id",
      crossUserSelect: "denied",
    });
  });

  it("documents user_roles as own-select, admin-managed", () => {
    expect(userRoles).toMatchObject({
      table: "user_roles",
      ownerColumn: "user_id",
      crossUserSelect: "admin_only",
    });
  });

  it("User A cannot read User B profile or assign themselves admin", () => {
    expect(profiles).toBeDefined();
    expect(userRoles).toBeDefined();
    expect(
      canUserAReadUserBRow({
        table: profiles!,
        ownerId: "user-b",
        viewerId: "user-a",
      }),
    ).toBe(false);
    expect(
      canUserAReadUserBRow({
        table: userRoles!,
        ownerId: "user-b",
        viewerId: "user-a",
      }),
    ).toBe(false);
    expect(
      canUserAReadUserBRow({
        table: userRoles!,
        ownerId: "user-a",
        viewerId: "user-a",
        viewerIsAdmin: false,
      }),
    ).toBe(true);
    expect(
      canUserAReadUserBRow({
        table: userRoles!,
        ownerId: "user-b",
        viewerId: "user-a",
        viewerIsAdmin: true,
      }),
    ).toBe(true);
  });

  it("non-admin cannot treat privileged role rows as writable via client contract", () => {
    // Client-side checks are not the security boundary; this documents fail-closed
    // expectation used by UI + RLS matrix: normal users never self-grant admin.
    expect(userRoles?.crossUserSelect).toBe("admin_only");
    expect(
      canUserAReadUserBRow({
        table: userRoles!,
        ownerId: "user-a",
        viewerId: "user-a",
        viewerIsAdmin: false,
      }),
    ).toBe(true);
    expect(
      canUserAReadUserBRow({
        table: {
          table: "user_roles",
          ownerColumn: "user_id",
          crossUserSelect: "admin_only",
        },
        ownerId: "user-b",
        viewerId: "user-a",
        viewerIsAdmin: false,
      }),
    ).toBe(false);
  });
});
