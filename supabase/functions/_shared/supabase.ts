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
};

export type DeductCreditsAtomicResult = {
  success: boolean;
  balanceAfter?: number;
  transactionId?: string;
  error?: string;
};

export type RefundCreditsInput = {
  userId: string;
  cost: number;
  reason: string;
  sessionId?: string | null;
};

type IdempotencyRecord = {
  key: string;
  response: DeductCreditsAtomicResult;
  expires_at: string;
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
async function getIdempotentResponse(
  db: SupabaseClient,
  key?: string | null
): Promise<DeductCreditsAtomicResult | null> {
  if (!key) {
    return null;
  }

  if (!isValidIdempotencyKey(key)) {
    return {
      success: false,
      error: "Invalid idempotency key.",
    };
  }

  try {
    const { data, error } = await db
      .from(IDEMPOTENCY_TABLE)
      .select("response, expires_at")
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

    return record.response ?? null;
  } catch {
    return null;
  }
}

async function storeIdempotentResponse(
  db: SupabaseClient,
  key: string | null | undefined,
  response: DeductCreditsAtomicResult
): Promise<void> {
  if (!key || !isValidIdempotencyKey(key)) {
    return;
  }

  const record: IdempotencyRecord = {
    key,
    response,
    expires_at: new Date(Date.now() + IDEMPOTENCY_TTL_MS).toISOString(),
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

/* -------------------------------------------------------------------------- */
/*                              CREDIT SYSTEM                                  */
/* -------------------------------------------------------------------------- */

/**
 * Low-level hardened credit deduction.
 *
 * Uses:
 * - read current balance
 * - guarded update with .gte("credits", amount)
 * - transaction log insert
 *
 * NOTE:
 * For strict enterprise-grade accounting, prefer a Postgres RPC that performs:
 * - balance check
 * - deduction
 * - transaction insert
 * in one SQL transaction.
 */
export async function deductCredits(
  userId: string,
  action: string,
  amount: number
): Promise<CreditDeductionResult> {
  try {
    assertValidCreditInput(userId, action, amount);

    const db = createServiceClient();
    const normalizedAction = normalizeAction(action);

    const { data: current, error: readError } = await db
      .from("profiles")
      .select("credits, credits_used_this_month")
      .eq("id", userId)
      .single();

    if (readError || !current) {
      return {
        success: false,
        error: "Profile not found.",
      };
    }

    const currentCredits =
      typeof current.credits === "number" ? current.credits : 0;

    const currentCreditsUsed =
      typeof current.credits_used_this_month === "number"
        ? current.credits_used_this_month
        : 0;

    if (currentCredits < amount) {
      return {
        success: false,
        error: "Insufficient credits.",
      };
    }

    const nextCredits = currentCredits - amount;

    const { data: updated, error: writeError } = await db
      .from("profiles")
      .update({
        credits: nextCredits,
        credits_used_this_month: currentCreditsUsed + amount,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId)
      .gte("credits", amount)
      .select("credits")
      .single();

    if (writeError || !updated) {
      return {
        success: false,
        error: "Credit deduction failed.",
      };
    }

    const balanceAfter =
      typeof updated.credits === "number" ? updated.credits : nextCredits;

    const { data: transaction, error: transactionError } = await db
      .from("credit_transactions")
      .insert({
        user_id: userId,
        action: "usage",
        amount: -amount,
        balance_after: balanceAfter,
        description: normalizedAction,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (transactionError) {
      console.error(
        "[credits] Credit deducted but transaction log failed:",
        transactionError.message
      );
    }

    const transactionId =
      transaction && typeof transaction.id === "string"
        ? transaction.id
        : undefined;

    return {
      success: true,
      newBalance: balanceAfter,
      transactionId,
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
 * Adds optional:
 * - session_id attachment
 * - idempotency lookup/storage
 */
export async function deductCreditsAtomic(
  input: DeductCreditsAtomicInput
): Promise<DeductCreditsAtomicResult> {
  const db = createServiceClient();

  const idempotentResponse = await getIdempotentResponse(
    db,
    input.idempotencyKey
  );

  if (idempotentResponse) {
    return idempotentResponse;
  }

  const result = await deductCredits(input.userId, input.action, input.cost);

  if (!result.success || typeof result.newBalance !== "number") {
    const failure: DeductCreditsAtomicResult = {
      success: false,
      error: result.error ?? "Credit deduction failed.",
    };

    await storeIdempotentResponse(db, input.idempotencyKey, failure);

    return failure;
  }

  let transactionId = result.transactionId;

  if (input.sessionId && !isValidUuid(input.sessionId)) {
    console.error("[credits] Invalid sessionId provided for credit transaction.");
  }

  if (input.sessionId && isValidUuid(input.sessionId)) {
    try {
      if (transactionId) {
        await db
          .from("credit_transactions")
          .update({
            session_id: input.sessionId,
          })
          .eq("id", transactionId);
      } else {
        const { data: lastTransaction } = await db
          .from("credit_transactions")
          .select("id")
          .eq("user_id", input.userId)
          .eq("action", "usage")
          .eq("balance_after", result.newBalance)
          .order("created_at", {
            ascending: false,
          })
          .limit(1)
          .maybeSingle();

        if (lastTransaction && typeof lastTransaction.id === "string") {
          transactionId = lastTransaction.id;

          await db
            .from("credit_transactions")
            .update({
              session_id: input.sessionId,
            })
            .eq("id", lastTransaction.id);
        }
      }
    } catch (error) {
      console.error(
        "[credits] Failed to attach session_id:",
        error instanceof Error ? error.message : String(error)
      );
    }
  }

  const success: DeductCreditsAtomicResult = {
    success: true,
    balanceAfter: result.newBalance,
    transactionId,
  };

  await storeIdempotentResponse(db, input.idempotencyKey, success);

  return success;
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
): Promise<{ success: boolean; error?: string }> {
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

  try {
    const rpcResult = await db.rpc("refund_credits", {
      p_user_id: input.userId,
      p_cost: input.cost,
      p_reason: reason,
    });

    if (!rpcResult.error) {
      return {
        success: true,
      };
    }

    console.warn(
      "[credits] refund_credits RPC failed; falling back:",
      rpcResult.error.message
    );
  } catch {
    console.warn("[credits] refund_credits RPC unavailable; falling back.");
  }

  try {
    const { data: current, error: readError } = await db
      .from("profiles")
      .select("credits")
      .eq("id", input.userId)
      .single();

    if (readError || !current) {
      return {
        success: false,
        error: "Profile not found for refund.",
      };
    }

    const currentCredits =
      typeof current.credits === "number" ? current.credits : 0;

    const nextCredits = currentCredits + input.cost;

    const { data: updated, error: updateError } = await db
      .from("profiles")
      .update({
        credits: nextCredits,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.userId)
      .select("credits")
      .single();

    if (updateError || !updated) {
      return {
        success: false,
        error: "Refund update failed.",
      };
    }

    const balanceAfter =
      typeof updated.credits === "number" ? updated.credits : nextCredits;

    await db.from("credit_transactions").insert({
      user_id: input.userId,
      action: "refund",
      amount: input.cost,
      balance_after: balanceAfter,
      description: reason,
      session_id:
        input.sessionId && isValidUuid(input.sessionId)
          ? input.sessionId
          : null,
      created_at: new Date().toISOString(),
    });

    return {
      success: true,
    };
  } catch (error) {
    console.error(
      "[credits] Refund fallback failed:",
      error instanceof Error ? error.message : String(error)
    );

    return {
      success: false,
      error: "Refund failed.",
    };
  }
}
//
// Shared Supabase utilities for Edge Functions.
//
// SECURITY PURPOSE:
// - Centralize Supabase service-role client creation
// - Centralize user-scoped client creation
