/**
 * Map export-user-data / client export failures to safe user-facing copy.
 * Never surface HTTP status text, PostgREST, or stack traces.
 */

export type ExportErrorBody = {
  error?: string;
  code?: string;
  retryAfterSeconds?: number;
};

const RATE_LIMIT_MESSAGE = "Export limit reached. Please try again in a few minutes.";

const GENERIC_EXPORT_FAILED = "We couldn't prepare your export. Please try again in a moment.";

export function messageForExportCode(code: string | undefined): string {
  switch (code) {
    case "RATE_LIMITED":
    case "RATE_LIMIT_BACKEND_UNAVAILABLE":
      return RATE_LIMIT_MESSAGE;
    case "INVALID_EXPORT_TYPE":
      return "That export type isn't supported. Please try again.";
    case "INVALID_EXPORT_REQUEST":
      return "Those export filters are invalid. Please try again.";
    case "FORBIDDEN":
      return "You can only export your own session data.";
    case "NO_DATA":
      return "There is no completed session data to export.";
    case "UNAUTHORIZED":
      return "Please sign in again to export your data.";
    case "EXPORT_FAILED":
      return GENERIC_EXPORT_FAILED;
    case "EXPORT_IN_PROGRESS":
      return "An export is already in progress. Please wait a moment and try again.";
    default:
      return GENERIC_EXPORT_FAILED;
  }
}

/**
 * Parse a failed export Response into a safe toast/message string.
 * Does not throw.
 */
export async function messageFromExportResponse(res: Response): Promise<string> {
  let body: ExportErrorBody | null = null;
  try {
    body = (await res.json()) as ExportErrorBody;
  } catch {
    body = null;
  }

  if (body?.code) {
    return messageForExportCode(body.code);
  }

  if (res.status === 429 || res.status === 503) {
    return RATE_LIMIT_MESSAGE;
  }

  return GENERIC_EXPORT_FAILED;
}

export function messageFromExportCaught(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // Known safe messages from fetchEdge private-mode / network helpers
    if (
      msg.includes("Private mode") ||
      msg.includes("timed out") ||
      msg.includes("cancelled") ||
      msg.includes("internet connection") ||
      msg.includes("did not go through")
    ) {
      return msg;
    }
  }
  return GENERIC_EXPORT_FAILED;
}

/** Create a stable-enough client idempotency key for one export click. */
export function createExportIdempotencyKey(type: string): string {
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `export_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
  const key = `export-${type}-${uuid}`;
  return key.slice(0, 150);
}
