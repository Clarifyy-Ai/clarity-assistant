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
