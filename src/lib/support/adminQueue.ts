export type SupportQueueFilter =
  | "all"
  | "open"
  | "pending"
  | "escalated"
  | "assigned"
  | "resolved";

export type SupportQueueThread = {
  status: string;
  mode?: string | null;
  assigned_admin_id?: string | null;
};

export function threadMatchesQueue(
  thread: SupportQueueThread,
  filter: SupportQueueFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "escalated") return thread.mode === "waiting_agent";
  if (filter === "assigned") return Boolean(thread.assigned_admin_id);
  if (filter === "open") return thread.status === "open" && thread.mode !== "waiting_agent";
  return thread.status === filter;
}

export function eventVisibleToUser(visibility: string | null | undefined): boolean {
  return visibility === "user";
}
