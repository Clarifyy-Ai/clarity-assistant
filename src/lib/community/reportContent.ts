import { supabase } from "@/lib/supabase/client";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type CommunityReportTargetType = "post" | "answer" | "comment";

export const COMMUNITY_REPORT_ALREADY_EXISTS_CODE = "COMMUNITY_REPORT_ALREADY_EXISTS";

export type SubmitCommunityReportResult =
  | { ok: true; created: true; reportId: string }
  | { ok: true; created: false; alreadyReported: true }
  | { ok: false; code: string; message: string };

export function isDuplicateCommunityReportError(
  error: { code?: string; message?: string; status?: number } | null | undefined,
): boolean {
  if (!error) return false;
  if (error.code === "23505" || error.status === 409) return true;
  return /duplicate|unique|already/i.test(error.message ?? "");
}

async function markPostReported(postId: string): Promise<void> {
  await fetchEdgeJson("moderate-content", {
    action: "mark_post_reported",
    target_id: postId,
  });
}

/**
 * Idempotent community report: checks for an existing row before insert so
 * duplicate reports never hit a 409 conflict in the network panel.
 */
export async function submitCommunityReport(input: {
  reporterId: string;
  targetType: CommunityReportTargetType;
  targetId: string;
  reason: string;
}): Promise<SubmitCommunityReportResult> {
  const { reporterId, targetType, targetId, reason } = input;

  const { data: existing, error: lookupError } = await supabase
    .from("community_reports")
    .select("id")
    .eq("reporter_id", reporterId)
    .eq("target_type", targetType)
    .eq("target_id", targetId)
    .maybeSingle();

  if (lookupError) {
    return {
      ok: false,
      code: lookupError.code ?? "COMMUNITY_REPORT_LOOKUP_FAILED",
      message: lookupError.message ?? "Could not verify report status.",
    };
  }

  if (existing?.id) {
    if (targetType === "post") {
      try {
        await markPostReported(targetId);
      } catch {
        // Report row exists; post status sync is best-effort and idempotent.
      }
    }
    return { ok: true, created: false, alreadyReported: true };
  }

  const { data, error } = await supabase
    .from("community_reports")
    .insert({
      reporter_id: reporterId,
      target_type: targetType,
      target_id: targetId,
      reason,
    })
    .select("id")
    .maybeSingle();

  if (!error && data?.id) {
    if (targetType === "post") {
      try {
        await markPostReported(targetId);
      } catch {
        // Report saved; post status sync is best-effort and idempotent.
      }
    }
    return { ok: true, created: true, reportId: data.id };
  }

  if (isDuplicateCommunityReportError(error)) {
    if (targetType === "post") {
      try {
        await markPostReported(targetId);
      } catch {
        // Report row exists; post status sync is best-effort and idempotent.
      }
    }
    return { ok: true, created: false, alreadyReported: true };
  }

  return {
    ok: false,
    code: error?.code ?? "COMMUNITY_REPORT_FAILED",
    message: error?.message ?? "Could not submit report.",
  };
}
