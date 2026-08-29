import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { sessionDurationSeconds } from "@/lib/session/sessionStartEligibility";

const root = process.cwd();

function read(relativePath: string): string {
  return fs
    .readFileSync(path.join(root, relativePath), "utf8")
    .replace(/\r\n/g, "\n");
}

const MIGRATION = read(
  "supabase/migrations/20260823130000_session_finalization_duration_hardening.sql",
);

/** Fields only `end_owned_session` may write. */
const SERVER_OWNED_FIELDS = [
  "status:",
  "lifecycle_status:",
  "terminal_reason:",
  "duration_seconds",
];

describe("session finalization migration", () => {
  it("allows EXPIRED in the lifecycle_status check", () => {
    const check = MIGRATION.slice(
      MIGRATION.indexOf("sessions_lifecycle_status_check\n  CHECK"),
      MIGRATION.indexOf("-- 2)"),
    );
    expect(check).toContain("'EXPIRED'::text");
    expect(check).toContain("'COMPLETED'::text");
    expect(check).toContain("'CANCELLED'::text");
    expect(check).toContain("'FAILED'::text");
  });

  it("backfills duration_seconds for already-ended rows", () => {
    expect(MIGRATION).toContain("UPDATE public.sessions");
    expect(MIGRATION).toContain("WHERE duration_seconds IS NULL");
    expect(MIGRATION).toContain("AND ended_at IS NOT NULL");
  });

  it("repairs a missing duration on the already-terminal path instead of returning null", () => {
    const terminalBranch = MIGRATION.slice(
      MIGRATION.indexOf("IF v_row.status IN ('completed', 'abandoned') THEN"),
      MIGRATION.indexOf("IF v_reason = 'USER_ENDED' THEN"),
    );
    expect(terminalBranch).toContain("v_row.duration_seconds IS NULL");
    expect(terminalBranch).toContain("SET\n        duration_seconds = v_duration");
    expect(terminalBranch).toContain("'already_terminal', true");
    // A repeat end must not re-classify a session that already finished.
    expect(terminalBranch).not.toContain("SET status");
    expect(terminalBranch).not.toContain("terminal_reason =");
  });

  it("never overwrites an existing terminal_reason on the first end", () => {
    expect(MIGRATION).toContain("terminal_reason = COALESCE(terminal_reason, v_reason)");
    expect(MIGRATION).toContain("ended_at = COALESCE(ended_at, v_now)");
  });

  it("must run after the migration that defines end_owned_session", () => {
    const migrations = fs
      .readdirSync(path.join(root, "supabase/migrations"))
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const definer = migrations.findIndex((name) =>
      read(`supabase/migrations/${name}`).includes(
        "CREATE OR REPLACE FUNCTION public.session_duration_seconds",
      ),
    );
    const hardening = migrations.indexOf(
      "20260823130000_session_finalization_duration_hardening.sql",
    );
    expect(definer).toBeGreaterThanOrEqual(0);
    expect(hardening).toBeGreaterThan(definer);
  });
});

describe("client session finalization", () => {
  it("useLiveCopilot ends via the server before writing metrics", () => {
    const source = read("src/hooks/useLiveCopilot.ts");
    const endIndex = source.indexOf('terminal_reason: "USER_ENDED"');
    const metricsIndex = source.indexOf("credits_used: session.credits_consumed");
    expect(endIndex).toBeGreaterThan(0);
    expect(metricsIndex).toBeGreaterThan(endIndex);

    const metricsWrite = source.slice(
      metricsIndex,
      source.indexOf("if (pairs.length > 0)", metricsIndex),
    );
    for (const field of SERVER_OWNED_FIELDS) {
      expect(metricsWrite).not.toContain(field);
    }
  });

  it("useLiveCopilot does not report success when finalization failed", () => {
    const source = read("src/hooks/useLiveCopilot.ts");
    expect(source).not.toContain("// completeForUser already persisted the terminal row.");
    expect(source).toContain("Failed to finalize session");
  });

  it("MockSession only writes terminal fields when the server call failed", () => {
    const source = read("src/pages/app/mock/MockSession.tsx");
    expect(source).toContain("let endedByRpc = false;");
    expect(source).toContain("...(endedByRpc\n          ? {}");
  });

  it("completeForUser treats abandoned as terminal", () => {
    const source = read("src/lib/supabase/database.ts");
    expect(source).toContain(
      'existing?.status === "completed" || existing?.status === "abandoned"',
    );
  });

  it("exposes a metrics-only writer that cannot touch server-owned fields", () => {
    const source = read("src/lib/supabase/database.ts");
    expect(source).toContain("async saveMetricsForUser(");
    const helper = source.slice(
      source.indexOf("async saveMetricsForUser("),
      source.indexOf("async end(", source.indexOf("async saveMetricsForUser(")),
    );
    expect(helper).toContain('| "duration_seconds"');
    expect(helper).toContain('| "terminal_reason"');
    expect(helper).toContain('| "lifecycle_status"');
  });
});

describe("duration on repeat end", () => {
  it("prefers the stored server duration over a recomputed one", () => {
    expect(
      sessionDurationSeconds({
        duration_seconds: 300,
        started_at: "2026-08-23T10:00:00.000Z",
        ended_at: "2026-08-23T10:30:00.000Z",
      }),
    ).toBe(300);
  });

  it("recomputes only when the server duration is missing", () => {
    expect(
      sessionDurationSeconds({
        duration_seconds: null,
        started_at: "2026-08-23T10:00:00.000Z",
        ended_at: "2026-08-23T10:05:00.000Z",
      }),
    ).toBe(300);
  });

  it("is stable across repeated ends and never negative", () => {
    const row = {
      duration_seconds: null,
      started_at: "2026-08-23T10:00:00.000Z",
      ended_at: "2026-08-23T10:05:00.000Z",
    };
    const first = sessionDurationSeconds(row);
    const second = sessionDurationSeconds({ ...row, duration_seconds: first });
    expect(second).toBe(first);
    expect(
      sessionDurationSeconds({
        started_at: "2026-08-23T10:05:00.000Z",
        ended_at: "2026-08-23T10:00:00.000Z",
      }),
    ).toBe(0);
  });
});
