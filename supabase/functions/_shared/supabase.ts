// supabase/functions/_shared/supabase.ts// sup// - Prevent empty/missing Supabase env usage
// - Provide safe credit deduction helpers
// - Provide best-effort idempotency support for financial/credit actions
// - Provide safe credit refund helper
//
// REQUIRED ENV:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - SUPABASE_ANON_KEY
//
// IMPORTANT:
// The service role key bypasses RLS.
// Use createServiceClient() only inside trusted Edge Functions.

import {
  createClient,
  type SupabaseClient,
} from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { classifyCreditFailure } from "./creditAuthority.ts";

export type CreditDeductionResult = {
  success: boolean;
  newBalance?: number;
  transactionId?: string;
  error?: string;
};

export type DeductCreditsAtomicInput = {
  userId: string;
  action: string;
  cost: number;
  sessionId?: string | null;
  idempotencyKey?: string | null;
  requestHash?: string | null;
};

export type DeductCreditsAtomicResult = {
  success: boolean;
  balanceAfter?: number;
  /** Spendable balance observed for this attempt (after success, or remaining on denial). */
  balance?: number;
  transactionId?: string;
  error?: string;
  code?: string;
  /** Optional cached business payload for full request replay (e.g. prep-tool AI result). */
  payload?: Record<string, unknown>;
};

export type RefundCreditsInput = {
  userId: string;
  cost: number;
  reason: string;
  sessionId?: string | null;
  /** When set, refund the absolute amount of this usage transaction. */
  sourceTransactionId?: string | null;
  /** When set, duplicate refunds with the same key are no-ops. */
  idempotencyKey?: string | null;
};

type IdempotencyRecord = {
  key: string;
  response: DeductCreditsAtomicResult;
  expires_at: string;
  metadata: Record<string, string>;
};

const IDEMPOTENCY_TABLE = "idempotency_log";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

function getRequiredEnv(name: string): string {
  const value = Deno.env.get(name);

  if (!value || value.trim().length === 0) {
    throw new Error(`[supabase] Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function isValidUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isValidIdempotencyKey(value: string): boolean {
  return /^[A-Za-z0-9._:-]{16,150}$/.test(value);
}

function normalizeAction(action: string): string {
  return action
    .trim()
    .replace(/[^A-Za-z0-9._:-]/g, "_")
    .slice(0, 100);
}

function normalizeReason(reason: string): string {
  return reason
    .trim()
    .replace(/[\u0000-\u001F\u007F]/g, "")
    .slice(0, 500);
}

function assertValidCreditInput(userId: string, action: string, amount: number): void {
  if (!userId || !isValidUuid(userId)) {
    throw new Error("Invalid userId.");
  }

  if (!action || action.trim().length === 0) {
    throw new Error("Missing credit action.");
  }

  if (!Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw new Error("Invalid credit amount.");
  }
}

/* -------------------------------------------------------------------------- */
/*                              SERVICE CLIENT                                 */
/* -------------------------------------------------------------------------- */

export function createServiceClient(): SupabaseClient {
  const url = getRequiredEnv("SUPABASE_URL");
  const key = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                              USER CLIENT                                    */
/* -------------------------------------------------------------------------- */

/**
 * User-scoped client where RLS applies.
 *
 * Use when Postgres functions rely on auth.uid().
 */
export function createUserClient(accessToken: string): SupabaseClient {
  if (!accessToken || accessToken.trim().length === 0) {
    throw new Error("[supabase] Missing access token for user client.");
  }

  const url = getRequiredEnv("SUPABASE_URL");
  const anon = getRequiredEnv("SUPABASE_ANON_KEY");

  return createClient(url, anon, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken.trim()}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

/* -------------------------------------------------------------------------- */
/*                              IDEMPOTENCY                                    */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort idempotency lookup.
 *
 * If the table does not exist yet, this safely returns null.
 * Recommended table:
 *
 * idempotency_log:
 * - key text primary key
 * - response jsonb not null
 * - expires_at timestamptz not null
 * - created_at timestamptz default now()
 */
export async function getIdempotentResponse(
  db: SupabaseClient,
  key?: string | null,
  scope?: { userId: string; action: string; requestHash?: string | null }
): Promise<DeductCreditsAtomicResult | null> {
  if (!key) {
    return null;
  }

  // Invalid keys must not fail the credit path — treat as "no key" so callers retry safely.
  if (!isValidIdempotencyKey(key)) {
    console.warn("[credits] Ignoring invalid idempotency key shape.");
    return null;
  }

  try {
    const { data, error } = await db
      .from(IDEMPOTENCY_TABLE)
      .select("response, expires_at, metadata")
      .eq("key", key)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const record = data as {
      response?: DeductCreditsAtomicResult;
      expires_at?: string;
    };

    if (!record.expires_at || new Date(record.expires_at).getTime() <= Date.now()) {
      return null;
    }

    if (scope) {
      const metadata = (data as { metadata?: Record<string, unknown> }).metadata;
      if (
        metadata?.user_id !== scope.userId ||
        metadata?.action !== normalizeAction(scope.action) ||
        (scope.requestHash && metadata?.request_hash !== scope.requestHash)
      ) {
        return null;
      }
    }

    // Never replay stored *failures* — allow a fresh deduction attempt.
    if (record.response && record.response.success === false) {
      return null;
    }

    return record.response ?? null;
  } catch {
    return null;
  }
}

export async function storeIdempotentResponse(
  db: SupabaseClient,
  key: string | null | undefined,
  response: DeductCreditsAtomicResult,
  scope?: { userId: string; action: string; requestHash?: string | null }
): Promise<void> {
  if (!key || !isValidIdempotencyKey(key)) {
    return;
  }

  const record: IdempotencyRecord = {
    key,
    response,
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
    metadata: {
      ...(scope?.userId ? { user_id: scope.userId } : {}),
      ...(scope?.action ? { action: normalizeAction(scope.action) } : {}),
      ...(scope?.requestHash ? { request_hash: scope.requestHash } : {}),
    },
  };

  try {
    await db.from(IDEMPOTENCY_TABLE).upsert(record, {
      onConflict: "key",
    });
  } catch (error) {
    console.error(
      "[supabase] Failed to store idempotency response:",
      error instanceof Error ? error.message : String(error)
    );
  }
}

/**
 * Claim an idempotency key before doing expensive work.
 * Returns "claimed" on first insert, "duplicate" on unique violation.
 * Callers must store the final response or release the claim on failure.
 */
export async function claimIdempotencyKey(
  db: SupabaseClient,
  key: string | null | undefined,
  scope?: { userId: string; action: string; requestHash?: string | null },
): Promise<"claimed" | "duplicate" | "skipped"> {
  if (!key || !isValidIdempotencyKey(key)) return "skipped";

  const { error } = await db.from(IDEMPOTENCY_TABLE).insert({
    key,
    response: { status: "pending" },
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
    metadata: {
      ...(scope?.userId ? { user_id: scope.userId } : {}),
      ...(scope?.action ? { action: normalizeAction(scope.action) } : {}),
      ...(scope?.requestHash ? { request_hash: scope.requestHash } : {}),
    },
  });

  if (!error) return "claimed";
  if ((error as { code?: string }).code === "23505") return "duplicate";
  console.error("[supabase] claimIdempotencyKey failed:", error.message);
  // Fail open so export still works if the table is unavailable.
  return "skipped";
}

export async function releaseIdempotencyKey(
  db: SupabaseClient,
  key: string | null | undefined,
): Promise<void> {
  if (!key || !isValidIdempotencyKey(key)) return;
  try {
    await db.from(IDEMPOTENCY_TABLE).delete().eq("key", key);
  } catch (error) {
    console.error(
      "[supabase] Failed to release idempotency key:",
      error instanceof Error ? error.message : String(error),
    );
  }
}

/* -------------------------------------------------------------------------- */
/*                              CREDIT SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * Low-level hardened credit deduction.
 *
 * Uses the service-role transaction RPC when available. The RPC locks the
 * profile row and records the ledger entry in the same database transaction.
 */
export async function deductCredits(
  userId: string,
  action: string,
  amount: number
): Promise<CreditDeductionResult> {
  try {
    assertValidCreditInput(userId, action, amount);

    const normalizedAction = normalizeAction(action);
    const db = createServiceClient();
    const { data, error } = await db.rpc("deduct_credits_service", {
      p_user_id: userId,
      p_action: normalizedAction,
      p_cost: amount,
      p_session_id: null,
      p_idempotency_key: null,
      p_request_hash: null,
    });

    if (error || !data || typeof data !== "object") {
      return { success: false, error: "Credit deduction failed." };
    }

    const result = data as {
      success?: boolean;
      error?: string;
      new_balance?: number;
      transaction_id?: string;
    };
    if (!result.success) {
      return { success: false, error: result.error ?? "Credit deduction failed." };
    }
    if (!Number.isInteger(result.new_balance)) {
      return { success: false, error: "Credit deduction returned an invalid balance." };
    }
    return {
      success: true,
      newBalance: result.new_balance,
      transactionId:
        typeof result.transaction_id === "string" ? result.transaction_id : undefined,
    };
  } catch (error) {
    console.error(
      "[credits] Unexpected deduction error:",
      error instanceof Error ? error.message : String(error)
    );

    return {
      success: false,
      error: "Unexpected credit deduction failure.",
    };
  }
}

/**
 * High-level helper used by AI/session/payment functions.
 *
 * The service-role RPC owns balance lock, ledger insert, session attachment,
 * and idempotency record in one database transaction.
 */
export async function deductCreditsAtomic(
  input: DeductCreditsAtomicInput
): Promise<DeductCreditsAtomicResult> {
  const db = createServiceClient();

  assertValidCreditInput(input.userId, input.action, input.cost);

  const normalizedAction = normalizeAction(input.action);
  const sessionId =
    input.sessionId && isValidUuid(input.sessionId) ? input.sessionId : null;

  const rpcResult = await db.rpc("deduct_credits_service", {
    p_user_id: input.userId,
    p_action: normalizedAction,
    p_cost: input.cost,
    p_session_id: sessionId,
    p_idempotency_key: input.idempotencyKey ?? null,
    p_request_hash: input.requestHash ?? null,
  });

  const rpcData = rpcResult.data as {
    success?: boolean;
    error?: string;
    code?: string;
    new_balance?: number;
    balance?: number;
    transaction_id?: string;
  } | null;

  if (rpcResult.error) {
    const unavailable = classifyCreditFailure(
      rpcResult.error.message ?? "Credit service unavailable.",
      "CREDIT_SERVICE_UNAVAILABLE",
    );
    return {
      success: false,
      error: "Credit service unavailable.",
      code: unavailable,
    };
  }

  const parsedBalance = Number(rpcData?.new_balance ?? rpcData?.balance);
  const balanceOk = Number.isFinite(parsedBalance);

  if (!rpcData?.success || !balanceOk) {
    const code = classifyCreditFailure(rpcData?.error, rpcData?.code);
    const remaining = Number(rpcData?.balance ?? rpcData?.new_balance);
    return {
      success: false,
      error: rpcData?.error ?? "Credit deduction failed.",
      code,
      balance: Number.isFinite(remaining)
        ? Math.max(0, Math.floor(remaining))
        : undefined,
    };
  }

  return {
    success: true,
    balanceAfter: parsedBalance,
    balance: parsedBalance,
    transactionId:
      typeof rpcData.transaction_id === "string" ? rpcData.transaction_id : undefined,
    code: rpcData.code ?? "OK",
  };
}

/* -------------------------------------------------------------------------- */
/*                              REFUND SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * Best-effort credit refund helper.
 *
 * Prefer a Postgres RPC named refund_credits if available.
 * Falls back to guarded profile increment + transaction log.
 */
export async function refundCredits(
  input: RefundCreditsInput
): Promise<{ success: boolean; error?: string; idempotentReplay?: boolean }> {
  if (!input.userId || !isValidUuid(input.userId)) {
    return {
      success: false,
      error: "Invalid userId.",
    };
  }

  if (!Number.isInteger(input.cost) || input.cost <= 0) {
    return {
      success: false,
      error: "Invalid refund amount.",
    };
  }

  const db = createServiceClient();
  const reason = normalizeReason(input.reason);
  const idemKey = input.idempotencyKey?.trim() || null;

  if (idemKey) {
    const prior = await getIdempotentResponse(db, idemKey, {
      userId: input.userId,
      action: `refund:${reason}`,
    });
    if (prior?.success === true) {
      return { success: true, idempotentReplay: true };
    }
  }

  try {
    const rpcResult = await db.rpc("refund_credits", {
      p_user_id: input.userId,
      p_cost: input.cost,
      p_reason: reason,
      ...(input.sourceTransactionId
        ? { p_source_transaction_id: input.sourceTransactionId }
        : {}),
    });

    const result = rpcResult.data as { success?: boolean; error?: string } | null;
    if (!rpcResult.error && result?.success === true) {
      if (idemKey) {
        await storeIdempotentResponse(
          db,
          idemKey,
          { success: true, credits: input.cost, balance: 0 },
          { userId: input.userId, action: `refund:${reason}` },
        );
      }
      return {
        success: true,
      };
    }

    console.warn(
      "[credits] refund_credits RPC failed:",
      rpcResult.error?.message ?? result?.error ?? "unknown error"
    );
  } catch (error) {
    console.error(
      "[credits] Refund RPC failed:",
      error instanceof Error ? error.message : String(error)
    );
  }

  return { success: false, error: "Refund failed." };
}

/** Refund with structured logging — never swallow compensation failures silently. */
export async function refundCreditsBestEffort(
  input: RefundCreditsInput,
  logContext?: Record<string, unknown>,
): Promise<{ success: boolean; error?: string; idempotentReplay?: boolean }> {
  const result = await refundCredits(input);
  if (!result.success && !result.idempotentReplay) {
    console.error(
      JSON.stringify({
        tag: "[credits] refund_best_effort_failed",
        user_id: input.userId,
        cost: input.cost,
        reason: input.reason,
        idempotency_key: input.idempotencyKey ?? null,
        error: result.error ?? "unknown",
        ...logContext,
      }),
    );
  }
  return result;
}
//
// Shared Supabase utilities for Edge Functions.
//
// SECURITY PURPOSE:
// - Centralize Supabase service-role client creation
// - Centralize user-scoped client creation
