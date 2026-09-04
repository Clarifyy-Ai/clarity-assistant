/**
 * Owner storage usage for Settings → Data & Export.
 * Never invents GB figures — surfaces Unavailable when measurement fails.
 */

import { fetchEdgeJson } from "@/lib/network/fetchEdge";

export type StorageSegmentStatus = "ok" | "unavailable";

export type StorageSegment = {
  count: number;
  bytes: number | null;
  status: StorageSegmentStatus;
  reason?: string;
};

export type UserStorageUsage = {
  sessions: StorageSegment;
  transcripts: StorageSegment;
  documents: StorageSegment;
  total: StorageSegment;
  measured_at: string;
};

export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) return "Unavailable";
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const rounded = value >= 10 || unit === 0 ? Math.round(value) : Math.round(value * 10) / 10;
  return `${rounded} ${units[unit]}`;
}

export function formatStorageCardValue(segment: StorageSegment | null | undefined): string {
  if (!segment) return "Unavailable";
  if (segment.status === "unavailable" && segment.bytes == null) {
    return "Unavailable";
  }
  if (segment.bytes == null) return "Unavailable";
  return formatBytes(segment.bytes);
}

export function formatStorageCardSubtext(segment: StorageSegment | null | undefined): string {
  if (!segment) return "Could not load";
  if (segment.status === "unavailable" && segment.bytes == null) {
    return segment.reason?.trim() || "Measurement unavailable";
  }
  const n = segment.count;
  return `${n} item${n === 1 ? "" : "s"}`;
}

function asSegment(raw: unknown): StorageSegment {
  if (!raw || typeof raw !== "object") {
    return { count: 0, bytes: null, status: "unavailable", reason: "Invalid response" };
  }
  const record = raw as Record<string, unknown>;
  const count = Number(record.count);
  const bytesRaw = record.bytes;
  const bytes =
    bytesRaw === null || bytesRaw === undefined
      ? null
      : Number.isFinite(Number(bytesRaw))
        ? Number(bytesRaw)
        : null;
  const status = record.status === "ok" ? "ok" : "unavailable";
  return {
    count: Number.isFinite(count) && count >= 0 ? count : 0,
    bytes,
    status,
    reason: typeof record.reason === "string" ? record.reason : undefined,
  };
}

export async function fetchStorageUsage(): Promise<UserStorageUsage> {
  const payload = await fetchEdgeJson<{
    success?: boolean;
    sessions?: unknown;
    transcripts?: unknown;
    documents?: unknown;
    total?: unknown;
    measured_at?: string;
  }>("get-user-storage-usage", {});

  return {
    sessions: asSegment(payload.sessions),
    transcripts: asSegment(payload.transcripts),
    documents: asSegment(payload.documents),
    total: asSegment(payload.total),
    measured_at:
      typeof payload.measured_at === "string" && payload.measured_at
        ? payload.measured_at
        : new Date().toISOString(),
  };
}

/** Empty-account baseline used when the API reports zeros. */
export function emptyStorageUsage(): UserStorageUsage {
  const zero: StorageSegment = { count: 0, bytes: 0, status: "ok" };
  return {
    sessions: zero,
    transcripts: zero,
    documents: zero,
    total: zero,
    measured_at: new Date().toISOString(),
  };
}
