type LogLevel = "debug" | "info" | "warn" | "error";

interface LogContext {
  requestId?: string;
  userId?: string;
  action?: string;
  duration_ms?: number;
  [key: string]: unknown;
}

const REDACTED_KEYS = [
  "apiKey",
  "token",
  "password",
  "secret",
  "authorization",
  "transcript",
  "full_transcript",
  "transcript_chunk",
  "utterance",
  "utterances",
  "document",
  "document_text",
  "prompt",
  "resume",
  "session_text",
  "answer_text",
];

function log(level: LogLevel, message: string, context?: LogContext): void {
  const sentryReady = Boolean((Deno.env.get("SENTRY_DSN") ?? "").trim());
  const entry: Record<string, unknown> = {
    level,
    message,
    timestamp: new Date().toISOString(),
    service: "Clarify AI-edge",
    ...(level === "error" ? { sentry_ready: sentryReady } : {}),
    ...context,
  };

  for (const key of Object.keys(entry)) {
    if (REDACTED_KEYS.some((redacted) => redacted.toLowerCase() === key.toLowerCase())) {
      entry[key] = "[REDACTED]";
    }
  }

  const output = JSON.stringify(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

export const logger = {
  debug: (msg: string, ctx?: LogContext) => log("debug", msg, ctx),
  info: (msg: string, ctx?: LogContext) => log("info", msg, ctx),
  warn: (msg: string, ctx?: LogContext) => log("warn", msg, ctx),
  error: (msg: string, ctx?: LogContext) => log("error", msg, ctx),
};

export function withRequestId(): string {
  return crypto.randomUUID();
}

export { skipTrainingSink, hasAiTrainingConsent } from "./aiTrainingConsent.ts";
