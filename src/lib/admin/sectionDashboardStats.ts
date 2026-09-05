import { supabase } from "@/integrations/supabase/client";

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

function isoStartOfToday(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

/** Minimal chainable filter surface used by the dashboard count helpers. */
type CountFilterChain = {
  eq(col: string, val: unknown): CountFilterChain;
  neq(col: string, val: unknown): CountFilterChain;
  gte(col: string, val: unknown): CountFilterChain;
  is(col: string, val: unknown): CountFilterChain;
};

async function countWhere(
  table: string,
  apply?: (q: CountFilterChain) => CountFilterChain,
): Promise<number> {
  let q = (supabase as any).from(table).select("*", { count: "exact", head: true });
  if (apply) q = apply(q as CountFilterChain);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export type AuditLogDashboardStats = {
  total: number;
  today: number;
  last7d: number;
};

export async function fetchAuditLogDashboardStats(): Promise<AuditLogDashboardStats> {
  const [total, today, last7d] = await Promise.all([
    countWhere("admin_audit_log"),
    countWhere("admin_audit_log", (q) => q.gte("created_at", isoStartOfToday())),
    countWhere("admin_audit_log", (q) => q.gte("created_at", isoDaysAgo(7))),
  ]);
  return { total, today, last7d };
}

export type ComplianceLogDashboardStats = {
  total: number;
  success: number;
  failure: number;
  blocked: number;
  anonymous: number;
  today: number;
};

export async function fetchComplianceLogDashboardStats(): Promise<ComplianceLogDashboardStats> {
  const [total, success, failure, blocked, anonymous, today] = await Promise.all([
    countWhere("audit_logs"),
    countWhere("audit_logs", (q) => q.eq("status", "success")),
    countWhere("audit_logs", (q) => q.eq("status", "failure")),
    countWhere("audit_logs", (q) => q.eq("status", "blocked")),
    countWhere("audit_logs", (q) => q.is("user_id", null)),
    countWhere("audit_logs", (q) => q.gte("created_at", isoStartOfToday())),
  ]);
  return { total, success, failure, blocked, anonymous, today };
}

export type SupportDashboardStats = {
  total: number;
  open: number;
  pending: number;
  resolved: number;
  unread: number;
  highPriority: number;
};

export async function fetchSupportDashboardStats(): Promise<SupportDashboardStats> {
  const [total, open, pending, resolved, unread, highPriority] = await Promise.all([
    countWhere("support_threads"),
    countWhere("support_threads", (q) => q.eq("status", "open")),
    countWhere("support_threads", (q) => q.eq("status", "pending")),
    countWhere("support_threads", (q) => q.eq("status", "resolved")),
    countWhere("support_threads", (q) => q.eq("unread_for_admin", true)),
    countWhere("support_threads", (q) => q.eq("priority", "high")),
  ]);
  return { total, open, pending, resolved, unread, highPriority };
}

export type UsersDashboardStats = {
  total: number;
  pro: number;
  free: number;
  banned: number;
  new7d: number;
};

export async function fetchUsersDashboardStats(): Promise<UsersDashboardStats> {
  const [total, pro, free, banned, new7d] = await Promise.all([
    countWhere("profiles"),
    countWhere("profiles", (q) => q.neq("plan_id", "free")),
    countWhere("profiles", (q) => q.eq("plan_id", "free")),
    countWhere("profiles", (q) => q.eq("is_banned", true)),
    countWhere("profiles", (q) => q.gte("created_at", isoDaysAgo(7))),
  ]);
  return { total, pro, free, banned, new7d };
}
