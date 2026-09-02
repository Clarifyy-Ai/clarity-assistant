import { postDebugIngest, type DebugIngestFields } from "@/lib/debug/debugIngest";

/** Session 161d95 debug ingest. Dev-only — never calls localhost from the browser. */
export function debugLog161d95(payload: DebugIngestFields): void {
  postDebugIngest("161d95", payload);
}
