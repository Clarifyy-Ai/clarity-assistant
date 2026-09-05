/** Structured product observability events for Edge log drains. */

export type ProductEventName =
  | "credit_denial"
  | "session_finalize_failure"
  | "gov_exam_conflict";

export function logProductEvent(
  name: ProductEventName,
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  const payload = {
    event: name,
    ts: new Date().toISOString(),
    ...fields,
  };
  if (name === "session_finalize_failure" || name === "credit_denial") {
    console.error(JSON.stringify(payload));
  } else {
    console.warn(JSON.stringify(payload));
  }
}
