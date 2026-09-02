export type SupportQueueFilter =
  | "all"
  | "open"
  | "pending"
  | "escalated"
  | "urgent"
  | "assigned"
  | "resolved";

export type SupportPriority = "low" | "normal" | "high" | "urgent";

export type SupportQueueThread = {
  status: string;
  mode?: string | null;
  assigned_admin_id?: string | null;
  priority?: SupportPriority | null;
  last_message_at?: string;
};

const PRIORITY_RANK: Record<SupportPriority, number> = {
  urgent: 0,
  high: 1,
  normal: 2,
  low: 3,
};

export function compareSupportPriority(
  a: SupportPriority | null | undefined,
  b: SupportPriority | null | undefined,
): number {
  const pa = PRIORITY_RANK[a ?? "normal"] ?? 2;
  const pb = PRIORITY_RANK[b ?? "normal"] ?? 2;
  return pa - pb;
}

export function sortSupportQueueThreads<T extends SupportQueueThread>(threads: T[]): T[] {
  return [...threads].sort((a, b) => {
    const byPriority = compareSupportPriority(a.priority, b.priority);
    if (byPriority !== 0) return byPriority;
    const at = a.last_message_at ? new Date(a.last_message_at).getTime() : 0;
    const bt = b.last_message_at ? new Date(b.last_message_at).getTime() : 0;
    return bt - at;
  });
}

export function threadMatchesQueue(
  thread: SupportQueueThread,
  filter: SupportQueueFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "urgent") {
    return thread.priority === "urgent" && thread.mode === "waiting_agent";
  }
  if (filter === "escalated") return thread.mode === "waiting_agent";
  if (filter === "assigned") return Boolean(thread.assigned_admin_id);
  if (filter === "open") return thread.status === "open" && thread.mode !== "waiting_agent";
  return thread.status === filter;
}

export function eventVisibleToUser(visibility: string | null | undefined): boolean {
  return visibility === "user";
}
