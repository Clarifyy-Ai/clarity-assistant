// ─────────────────────────────────────────────────────────────────────────────
// database.ts — Domain-specific query builders for each Supabase table.
// Provides typed, reusable query functions for all CRUD operations.
// Never write raw supabase.from() calls outside this file.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase/client";
import { DatabaseError, ErrorCode, tryCatch } from "@/lib/errors";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase";

// ─── Generic Query Helper ─────────────────────────────────────────────────────

async function query<T>(
  operation: () => PromiseLike<{ data: T | null; error: unknown }>,
  context: { table: string; operation: string }
): Promise<T> {
  const [data, err] = await tryCatch(async () => {
    const { data, error } = await operation();
    if (error) throw error;
    if (data === null) throw new DatabaseError(
      `No data returned from ${context.table}.${context.operation}`,
      ErrorCode.DB_RECORD_NOT_FOUND,
      context
    );
    return data;
  });

  if (err || data === null) {
    throw new DatabaseError(
      err?.message ?? `Query failed on ${context.table}`,
      ErrorCode.DB_QUERY_FAILED,
      context
    );
  }

  return data!;
}

// ─── Profiles ─────────────────────────────────────────────────────────────────

export const profilesDB = {
  async getById(userId: string): Promise<Tables<"profiles">> {
    return query(
      () => supabase.from("profiles").select("*").eq("id", userId).single(),
      { table: "profiles", operation: "getById" }
    );
  },

  async update(
    userId: string,
    updates: TablesUpdate<"profiles">
  ): Promise<Tables<"profiles">> {
    return query(
      () => supabase
        .from("profiles")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select()
        .single(),
      { table: "profiles", operation: "update" }
    );
  },

  async upsert(profile: TablesInsert<"profiles">): Promise<Tables<"profiles">> {
    return query(
      () => supabase
        .from("profiles")
        .upsert({ ...profile, updated_at: new Date().toISOString() })
        .select()
        .single(),
      { table: "profiles", operation: "upsert" }
    );
  },
};

// ─── Sessions ─────────────────────────────────────────────────────────────────

export const sessionsDB = {
  async create(session: TablesInsert<"sessions">): Promise<Tables<"sessions">> {
    return query(
      () => supabase.from("sessions").insert(session).select().single(),
      { table: "sessions", operation: "create" }
    );
  },

  async getById(sessionId: string): Promise<Tables<"sessions">> {
    return query(
      () => supabase.from("sessions").select("*").eq("id", sessionId).single(),
      { table: "sessions", operation: "getById" }
    );
  },

  async getByUserId(
    userId: string,
    limit = 20,
    offset = 0
  ): Promise<Tables<"sessions">[]> {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "sessions", operation: "getByUserId" });

    return data ?? [];
  },

  async update(
    sessionId: string,
    updates: TablesUpdate<"sessions">
  ): Promise<Tables<"sessions">> {
    return query(
      () => supabase
        .from("sessions")
        .update({ ...updates, updated_at: new Date().toISOString() })
        .eq("id", sessionId)
        .select()
        .single(),
      { table: "sessions", operation: "update" }
    );
  },

  async end(sessionId: string, summary?: string): Promise<Tables<"sessions">> {
    return sessionsDB.update(sessionId, {
      status:  "completed",
      ended_at: new Date().toISOString(),
      ...(summary ? { summary } : {}),
    } as any);
  },

  async delete(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "sessions", operation: "delete" });
  },

  async countCompletedByUserId(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "completed");

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "countCompletedByUserId",
      });
    }
    return count ?? 0;
  },
};

// ─── Interviews ────────────────────────────────────────────────────────────────

export const interviewsDB = {
  async create(interview: TablesInsert<"interviews">): Promise<Tables<"interviews">> {
    return query(
      () => supabase.from("interviews").insert(interview).select().single(),
      { table: "interviews", operation: "create" }
    );
  },

  async getById(interviewId: string): Promise<Tables<"interviews">> {
    return query(
      () => supabase.from("interviews").select("*").eq("id", interviewId).single(),
      { table: "interviews", operation: "getById" }
    );
  },

  async getByUserId(userId: string, limit = 20): Promise<Tables<"interviews">[]> {
    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .eq("user_id", userId)
      .order("scheduled_at", { ascending: true })
      .limit(limit);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "interviews", operation: "getByUserId" });

    return data ?? [];
  },

  async getUpcoming(userId: string): Promise<Tables<"interviews">[]> {
    const { data, error } = await supabase
      .from("interviews")
      .select("*")
      .eq("user_id", userId)
      .gte("scheduled_at", new Date().toISOString())
      .order("scheduled_at", { ascending: true });

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "interviews", operation: "getUpcoming" });

    return data ?? [];
  },

  async update(
    interviewId: string,
    updates: TablesUpdate<"interviews">
  ): Promise<Tables<"interviews">> {
    return query(
      () => supabase
        .from("interviews")
        .update(updates)
        .eq("id", interviewId)
        .select()
        .single(),
      { table: "interviews", operation: "update" }
    );
  },

  async delete(interviewId: string): Promise<void> {
    const { error } = await supabase
      .from("interviews")
      .delete()
      .eq("id", interviewId);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "interviews", operation: "delete" });
  },
};

// ─── Documents ────────────────────────────────────────────────────────────────

export const documentsDB = {
  async create(doc: TablesInsert<"documents">): Promise<Tables<"documents">> {
    return query(
      () => supabase.from("documents").insert(doc).select().single(),
      { table: "documents", operation: "create" }
    );
  },

  async getByUserId(
    userId: string,
    type?: string
  ): Promise<Tables<"documents">[]> {
    let q = supabase
      .from("documents")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (type) q = q.eq("type", type as any);

    const { data, error } = await q;

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "documents", operation: "getByUserId" });

    return data ?? [];
  },

  async getById(docId: string): Promise<Tables<"documents">> {
    return query(
      () => supabase.from("documents").select("id, title, type, user_id, is_primary, is_active, file_name, file_size, file_url, mime_type, company_name, job_title, job_location, salary_range, keywords, requirements, parsed_skills, parsed_summary, parsed_education, parsed_experience, is_remote, created_at, updated_at").eq("id", docId).single(),
      { table: "documents", operation: "getById" }
    );
  },

  async update(
    docId: string,
    updates: TablesUpdate<"documents">
  ): Promise<Tables<"documents">> {
    return query(
      () => supabase
        .from("documents")
        .update(updates)
        .eq("id", docId)
        .select()
        .single(),
      { table: "documents", operation: "update" }
    );
  },

  async delete(docId: string): Promise<void> {
    const { error } = await supabase
      .from("documents")
      .delete()
      .eq("id", docId);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "documents", operation: "delete" });
  },
};

// ─── Feedback ─────────────────────────────────────────────────────────────────

export const feedbackDB = {
  async create(feedback: TablesInsert<"feedback">): Promise<Tables<"feedback">> {
    return query(
      () => supabase.from("feedback").insert(feedback).select().single(),
      { table: "feedback", operation: "create" }
    );
  },

  async getBySessionId(sessionId: string): Promise<Tables<"feedback">[]> {
    const { data, error } = await supabase
      .from("feedback")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "feedback", operation: "getBySessionId" });

    return data ?? [];
  },
};

// ─── Credits ──────────────────────────────────────────────────────────────────

export const creditsDB = {
  async getByUserId(userId: string): Promise<Tables<"credits"> | null> {
    const { data } = await supabase
      .from("credits")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();
    return data ?? null;
  },

  async upsert(record: TablesInsert<"credits">): Promise<Tables<"credits">> {
    return query(
      () => supabase.from("credits").upsert(record).select().single(),
      { table: "credits", operation: "upsert" }
    );
  },

  async deduct(userId: string, amount: number, action = "usage"): Promise<void> {
    const { error } = await supabase.rpc("deduct_credits", {
      p_action: action,
      p_cost:   amount,
    });
    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "credits", operation: "deduct" });
  },

  async add(userId: string, amount: number): Promise<void> {
    const { error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount:  amount,
    });
    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "credits", operation: "add" });
  },
};

// ─── Subscriptions ────────────────────────────────────────────────────────────

export const subscriptionsDB = {
  async getActiveByUserId(userId: string): Promise<Tables<"subscriptions"> | null> {
    const { data } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .in("status", ["active", "trialing", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return data ?? null;
  },

  async upsert(sub: TablesInsert<"subscriptions">): Promise<Tables<"subscriptions">> {
    return query(
      () => supabase.from("subscriptions").upsert(sub).select().single(),
      { table: "subscriptions", operation: "upsert" }
    );
  },
};

// ─── Answer bank ──────────────────────────────────────────────────────────────

export const answerBankDB = {
  async listByUserId(userId: string): Promise<Tables<"answer_bank">[]> {
    const { data, error } = await supabase
      .from("answer_bank")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "answer_bank",
        operation: "listByUserId",
      });
    }
    return data ?? [];
  },

  async getById(userId: string, id: string): Promise<Tables<"answer_bank">> {
    return query(
      () =>
        supabase
          .from("answer_bank")
          .select("*")
          .eq("id", id)
          .eq("user_id", userId)
          .single(),
      { table: "answer_bank", operation: "getById" }
    );
  },

  async update(
    userId: string,
    id: string,
    updates: TablesUpdate<"answer_bank">
  ): Promise<Tables<"answer_bank">> {
    return query(
      () =>
        supabase
          .from("answer_bank")
          .update({ ...updates, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", userId)
          .select()
          .single(),
      { table: "answer_bank", operation: "update" }
    );
  },

  async delete(userId: string, id: string): Promise<void> {
    const { error } = await supabase
      .from("answer_bank")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "answer_bank",
        operation: "delete",
      });
    }
  },

  async create(
    userId: string,
    row: Omit<TablesInsert<"answer_bank">, "user_id">
  ): Promise<Tables<"answer_bank">> {
    return query(
      () =>
        supabase
          .from("answer_bank")
          .insert({ ...row, user_id: userId })
          .select()
          .single(),
      { table: "answer_bank", operation: "create" }
    );
  },
};

// ─── Notifications ────────────────────────────────────────────────────────────

export const notificationsDB = {
  async listByUserId(userId: string, limit = 50): Promise<Tables<"notifications">[]> {
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "notifications",
        operation: "listByUserId",
      });
    }
    return data ?? [];
  },

  async markRead(id: string): Promise<void> {
    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "notifications",
        operation: "markRead",
      });
    }
  },

  async markAllRead(userId: string): Promise<void> {
    const { error: rpcError } = await supabase.rpc("mark_notifications_read", {
      p_user_id: userId,
    });
    if (!rpcError) return;

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("user_id", userId)
      .eq("is_read", false);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "notifications",
        operation: "markAllRead",
      });
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("notifications").delete().eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "notifications",
        operation: "delete",
      });
    }
  },
};

// ─── Referrals ────────────────────────────────────────────────────────────────

export const referralsDB = {
  async getStats(userId: string): Promise<{ invitedCount: number; creditsEarned: number }> {
    const { count, error: countErr } = await supabase
      .from("referrals")
      .select("*", { count: "exact", head: true })
      .eq("referrer_id", userId);

    if (countErr) {
      throw new DatabaseError(countErr.message, ErrorCode.DB_QUERY_FAILED, {
        table: "referrals",
        operation: "getStats.count",
      });
    }

    const { data, error: sumErr } = await supabase
      .from("referrals")
      .select("credits_awarded")
      .eq("referrer_id", userId);

    if (sumErr) {
      throw new DatabaseError(sumErr.message, ErrorCode.DB_QUERY_FAILED, {
        table: "referrals",
        operation: "getStats.credits",
      });
    }

    const creditsEarned = (data ?? []).reduce(
      (sum, r) => sum + (r.credits_awarded ?? 0),
      0,
    );

    return { invitedCount: count ?? 0, creditsEarned };
  },
};

// ─── Practice rooms ───────────────────────────────────────────────────────────

export const practiceRoomsDB = {
  async listRecent(limit = 50): Promise<Tables<"practice_rooms">[]> {
    const { data, error } = await supabase
      .from("practice_rooms")
      .select("id, name, description, status, max_players, is_public, host_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "practice_rooms",
        operation: "listRecent",
      });
    }
    return data ?? [];
  },
};

// ─── Credit transactions (read-only from client) ─────────────────────────────

export type CreditTransactionRow = Pick<
  Tables<"credit_transactions">,
  "id" | "user_id" | "amount" | "action" | "created_at" | "session_id" | "description"
>;

export const creditsDB = {
  async listByUserId(userId: string, limit = 50): Promise<CreditTransactionRow[]> {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, user_id, amount, action, created_at, session_id, description")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "listByUserId",
      });
    }
    return data ?? [];
  },

  async listByUserIdWithBalance(userId: string, limit = 100) {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, action, amount, balance_after, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "listByUserIdWithBalance",
      });
    }
    return data ?? [];
  },

  async listRecent(limit = 50): Promise<CreditTransactionRow[]> {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, user_id, amount, action, created_at, session_id, description")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "listRecent",
      });
    }
    return data ?? [];
  },

  async sumPurchasesSince(sinceIso: string): Promise<number> {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("amount, action")
      .gte("created_at", sinceIso);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "sumPurchasesSince",
      });
    }

    return (data ?? [])
      .filter((tx) => String(tx.action ?? "").includes("purchase"))
      .reduce((sum, tx) => sum + Math.abs(Number(tx.amount) || 0), 0);
  },

  async monthlyRevenueByPlan(sinceIso: string): Promise<
    { month: string; planId: string; totalCents: number }[]
  > {
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("amount, action, created_at, user_id")
      .gte("created_at", sinceIso)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "monthlyRevenueByPlan",
      });
    }

    const userIds = [...new Set((data ?? []).map((r) => r.user_id).filter(Boolean))];
    const planByUser: Record<string, string> = {};

    if (userIds.length > 0) {
      const { data: profiles, error: profileErr } = await supabase
        .from("profiles")
        .select("id, plan_id")
        .in("id", userIds);

      if (profileErr) {
        throw new DatabaseError(profileErr.message, ErrorCode.DB_QUERY_FAILED, {
          table: "profiles",
          operation: "monthlyRevenueByPlan.plans",
        });
      }

      (profiles ?? []).forEach((p) => {
        if (p.id) planByUser[p.id] = p.plan_id ?? "free";
      });
    }

    const bucket: Record<string, number> = {};
    for (const tx of data ?? []) {
      const action = String(tx.action ?? "");
      if (!action.includes("subscription") && !action.includes("purchase")) continue;
      const month = tx.created_at?.slice(0, 7) ?? "unknown";
      const planId = planByUser[tx.user_id] ?? "unknown";
      const key = `${month}|${planId}`;
      bucket[key] = (bucket[key] ?? 0) + Math.abs(Number(tx.amount) || 0);
    }

    return Object.entries(bucket).map(([key, totalCents]) => {
      const [month, planId] = key.split("|");
      return { month, planId, totalCents };
    });
  },
};

// ─── Admin analytics (admin pages only) ───────────────────────────────────────

type AdminPerfRow = {
  function_name: string;
  call_count: number;
  avg_ms: number;
  p50_ms: number;
  p95_ms: number;
  p99_ms: number;
  error_count: number;
  error_rate: number;
};

type AdminDauRow = { day?: string; dau?: number };

export const adminAnalyticsDB = {
  async countSessionsSince(sinceIso: string): Promise<number> {
    const { count, error } = await supabase
      .from("sessions")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sinceIso);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "countSessionsSince",
      });
    }
    return count ?? 0;
  },

  async countSignupsSince(sinceIso: string): Promise<number> {
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sinceIso);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "countSignupsSince",
      });
    }
    return count ?? 0;
  },

  async countSignupsOnDay(day: string): Promise<number> {
    const { count, error } = await supabase
      .from("profiles")
      .select("*", { count: "exact", head: true })
      .gte("created_at", `${day}T00:00:00`)
      .lt("created_at", `${day}T23:59:59`);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "countSignupsOnDay",
      });
    }
    return count ?? 0;
  },

  async getDauMauSeries(days: number): Promise<AdminDauRow[]> {
    const { data, error } = await supabase.rpc("get_admin_dau_mau", { p_days: days });
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "rpc",
        operation: "get_admin_dau_mau",
      });
    }
    return (data ?? []) as AdminDauRow[];
  },

  async getPerfStats(days: number): Promise<AdminPerfRow[]> {
    const { data, error } = await supabase.rpc("get_admin_perf_stats", { p_days: days });
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "rpc",
        operation: "get_admin_perf_stats",
      });
    }
    return (data ?? []) as AdminPerfRow[];
  },

  async getModelCostLogsSince(sinceIso: string) {
    const { data, error } = await supabase
      .from("model_cost_logs")
      .select("model, tokens_in, tokens_out, cost_usd, credits_charged")
      .gte("created_at", sinceIso);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "model_cost_logs",
        operation: "getModelCostLogsSince",
      });
    }
    return data ?? [];
  },

  async countMockTestsCreatedSince(sinceIso: string): Promise<number> {
    const { count, error } = await supabase
      .from("mock_tests")
      .select("*", { count: "exact", head: true })
      .gte("created_at", sinceIso);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "mock_tests",
        operation: "countMockTestsCreatedSince",
      });
    }
    return count ?? 0;
  },

  async countMockTestsSubmittedSince(sinceIso: string): Promise<number> {
    const { count, error } = await supabase
      .from("mock_tests")
      .select("*", { count: "exact", head: true })
      .gte("submitted_at", sinceIso)
      .not("submitted_at", "is", null);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "mock_tests",
        operation: "countMockTestsSubmittedSince",
      });
    }
    return count ?? 0;
  },

  async getQuestionExamTypesSince(sinceIso: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("questions")
      .select("exam_type")
      .gte("created_at", sinceIso);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "getQuestionExamTypesSince",
      });
    }
    return (data ?? []).map((r) => r.exam_type ?? "Other");
  },

  async getSupportThreadStats(sinceIso: string): Promise<{
    open: number;
    resolved: number;
    avgResolutionHours: number;
  }> {
    const [{ count: open }, { count: resolved }, { data: resolvedRows }] =
      await Promise.all([
        supabase
          .from("support_threads")
          .select("*", { count: "exact", head: true })
          .eq("status", "open"),
        supabase
          .from("support_threads")
          .select("*", { count: "exact", head: true })
          .eq("status", "resolved")
          .gte("updated_at", sinceIso),
        supabase
          .from("support_threads")
          .select("created_at, updated_at")
          .eq("status", "resolved")
          .gte("updated_at", sinceIso)
          .limit(200),
      ]);

    const durations = (resolvedRows ?? []).map((r) =>
      (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / 3_600_000,
    );
    const avgResolutionHours = durations.length
      ? durations.reduce((s, d) => s + d, 0) / durations.length
      : 0;

    return {
      open: open ?? 0,
      resolved: resolved ?? 0,
      avgResolutionHours,
    };
  },
};

// ─── Analytics Events ────────────────────────────────────────────────────────

export const analyticsDB = {
  async track(event: TablesInsert<"analytics">): Promise<void> {
    // Fire-and-forget — don't await, don't block the UI
    supabase.from("analytics").insert(event).then(({ error }) => {
      if (error) console.warn("[analyticsDB] track failed:", error.message);
    });
  },

  async getByUserId(
    userId: string,
    eventType?: string,
    limit = 100
  ): Promise<Tables<"analytics">[]> {
    let q = supabase
      .from("analytics")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (eventType) q = q.eq("event_type", eventType);

    const { data, error } = await q;

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "analytics", operation: "getByUserId" });

    return data ?? [];
  },
};
