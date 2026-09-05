/**
 * Server-authoritative billing for generate-questions.
 * Client `free_session` is never trusted for credit charges.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

export type GenerateQuestionsBillingContext = {
  sessionType: string | null;
  hasMockSessionPayment: boolean;
};

export type GenerateQuestionsBillingDecision = {
  creditCharge: number;
  reason:
    | "no_session"
    | "warmup_session"
    | "mock_session_prepaid"
    | "mock_unpaid"
    | "default_paid";
};

export function resolveGenerateQuestionsCreditChargeFromContext(
  ctx: GenerateQuestionsBillingContext,
  perQuestionCost: number,
): GenerateQuestionsBillingDecision {
  const cost = Math.max(0, perQuestionCost);
  if (!ctx.sessionType) {
    return { creditCharge: cost, reason: "no_session" };
  }

  const sessionType = ctx.sessionType.trim().toLowerCase();
  if (sessionType === "warmup") {
    return { creditCharge: 0, reason: "warmup_session" };
  }

  if (sessionType === "mock") {
    if (ctx.hasMockSessionPayment) {
      return { creditCharge: 0, reason: "mock_session_prepaid" };
    }
    return { creditCharge: cost, reason: "mock_unpaid" };
  }

  return { creditCharge: cost, reason: "default_paid" };
}

async function sessionHasMockSessionPayment(
  db: SupabaseClient,
  userId: string,
  sessionId: string,
): Promise<boolean> {
  const { data, error } = await db
    .from("credit_transactions")
    .select("id")
    .eq("user_id", userId)
    .eq("session_id", sessionId)
    .eq("description", "mock_session")
    .lt("amount", 0)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[generate-questions] mock_session payment lookup failed:", error.message);
    return false;
  }
  return Boolean(data?.id);
}

export async function resolveGenerateQuestionsCreditCharge(
  db: SupabaseClient,
  userId: string,
  sessionId: string | null | undefined,
  perQuestionCost: number,
): Promise<GenerateQuestionsBillingDecision> {
  if (!sessionId) {
    return resolveGenerateQuestionsCreditChargeFromContext(
      { sessionType: null, hasMockSessionPayment: false },
      perQuestionCost,
    );
  }

  const { data: sessionRow, error: sessionErr } = await db
    .from("sessions")
    .select("id, type, user_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionErr || !sessionRow || sessionRow.user_id !== userId) {
    return { creditCharge: Math.max(0, perQuestionCost), reason: "no_session" };
  }

  const sessionType = String(sessionRow.type ?? "");
  const hasMockSessionPayment =
    sessionType.trim().toLowerCase() === "mock"
      ? await sessionHasMockSessionPayment(db, userId, sessionId)
      : false;

  return resolveGenerateQuestionsCreditChargeFromContext(
    { sessionType, hasMockSessionPayment },
    perQuestionCost,
  );
}
