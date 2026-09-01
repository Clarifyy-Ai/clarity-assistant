// @ts-nocheck -- Deno runtime file
/** Owned-row lookups for Live Chat. Never trust client-supplied identity. */

import type { SupportIntent } from "./supportClassify.ts";

export type SupportSnapshot = {
  credits?: number | null;
  plan_id?: string | null;
  job?: {
    id: string;
    status: string;
    progress_stage: string | null;
    error_code: string | null;
    retryable: boolean;
    credits_released_at: string | null;
    credits_reserved: number;
    credits_charged: number;
  } | null;
  payment?: {
    id: string;
    status: string;
    credits_granted: number;
    provider_order_id: string | null;
    paid_at: string | null;
    fulfilled_at: string | null;
  } | null;
  document_job?: {
    id: string;
    status: string;
    error_code: string | null;
    error_stage: string | null;
    retryable: boolean;
    operation: string;
  } | null;
};

function mapJobStatus(status: string | null | undefined, retryable?: boolean | null): string {
  const s = String(status ?? "").trim();
  if (s === "failed_retryable" || s === "failed_permanent") return s;
  if (s === "failed") return retryable === false ? "failed_permanent" : "failed_retryable";
  if (s === "expired") return "failed_permanent";
  return s || "queued";
}

export async function loadOwnedSupportSnapshot(
  db: { from: (t: string) => any },
  ownerUserId: string | null,
  intent: SupportIntent,
  hint?: { exam_id?: string; job_id?: string; document_id?: string } | null,
): Promise<SupportSnapshot> {
  const snap: SupportSnapshot = {};
  if (!ownerUserId) return snap;

  if (intent === "credits" || intent === "payment" || intent === "unclear" || intent === "faq") {
    const { data: profile } = await db
      .from("profiles")
      .select("credits, plan_id")
      .eq("id", ownerUserId)
      .maybeSingle();
    snap.credits = typeof profile?.credits === "number" ? profile.credits : null;
    snap.plan_id = typeof profile?.plan_id === "string" ? profile.plan_id : null;
  }

  if (intent === "payment" || intent === "credits") {
    const { data: order } = await db
      .from("payment_orders")
      .select("id, status, credits_granted, provider_order_id, paid_at, fulfilled_at")
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (order?.id) {
      snap.payment = {
        id: order.id,
        status: String(order.status ?? ""),
        credits_granted: Number(order.credits_granted ?? 0),
        provider_order_id: order.provider_order_id ?? null,
        paid_at: order.paid_at ?? null,
        fulfilled_at: order.fulfilled_at ?? null,
      };
    }
  }

  if (intent === "exam_job" || intent === "unclear") {
    let q = db
      .from("gov_paper_generation_jobs")
      .select(
        "id, status, progress_stage, error_code, retryable, credits_released_at, credits_reserved, credits_charged",
      )
      .eq("user_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (hint?.job_id) q = q.eq("id", hint.job_id);
    const { data: job } = await q.maybeSingle();
    if (job?.id) {
      snap.job = {
        id: job.id,
        status: mapJobStatus(job.status, job.retryable),
        progress_stage: job.progress_stage ?? null,
        error_code: job.error_code ?? null,
        retryable: job.retryable !== false,
        credits_released_at: job.credits_released_at ?? null,
        credits_reserved: Number(job.credits_reserved ?? 0),
        credits_charged: Number(job.credits_charged ?? 0),
      };
    }
  }

  if (intent === "document_job") {
    let q = db
      .from("document_processing_jobs")
      .select("id, status, error_code, error_stage, retryable, operation")
      .eq("owner_id", ownerUserId)
      .order("created_at", { ascending: false })
      .limit(1);
    if (hint?.document_id) q = q.eq("document_id", hint.document_id);
    const { data: job } = await q.maybeSingle();
    if (job?.id) {
      snap.document_job = {
        id: job.id,
        status: String(job.status ?? ""),
        error_code: job.error_code ?? null,
        error_stage: job.error_stage ?? null,
        retryable: job.retryable !== false,
        operation: String(job.operation ?? ""),
      };
    }
  }

  return snap;
}

export function formatDeterministicReply(
  intent: SupportIntent,
  snap: SupportSnapshot,
): string | null {
  if (intent === "credits") {
    const credits = snap.credits ?? 0;
    const plan = snap.plan_id ?? "free";
    return `Your current plan is ${plan} with ${credits} credit${credits === 1 ? "" : "s"} remaining. Support chat does not use your practice credits.`;
  }
  if (intent === "payment") {
    if (!snap.payment) {
      return "I could not find a recent payment on this account. If you just paid, wait a minute for the webhook, then message again. If credits still do not appear, Talk to Support with your order id.";
    }
    const p = snap.payment;
    if (p.status === "paid" || p.status === "fulfilled" || p.fulfilled_at) {
      return `Your latest payment is recorded as ${p.status}. Credits granted: ${p.credits_granted}. Current balance: ${snap.credits ?? "unknown"}.`;
    }
    return `Your latest payment order is ${p.status}. It is not fulfilled yet, so credits may not have been added. You can Talk to Support if this stays unchanged.`;
  }
  if (intent === "exam_job") {
    if (!snap.job) {
      return "I do not see an active government-exam paper job on this account. If you just started a Full Mock, wait a few seconds and send the same message again.";
    }
    const j = snap.job;
    if (j.status === "queued" || j.status === "running" || j.status === "processing" || j.status === "leased") {
      const step = j.progress_stage?.replace(/_/g, " ") || "generating questions";
      return `Your paper is still being generated. Current step: ${step}.`;
    }
    if (j.status === "failed_retryable") {
      return "Your paper generation failed temporarily. You can retry now. Your reserved credits were released.";
    }
    if (j.status === "failed_permanent") {
      return "This paper could not be generated with the selected configuration. No additional credits were charged.";
    }
    if (j.status === "succeeded" || j.status === "completed") {
      return "Your paper generation completed. Open Government Exams and continue from the generated paper.";
    }
    return `Paper job status: ${j.status}${j.error_code ? ` (${j.error_code})` : ""}.`;
  }
  if (intent === "document_job") {
    if (!snap.document_job) {
      return "I do not see a recent resume/document job on this account. Try uploading again from Documents, or Talk to Support with a screenshot.";
    }
    const d = snap.document_job;
    if (d.status === "failed" || d.status === "failed_retryable") {
      return `Resume processing failed${d.error_stage ? ` at ${d.error_stage}` : ""}${d.error_code ? ` (${d.error_code})` : ""}. ${d.retryable ? "You can retry the upload." : "This file type or file may not be supported."}`;
    }
    if (d.status === "queued" || d.status === "running" || d.status === "processing") {
      return `Your ${d.operation || "document"} job is still ${d.status}.`;
    }
    return `Document job status: ${d.status}.`;
  }
  return null;
}

export function chipWelcome(category: string): string {
  switch (category) {
    case "interview":
      return "Ask about Practice Coach, mock interviews, or a recent score. I will use your account data first and only call AI when an explanation is needed.";
    case "gov_exams":
      return "Ask about a stuck Full Mock, paper generation, or attempt status. I will check the generation job on this account.";
    case "billing":
      return "Ask about credits, plans, or a payment that did not land. I will read your balance and latest payment record — no extra credits are used for this chat.";
    case "technical":
      return "Describe the error (resume upload, overlay, audio). I will check the latest document job when it is on this account.";
    case "account":
      return "I can walk through password reset, email verification, and login. For account changes an agent may need to join.";
    default:
      return "Tell me what is going on. I will check your Career Pilot account first and escalate to a person if needed.";
  }
}
