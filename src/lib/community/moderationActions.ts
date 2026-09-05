import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type ModerationAction =
  | "hide_post"
  | "restore_post"
  | "resolve_post"
  | "lock_post"
  | "unlock_post"
  | "delete_post"
  | "delete_answer"
  | "resolve_report"
  | "dismiss_report";

export async function runCommunityModeration(
  action: ModerationAction,
  targetId: string,
): Promise<void> {
  await fetchEdgeJson("moderate-content", { action, target_id: targetId });
}
