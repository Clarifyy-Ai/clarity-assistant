import { describe, expect, it } from "vitest";
import { mapSessionStartRpcFailure, shouldReuseExistingOnConflict, isOpenPracticeStatus } from "../../../../supabase/functions/_shared/sessionLifecycleRpc";

describe("mapSessionStartRpcFailure", () => {
  it("maps lifecycle check violations to SESSION_STATE_CONFLICT (409)", () => {
    const mapped = mapSessionStartRpcFailure(
      'new row for relation "sessions" violates check constraint "sessions_lifecycle_status_check"',
    );
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("SESSION_STATE_CONFLICT");
    expect(mapped.error).toMatch(/reconcile/i);
  });

  it("maps missing RPC to SCHEMA_OUTDATED (503)", () => {
    const mapped = mapSessionStartRpcFailure(
      'function public.start_owned_session(uuid, text) does not exist',
    );
    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe("SCHEMA_OUTDATED");
  });

  it("maps duplicate key races to SESSION_STATE_CONFLICT (409)", () => {
    const mapped = mapSessionStartRpcFailure(
      "duplicate key value violates unique constraint sessions_one_open_per_type_uidx",
    );
    expect(mapped.status).toBe(409);
    expect(mapped.code).toBe("SESSION_STATE_CONFLICT");
  });

  it("maps connection failures to DEPENDENCY_UNAVAILABLE (503)", () => {
    const mapped = mapSessionStartRpcFailure("connection reset by peer");
    expect(mapped.status).toBe(503);
    expect(mapped.code).toBe("DEPENDENCY_UNAVAILABLE");
  });

  it("treats SESSION_STATE_CONFLICT as a reuse signal, not an unhandled 500", () => {
    const mapped = mapSessionStartRpcFailure("session_state_conflict");
    expect(mapped.status).toBe(409);
    expect(shouldReuseExistingOnConflict(mapped.code)).toBe(true);
    expect(isOpenPracticeStatus("active")).toBe(true);
    expect(isOpenPracticeStatus("pending")).toBe(true);
    expect(isOpenPracticeStatus("completed")).toBe(false);
  });

  it("maps FK violations to VALIDATION_ERROR (422)", () => {
    const mapped = mapSessionStartRpcFailure(
      'insert or update on table "sessions" violates foreign key constraint',
    );
    expect(mapped.status).toBe(422);
    expect(mapped.code).toBe("VALIDATION_ERROR");
  });

  it("defaults unknown errors to SESSION_CREATE_FAILED (500)", () => {
    const mapped = mapSessionStartRpcFailure("unexpected internal failure");
    expect(mapped.status).toBe(500);
    expect(mapped.code).toBe("SESSION_CREATE_FAILED");
  });

  it("maps RLS and permission errors to FORBIDDEN (403)", () => {
    const mapped = mapSessionStartRpcFailure("new row violates row-level security policy");
    expect(mapped.status).toBe(403);
    expect(mapped.code).toBe("FORBIDDEN");
  });
});
