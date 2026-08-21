/**
 * Buffer-complete structured JSON parser for AI provider output.
 * Never parse a partial stream chunk. Bound size. Classify failures.
 */

export const AI_RESPONSE_INVALID = "AI_RESPONSE_INVALID" as const;

export const AI_RESPONSE_INVALID_MESSAGE =
  "We could not process the AI response. Your input is safe. Please try again.";

export type StructuredParseCategory =
  | "ok"
  | "empty"
  | "truncated"
  | "malformed"
  | "schema_mismatch"
  | "incomplete_stream"
  | "timeout"
  | "unavailable";

export interface StructuredParseResult<T> {
  ok: boolean;
  value: T | null;
  category: StructuredParseCategory;
  length: number;
}

const MAX_PARSE_CHARS = 200_000;

export function stripMarkdownFences(raw: string): string {
  const trimmed = String(raw ?? "").trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)```$/i);
  if (fenced?.[1]) return fenced[1].trim();
  return trimmed
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
}

function extractFirstJsonValue(input: string): string | null {
  const objStart = input.indexOf("{");
  const arrStart = input.indexOf("[");
  let start = -1;
  let open = "";
  let close = "";
  if (objStart === -1 && arrStart === -1) return null;
  if (objStart === -1 || (arrStart !== -1 && arrStart < objStart)) {
    start = arrStart;
    open = "[";
    close = "]";
  } else {
    start = objStart;
    open = "{";
    close = "}";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === "\"") {
        inString = false;
      }
      continue;
    }
    if (ch === "\"") {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return input.slice(start, i + 1);
    }
  }
  return null;
}

export function classifyJsonFailure(raw: string, parseError: string): StructuredParseCategory {
  const text = String(raw ?? "");
  if (!text.trim()) return "empty";
  const lower = parseError.toLowerCase();
  if (lower.includes("unterminated") || lower.includes("unexpected end")) return "truncated";
  if (text.includes("```") && !text.includes("{") && !text.includes("[")) return "malformed";
  const openObj = (text.match(/{/g) ?? []).length;
  const closeObj = (text.match(/}/g) ?? []).length;
  if (openObj > closeObj) return "truncated";
  if (/finish[_ ]?reason|max_tokens|length/i.test(text)) return "truncated";
  return "malformed";
}

export function parseStructuredJson<T>(
  raw: string,
  validate?: (value: unknown) => value is T,
): StructuredParseResult<T> {
  const length = String(raw ?? "").length;
  if (!raw || !String(raw).trim()) {
    return { ok: false, value: null, category: "empty", length };
  }
  if (length > MAX_PARSE_CHARS) {
    return { ok: false, value: null, category: "truncated", length };
  }

  const stripped = stripMarkdownFences(raw);
  const candidate = extractFirstJsonValue(stripped) ?? stripped;

  try {
    const parsed: unknown = JSON.parse(candidate);
    if (validate && !validate(parsed)) {
      return { ok: false, value: null, category: "schema_mismatch", length };
    }
    return { ok: true, value: parsed as T, category: "ok", length };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      value: null,
      category: classifyJsonFailure(candidate, msg),
      length,
    };
  }
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export interface RephraseAlternatives {
  formal: string;
  confident: string;
  concise: string;
}

export function isRephraseAlternatives(value: unknown): value is RephraseAlternatives {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    isNonEmptyString(row.formal) &&
    isNonEmptyString(row.confident) &&
    isNonEmptyString(row.concise)
  );
}

export interface StarStructuredAnswer {
  situation: string;
  task: string;
  action: string;
  result: string;
  fullAnswer: string;
}

export function isStarStructuredAnswer(value: unknown): value is StarStructuredAnswer {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  const situation = typeof row.situation === "string" ? row.situation : "";
  const task = typeof row.task === "string" ? row.task : "";
  const action = typeof row.action === "string" ? row.action : "";
  const result = typeof row.result === "string" ? row.result : "";
  const fullAnswer = typeof row.fullAnswer === "string" ? row.fullAnswer : "";
  const combined = `${situation}${task}${action}${result}${fullAnswer}`.trim();
  return combined.length > 0;
}

export function normalizeStarAnswer(value: unknown): StarStructuredAnswer | null {
  if (!isStarStructuredAnswer(value)) return null;
  const situation = value.situation.trim();
  const task = value.task.trim();
  const action = value.action.trim();
  const result = value.result.trim();
  const fullAnswer =
    value.fullAnswer.trim() ||
    [situation && `Situation: ${situation}`, task && `Task: ${task}`, action && `Action: ${action}`, result && `Result: ${result}`]
      .filter(Boolean)
      .join("\n\n");
  if (!fullAnswer) return null;
  return { situation, task, action, result, fullAnswer };
}

export function isRawJsonParseError(err: unknown): boolean {
  const msg =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : "";
  const lower = msg.toLowerCase();
  return (
    lower.includes("unterminated string") ||
    lower.includes("unexpected token") ||
    lower.includes("unexpected end of json") ||
    lower.includes("json.parse") ||
    (err instanceof SyntaxError && lower.includes("json"))
  );
}
