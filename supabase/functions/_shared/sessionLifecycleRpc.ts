import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { parseJsonbObject, type EligibilityRpc } from "./sessionStartEligibility.ts";

export type SessionStartRpcFailure = {
  status: number;
  code: string;
  error: string;
};

/** Map Postgres/Supabase RPC failures to typed HTTP responses (no secret leakage). */
export function mapSessionStartRpcFailure(message: string): SessionStartRpcFailure {
  const lower = message.toLowerCase();

  if (
    lower.includes("sessions_lifecycle_status_check") ||
    lower.includes("check constraint") ||
    lower.includes("session_state_conflict")
  ) {
    return {
      status: 409,
      code: "SESSION_STATE_CONFLICT",
      error: "Could not reconcile an existing session. Please try again.",
    };
  }

  if (lower.includes("start_owned_session") && lower.includes("does not exist")) {
    return {
      status: 503,
      code: "SCHEMA_OUTDATED",
      error: "Session service is being updated. Please try again shortly.",
    };
  }

  if (lower.includes("unique_violation") || lower.includes("duplicate key")) {
    return {
      status: 409,
      code: "SESSION_STATE_CONFLICT",
      error: "A session is already starting. Please wait a moment and retry.",
    };
  }

  if (
    lower.includes("foreign key") ||
    lower.includes("violates foreign key") ||
    lower.includes("invalid input syntax") ||
    lower.includes("invalid uuid")
  ) {
    return {
      status: 422,
      code: "VALIDATION_ERROR",
      error: "Session setup is invalid. Check your resume and job description selections.",
    };
  }

  if (
    lower.includes("connection") ||
    lower.includes("timeout") ||
    lower.includes("econnreset") ||
    lower.includes("reset by peer") ||
    lower.includes("network") ||
    lower.includes("too many connections") ||
    lower.includes("temporarily unavailable") ||
    lower.includes("could not connect")
  ) {
    return {
      status: 503,
      code: "DEPENDENCY_UNAVAILABLE",
      error: "Session service is temporarily unavailable. Please try again shortly.",
    };
  }

  return {
    status: 500,
    code: "SESSION_CREATE_FAILED",
    error: "Could not create session.",
  };
}

export async function rpcJson(
  db: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<{ data: EligibilityRpc; error: string | null }> {
  const { data, error } = await db.rpc(name, args);
  if (error) {
    return { data: {}, error: error.message };
  }
  return { data: parseJsonbObject(data), error: null };
}
