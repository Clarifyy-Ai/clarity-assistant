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
  operation: () => Promise<{ data: T | null; error: unknown }>,
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
      summary:  summary ?? null,
    });
  },

  async delete(sessionId: string): Promise<void> {
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("id", sessionId);

    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "sessions", operation: "delete" });
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

    if (type) q = q.eq("type", type);

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
