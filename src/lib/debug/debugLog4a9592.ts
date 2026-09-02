import { postDebugIngest, type DebugIngestFields } from "@/lib/debug/debugIngest";

/** Session 4a9592 debug ingest — Government Exam generation/credit/polling. */
export function debugLog4a9592(payload: DebugIngestFields): void {
  postDebugIngest("4a9592", payload);
}
