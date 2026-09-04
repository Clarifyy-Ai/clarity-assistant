import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { createIdempotencyKey } from "@/lib/network/idempotency";
import {
  getAiUserFacingError,
  openUpgradeIfInsufficientCredits,
} from "@/lib/network/aiErrorUx";

/**
 * Fire-and-forget (or awaited) scorecard generation for a completed session.
 * Idempotent when the edge already has a scorecard for the session.
 */
export async function enqueueSessionScorecard(
  sessionId: string,
  options?: { awaitResult?: boolean },
): Promise<{ error: string | null }> {
  const id = sessionId.trim();
  if (!id) return { error: "Missing session id" };

  const run = async (): Promise<{ error: string | null }> => {
    try {
      await fetchEdgeJson(
        "generate-scorecard",
        { session_id: id },
        {
          timeoutMs: 90_000,
          headers: {
            "x-idempotency-key": createIdempotencyKey(`scorecard:${id}`),
          },
        },
      );
      return { error: null };
    } catch (err) {
      openUpgradeIfInsufficientCredits(err);
      return {
        error:
          getAiUserFacingError(err) ||
          "Scorecard analysis failed. Open the Scorecard page to retry.",
      };
    }
  };

  if (options?.awaitResult === false) {
    void run();
    return { error: null };
  }
  return run();
}
