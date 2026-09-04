import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { buildShareUrl } from "@/lib/utils";
import type { SessionShareabilityCode } from "@/lib/session/sessionShareability";

export type IssueShareTokenResponse = {
  success?: boolean;
  share_token?: string;
  share_url_path?: string;
  share_url?: string;
  code?: SessionShareabilityCode | string;
  message?: string;
  error?: string;
  completion?: string;
  shareable?: boolean;
  session_completed?: boolean;
  idempotent?: boolean;
  is_shared?: boolean;
  revoked?: boolean;
};

export async function issueShareToken(
  sessionId: string,
  action: "issue" | "revoke" | "status" = "issue",
): Promise<IssueShareTokenResponse> {
  const data = await fetchEdgeJson<IssueShareTokenResponse>(
    "issue-share-token",
    { session_id: sessionId, action },
    { timeoutMs: 30_000 },
  );
  const token =
    typeof data.share_token === "string" && data.share_token.trim().length >= 16
      ? data.share_token.trim()
      : null;
  return {
    ...data,
    share_url: token ? buildShareUrl(token) : data.share_url,
  };
}
