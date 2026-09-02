import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../..");

describe("start-session expire hardening migration", () => {
  it("defines expire_timed_out_open_session with EXPIRED fallback", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260902120100_start_session_expire_hardening.sql"),
      "utf8",
    );
    expect(sql).toContain("expire_timed_out_open_session");
    expect(sql).toContain("lifecycle_status = 'EXPIRED'");
    expect(sql).toContain("WHEN check_violation");
    expect(sql).toContain("lifecycle_status = 'CANCELLED'");
  });

  it("allows EXPIRED in sessions lifecycle check (20260901150000)", () => {
    const sql = fs.readFileSync(
      path.join(root, "supabase/migrations/20260901150000_allow_session_lifecycle_expired.sql"),
      "utf8",
    );
    expect(sql).toContain("'EXPIRED'::text");
  });
});

describe("sessionLifecycle resume", () => {
  it("uses IN_PROGRESS (not invalid RESUMED) when resuming", () => {
    const source = fs.readFileSync(
      path.join(root, "src/lib/session/sessionLifecycle.ts"),
      "utf8",
    );
    expect(source).toContain('lifecycle_status: "IN_PROGRESS"');
    expect(source).not.toContain('lifecycle_status: "RESUMED"');
  });
});

describe("start-session edge onboarding dependency", () => {
  it("returns DEPENDENCY_UNAVAILABLE instead of unhandled 500", () => {
    const source = fs.readFileSync(
      path.join(root, "supabase/functions/start-session/index.ts"),
      "utf8",
    );
    expect(source).toContain("DependencyUnavailableError");
    expect(source).toContain("DEPENDENCY_UNAVAILABLE");
    expect(source).toContain("mapSessionStartRpcFailure");
  });
});
