// ─────────────────────────────────────────────────────────────────────────────
// database.ts — Domain-specific query builders for each Supabase table.
// Provides typed, reusable query functions for all CRUD operations.
// Never write raw supabase.from() calls outside this file.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase } from "@/lib/supabase/client";
import { DatabaseError, ErrorCode, tryCatch } from "@/lib/errors";
import type { Tables, TablesInsert, TablesUpdate } from "@/integrations/supabase";
import { PLAN_PRICE_CENTS_MONTHLY } from "@/lib/constants/creditEconomics";
import { toDbPreferredModel } from "@/lib/ai/modelOptions";
import {
  mapRowToScorecard,
  mapScorecardToInsert,
  type Scorecard,
  type ScorecardRow,
} from "@/types/scorecard.types";

/** Client must never PATCH these — server/RLS owns entitlement + gamification. */
const PROFILE_CLIENT_UPDATE_BLOCKLIST = new Set([
  "credits",
  "plan_id",
  "plan",
  "is_banned",
  "ban_reason",
  "stripe_customer_id",
  "subscription_id",
  "subscription_status",
  "credits_used_this_month",
  "credits_reset_at",
  "referred_by",
  "referral_code",
  "xp",
  "level",
  "total_sessions",
  "payment_failed_at",
  "pending_promo_code",
  "byok_gemini",
  "byok_openai",
  "byok_anthropic",
]);

function sanitizeProfileClientUpdate(
  updates: TablesUpdate<"profiles"> & Record<string, unknown>,
): TablesUpdate<"profiles"> {
  const safe: Record<string, unknown> = { ...updates };
  for (const key of PROFILE_CLIENT_UPDATE_BLOCKLIST) {
    delete safe[key];
  }
  if (typeof safe.preferred_model === "string") {
    safe.preferred_model = toDbPreferredModel(safe.preferred_model);
  }
  return safe as TablesUpdate<"profiles">;
}

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

// Columns readable by the authenticated user. Excludes server-side billing
// identifiers (stripe_customer_id, subscription_id) whose column-level SELECT
// is revoked from the `authenticated` role for security.
const PROFILE_SAFE_COLUMNS = [
  "audio_input_device","audio_output_device","auto_transcript","avatar_url",
  "ban_reason","bio","created_at","credits","credits_reset_at",
  "credits_used_this_month","current_company","current_title","data_collection",
  "data_retention_days","deepgram_model","deleted_at","domain","email",
  "email_notifications","experience_years","full_name","github_url","headline",
  "id","interview_date","interview_strengths","interview_weaknesses",
  "is_actively_looking","is_banned","last_active_date","last_login_at","level",
  "linkedin_url","locale","longest_streak","marketing_emails","noise_suppression",
  "notice_period","notification_prefs","onboarding_completed","onboarding_step",
  "overlay_font_size","overlay_hotkey","overlay_opacity","overlay_position",
  "payment_failed_at","phone","plan_id","preferred_language","preferred_model","preferred_salary",
  "privacy_prefs","profile_visibility","referral_code","referred_by",
  "response_style","role_type","session_reminders","stealth_mode","streak_days",
  "subscription_status","target_companies","target_role","timezone",
  "total_practice_minutes","total_sessions","updated_at","website_url","xp",
  "years_of_exp",
].join(", ");

/** Minimal columns for auth bootstrap — keeps profile load under the 2s budget. */
const PROFILE_BOOT_COLUMNS = [
  "id",
  "email",
  "full_name",
  "avatar_url",
  "credits",
  "plan_id",
  "subscription_status",
  "payment_failed_at",
  "is_banned",
  "ban_reason",
  "onboarding_completed",
  "onboarding_step",
  "preferred_model",
  "target_role",
  "role_type",
  "overlay_opacity",
  "overlay_position",
  "overlay_font_size",
  "stealth_mode",
  "timezone",
  "locale",
  "updated_at",
].join(", ");

export const profilesDB = {
  async getById(userId: string): Promise<Tables<"profiles">> {
    return query(
      () => supabase.from("profiles").select(PROFILE_SAFE_COLUMNS).eq("id", userId).single() as unknown as PromiseLike<{ data: Tables<"profiles"> | null; error: unknown }>,
      { table: "profiles", operation: "getById" }
    );
  },

  async getByIdMaybe(userId: string): Promise<Tables<"profiles"> | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select(PROFILE_BOOT_COLUMNS)
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "getByIdMaybe",
      });
    }
    return data as unknown as Tables<"profiles"> | null;
  },

  async getIdByReferralCode(code: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .limit(1);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "getIdByReferralCode",
      });
    }

    const first = (data ?? [])[0];
    return first?.id ?? null;
  },

  async update(
    userId: string,
    updates: TablesUpdate<"profiles">
  ): Promise<Tables<"profiles">> {
    const safeUpdates = sanitizeProfileClientUpdate(
      updates as TablesUpdate<"profiles"> & Record<string, unknown>,
    );
    return query(
      () => supabase
        .from("profiles")
        .update({ ...safeUpdates, updated_at: new Date().toISOString() })
        .eq("id", userId)
        .select(PROFILE_SAFE_COLUMNS)
        .single() as unknown as PromiseLike<{ data: Tables<"profiles"> | null; error: unknown }>,
      { table: "profiles", operation: "update" }
    );
  },

  async upsert(profile: TablesInsert<"profiles">): Promise<Tables<"profiles">> {
    return query(
      () => supabase
        .from("profiles")
        .upsert({ ...profile, updated_at: new Date().toISOString() })
        .select(PROFILE_SAFE_COLUMNS)
        .single() as unknown as PromiseLike<{ data: Tables<"profiles"> | null; error: unknown }>,
      { table: "profiles", operation: "upsert" }
    );
  },

  async getGamificationFields(
    userId: string,
  ): Promise<
    Pick<
      Tables<"profiles">,
      "xp" | "streak_days" | "longest_streak" | "last_active_date"
    > | null
  > {
    const { data, error } = await supabase
      .from("profiles")
      .select("xp, streak_days, longest_streak, last_active_date")
      .eq("id", userId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "getGamificationFields",
      });
    }
    return data;
  },

  async listLiteByIds(
    ids: string[],
  ): Promise<Pick<Tables<"profiles">, "id" | "full_name" | "email">[]> {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .in("id", ids);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "profiles",
        operation: "listLiteByIds",
      });
    }
    return (data ?? []) as Pick<
      Tables<"profiles">,
      "id" | "full_name" | "email"
    >[];
  },
};

// ─── User roles ───────────────────────────────────────────────────────────────

export const userRolesDB = {
  async hasRole(userId: string, role: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", role as any)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "user_roles",
        operation: "hasRole",
      });
    }
    return Boolean(data);
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

  async getByIdForUser(
    sessionId: string,
    userId: string,
  ): Promise<Tables<"sessions"> | null> {
    const { data, error } = await supabase
      .from("sessions")
      .select("*")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "getByIdForUser",
      });
    }
    return data;
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

  /** Owner-scoped update — avoids RLS 403/406 when the JWT user doesn't own the row. */
  async updateForUser(
    sessionId: string,
    userId: string,
    updates: TablesUpdate<"sessions">,
  ): Promise<Tables<"sessions"> | null> {
    const { data, error } = await supabase
      .from("sessions")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .eq("user_id", userId)
      .select()
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "updateForUser",
      });
    }
    return data;
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

  async deleteAllByUserId(userId: string): Promise<void> {
    const { error } = await supabase
      .from("sessions")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "deleteAllByUserId",
      });
    }
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

  async countByUserId(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "countByUserId",
      });
    }
    return count ?? 0;
  },

  async countTodayByUserId(userId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { count, error } = await supabase
      .from("sessions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", today.toISOString());

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "countTodayByUserId",
      });
    }
    return count ?? 0;
  },

  async listRecentSummary(
    userId: string,
    limit = 5
  ): Promise<
    Pick<
      Tables<"sessions">,
      "id" | "type" | "status" | "overall_score" | "title" | "created_at"
    >[]
  > {
    const { data, error } = await supabase
      .from("sessions")
      .select("id, type, status, overall_score, title, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "listRecentSummary",
      });
    }

    return (data ?? []) as Pick<
      Tables<"sessions">,
      "id" | "type" | "status" | "overall_score" | "title" | "created_at"
    >[];
  },

  async listSummariesByUserId(
    userId: string,
    limit = 50,
  ): Promise<
    (Pick<
      Tables<"sessions">,
      | "id"
      | "type"
      | "title"
      | "overall_score"
      | "created_at"
      | "started_at"
      | "ended_at"
      | "questions_asked"
      | "status"
      | "tags"
    > & { duration_seconds: number; credits_consumed: number })[]
  > {
    const { data, error } = await supabase
      .from("sessions")
      .select(
        "id, type, title, overall_score, created_at, started_at, ended_at, questions_asked, status, tags, credits_used",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "listSummariesByUserId",
      });
    }

    return (data ?? []).map((r: any) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      overall_score: r.overall_score,
      created_at: r.created_at,
      started_at: r.started_at,
      ended_at: r.ended_at,
      questions_asked: r.questions_asked,
      status: r.status,
      tags: r.tags,
      credits_consumed: r.credits_used ?? 0,
      duration_seconds:
        r.started_at && r.ended_at
          ? Math.max(
              0,
              Math.round(
                (new Date(r.ended_at).getTime() -
                  new Date(r.started_at).getTime()) /
                  1000,
              ),
            )
          : 0,
    }));
  },

  async listMetaByIds(
    ids: string[],
  ): Promise<
    Pick<Tables<"sessions">, "id" | "overall_score" | "type" | "title" | "created_at">[]
  > {
    if (ids.length === 0) return [];
    const { data, error } = await supabase
      .from("sessions")
      .select("id, overall_score, type, title, created_at")
      .in("id", ids);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "sessions",
        operation: "listMetaByIds",
      });
    }
    return (data ?? []) as Pick<
      Tables<"sessions">,
      "id" | "overall_score" | "type" | "title" | "created_at"
    >[];
  },
};

// ─── Session transcripts & answers ─────────────────────────────────────────────

export const sessionTranscriptsDB = {
  async create(row: {
    session_id: string;
    user_id: string;
    transcript: string;
    utterances?: unknown;
  }): Promise<void> {
    const { error } = await supabase.from("session_transcripts").insert({
      session_id: row.session_id,
      user_id: row.user_id,
      content: row.transcript,
      ...(row.utterances !== undefined ? { utterances: row.utterances } : {}),
    } as unknown as TablesInsert<"session_transcripts">);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_transcripts",
        operation: "create",
      });
    }
  },

  async getBySessionId(sessionId: string): Promise<string | null> {
    const { data, error } = await supabase
      .from("session_transcripts")
      .select("content")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_transcripts",
        operation: "getBySessionId",
      });
    }

    if (!data?.length) return null;
    return data.map((row) => row.content).filter(Boolean).join("\n\n");
  },

  async listSegmentsBySessionId(sessionId: string): Promise<
    Array<{
      content: string;
      offset_ms?: number | null;
      speaker?: string;
      wpm?: number | null;
      filler_count?: number | null;
    }>
  > {
    const { data, error } = await supabase
      .from("session_transcripts")
      .select("content, offset_ms, speaker, wpm, filler_count")
      .eq("session_id", sessionId)
      .order("offset_ms", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_transcripts",
        operation: "listSegmentsBySessionId",
      });
    }
    return data ?? [];
  },
};

export const sessionAnswersDB = {
  async createMany(
    rows: Array<{
      session_id: string;
      user_id: string;
      question: string;
      answer: string;
      duration_ms?: number;
    }>,
  ): Promise<void> {
    if (rows.length === 0) return;

    const { error } = await supabase.from("session_answers").insert(
      rows as TablesInsert<"session_answers">[],
    );

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_answers",
        operation: "createMany",
      });
    }
  },

  async deleteAllByUserId(userId: string): Promise<void> {
    const { error } = await supabase
      .from("session_answers")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_answers",
        operation: "deleteAllByUserId",
      });
    }
  },

  async listBySessionId(sessionId: string): Promise<Tables<"session_answers">[]> {
    const { data, error } = await supabase
      .from("session_answers")
      .select("*")
      .eq("session_id", sessionId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_answers",
        operation: "listBySessionId",
      });
    }
    return data ?? [];
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

  async clearPrimaryCoverLetters(userId: string): Promise<void> {
    const { error } = await supabase
      .from("documents")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("type", "cover_letter");

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "documents",
        operation: "clearPrimaryCoverLetters",
      });
    }
  },

  async getPrimaryByType(
    userId: string,
    type: string
  ): Promise<Pick<
    Tables<"documents">,
    "title" | "parsed_summary" | "content" | "updated_at"
  > | null> {
    const { data, error } = await supabase
      .from("documents")
      .select("title, parsed_summary, content, updated_at")
      .eq("user_id", userId)
      .eq("type", type as Tables<"documents">["type"])
      .eq("is_primary", true)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "documents",
        operation: "getPrimaryByType",
      });
    }

    return data;
  },
};

// ─── Resumes ──────────────────────────────────────────────────────────────────

export const resumesDB = {
  async getById(resumeId: string): Promise<Tables<"resumes">> {
    return query(
      () => supabase.from("resumes").select("*").eq("id", resumeId).single(),
      { table: "resumes", operation: "getById" },
    );
  },

  /** Soft lookup — returns null when missing or blocked by RLS (avoids 406 .single). */
  async getByIdMaybe(resumeId: string): Promise<Tables<"resumes"> | null> {
    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("id", resumeId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resumes",
        operation: "getByIdMaybe",
      });
    }
    return data;
  },

  async listByUserId(userId: string): Promise<Tables<"resumes">[]> {
    const { data, error } = await supabase
      .from("resumes")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resumes",
        operation: "listByUserId",
      });
    }

    return data ?? [];
  },

  async create(row: TablesInsert<"resumes">): Promise<Tables<"resumes">> {
    return query(
      () => supabase.from("resumes").insert(row).select().single(),
      { table: "resumes", operation: "create" },
    );
  },

  async update(id: string, updates: TablesUpdate<"resumes">): Promise<void> {
    const { error } = await supabase.from("resumes").update(updates).eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resumes",
        operation: "update",
      });
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("resumes").delete().eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resumes",
        operation: "delete",
      });
    }
  },
};

// ─── Resume versions ──────────────────────────────────────────────────────────

export const resumeVersionsDB = {
  async create(row: TablesInsert<"resume_versions">): Promise<Tables<"resume_versions">> {
    return query(
      () => supabase.from("resume_versions").insert(row).select().single(),
      { table: "resume_versions", operation: "create" },
    );
  },

  async getById(id: string): Promise<Tables<"resume_versions">> {
    return query(
      () => supabase.from("resume_versions").select("*").eq("id", id).single(),
      { table: "resume_versions", operation: "getById" },
    );
  },

  async getByResumeId(resumeId: string): Promise<Tables<"resume_versions">[]> {
    const { data, error } = await supabase
      .from("resume_versions")
      .select("*")
      .eq("resume_id", resumeId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resume_versions",
        operation: "getByResumeId",
      });
    }

    return data ?? [];
  },

  async update(id: string, updates: TablesUpdate<"resume_versions">): Promise<void> {
    const { error } = await supabase.from("resume_versions").update(updates).eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "resume_versions",
        operation: "update",
      });
    }
  },
};

// ─── Job descriptions ─────────────────────────────────────────────────────────

export const jobDescriptionsDB = {
  async getById(jdId: string): Promise<Tables<"job_descriptions">> {
    return query(
      () => supabase.from("job_descriptions").select("*").eq("id", jdId).single(),
      { table: "job_descriptions", operation: "getById" },
    );
  },

  /** Soft lookup — returns null when missing or blocked by RLS (avoids 406 .single). */
  async getByIdMaybe(jdId: string): Promise<Tables<"job_descriptions"> | null> {
    const { data, error } = await supabase
      .from("job_descriptions")
      .select("*")
      .eq("id", jdId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "job_descriptions",
        operation: "getByIdMaybe",
      });
    }
    return data;
  },

  async listByUserId(userId: string): Promise<Tables<"job_descriptions">[]> {
    const { data, error } = await supabase
      .from("job_descriptions")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "job_descriptions",
        operation: "listByUserId",
      });
    }

    return data ?? [];
  },

  async create(row: TablesInsert<"job_descriptions">): Promise<Tables<"job_descriptions">> {
    return query(
      () => supabase.from("job_descriptions").insert(row).select().single(),
      { table: "job_descriptions", operation: "create" },
    );
  },

  async update(id: string, updates: TablesUpdate<"job_descriptions">): Promise<void> {
    const { error } = await supabase.from("job_descriptions").update(updates).eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "job_descriptions",
        operation: "update",
      });
    }
  },

  async delete(id: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("job_descriptions")
      .delete()
      .eq("id", id)
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "job_descriptions",
        operation: "delete",
      });
    }
  },
};

// ─── Session debriefs ─────────────────────────────────────────────────────────

export const sessionDebriefsDB = {
  async getByIdForUser(
    debriefId: string,
    userId: string,
  ): Promise<Tables<"session_debriefs"> | null> {
    const { data, error } = await supabase
      .from("session_debriefs")
      .select("*")
      .eq("id", debriefId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_debriefs",
        operation: "getByIdForUser",
      });
    }
    return data;
  },

  async listSummariesByUserId(
    userId: string,
    limit = 50,
  ): Promise<
    Pick<
      Tables<"session_debriefs">,
      "id" | "created_at" | "overall_grade" | "priority_focus" | "session_id"
    >[]
  > {
    const { data, error } = await supabase
      .from("session_debriefs")
      .select("id, created_at, overall_grade, priority_focus, session_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_debriefs",
        operation: "listSummariesByUserId",
      });
    }
    return (data ?? []) as Pick<
      Tables<"session_debriefs">,
      "id" | "created_at" | "overall_grade" | "priority_focus" | "session_id"
    >[];
  },

  async getByShareToken(token: string): Promise<Tables<"session_debriefs"> | null> {
    const { data, error } = await (supabase.rpc as (
      name: string,
      args: Record<string, unknown>,
    ) => ReturnType<typeof supabase.rpc>)("get_shared_debrief", {
      p_token: token,
    });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_debriefs",
        operation: "getByShareToken",
      });
    }

    const row = Array.isArray(data) ? data[0] : data;
    return (row as Tables<"session_debriefs"> | undefined) ?? null;
  },

  async updateShareToken(
    debriefId: string,
    userId: string,
    token: string,
  ): Promise<void> {
    const { data: cur, error: fetchErr } = await supabase
      .from("session_debriefs")
      .select("detailed_report")
      .eq("id", debriefId)
      .eq("user_id", userId)
      .maybeSingle();

    if (fetchErr) {
      throw new DatabaseError(fetchErr.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_debriefs",
        operation: "updateShareToken",
      });
    }

    const next = {
      ...((cur?.detailed_report as Record<string, unknown>) ?? {}),
      share_token: token,
      is_shared: true,
    };

    const { error } = await supabase
      .from("session_debriefs")
      .update({ detailed_report: next })
      .eq("id", debriefId)
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "session_debriefs",
        operation: "updateShareToken",
      });
    }
  },
};

// ─── Scheduled interviews (calendar / pipeline) ─────────────────────────────

export const scheduledInterviewsDB = {
  async listWithRoundsByUserId(userId: string) {
    const { data, error } = await supabase
      .from("scheduled_interviews")
      .select("*, interview_rounds(*)")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scheduled_interviews",
        operation: "listWithRoundsByUserId",
      });
    }
    return data ?? [];
  },

  async create(row: TablesInsert<"scheduled_interviews">): Promise<void> {
    const { error } = await supabase.from("scheduled_interviews").insert(row);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scheduled_interviews",
        operation: "create",
      });
    }
  },

  async update(
    id: string,
    patch: TablesUpdate<"scheduled_interviews">,
  ): Promise<void> {
    const { error } = await supabase
      .from("scheduled_interviews")
      .update(patch)
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scheduled_interviews",
        operation: "update",
      });
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from("scheduled_interviews")
      .delete()
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scheduled_interviews",
        operation: "delete",
      });
    }
  },
};

export const interviewRoundsDB = {
  async create(row: TablesInsert<"interview_rounds">): Promise<void> {
    const { error } = await supabase.from("interview_rounds").insert(row);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "interview_rounds",
        operation: "create",
      });
    }
  },

  async update(
    id: string,
    patch: TablesUpdate<"interview_rounds">,
  ): Promise<void> {
    const { error } = await supabase
      .from("interview_rounds")
      .update(patch)
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "interview_rounds",
        operation: "update",
      });
    }
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

export type CreditTransactionRow = Pick<
  Tables<"credit_transactions">,
  "id" | "user_id" | "amount" | "action" | "created_at" | "session_id" | "description"
>;

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

  async deduct(_userId: string, _amount: number, _action = "usage"): Promise<void> {
    throw new DatabaseError(
      "Direct deduct_credits RPC is disabled. Use the deduct-credits Edge Function.",
      ErrorCode.DB_QUERY_FAILED,
      { table: "credits", operation: "deduct" },
    );
  },

  async add(userId: string, amount: number): Promise<void> {
    const { error } = await supabase.rpc("add_credits", {
      p_user_id: userId,
      p_amount:  amount,
    });
    if (error) throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED,
      { table: "credits", operation: "add" });
  },

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

  async listByUserIdWithBalancePage(
    userId: string,
    opts: { limit?: number; offset?: number } = {},
  ) {
    const limit = opts.limit ?? 20;
    const offset = opts.offset ?? 0;
    const { data, error } = await supabase
      .from("credit_transactions")
      .select("id, action, amount, balance_after, description, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "credit_transactions",
        operation: "listByUserIdWithBalancePage",
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

  /**
   * P0-6: USD MRR by plan from active/trialing subscriptions × catalog prices.
   * Never sums credit_transactions.amount (those are credit counts, not cents).
   */
  async monthlyRevenueByPlan(_sinceIso: string): Promise<
    { month: string; planId: string; totalCents: number; currency: "USD" }[]
  > {
    const { data, error } = await supabase
      .from("subscriptions")
      .select("plan_id, status, updated_at")
      .in("status", ["active", "trialing"]);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "subscriptions",
        operation: "monthlyRevenueByPlan",
      });
    }

    const month = new Date().toISOString().slice(0, 7);
    const counts: Record<string, number> = {};
    for (const row of data ?? []) {
      const planId = String(row.plan_id ?? "free");
      counts[planId] = (counts[planId] ?? 0) + 1;
    }

    return Object.entries(counts).map(([planId, count]) => {
      const priceKey = planId as keyof typeof PLAN_PRICE_CENTS_MONTHLY;
      const cents = PLAN_PRICE_CENTS_MONTHLY[priceKey] ?? 0;
      return {
        month,
        planId,
        totalCents: cents * count,
        currency: "USD" as const,
      };
    });
  },

  /** INR revenue from paid Razorpay orders (amount_paise), reported separately from USD. */
  async sumRazorpayPaidPaiseSince(sinceIso: string): Promise<number> {
    const { data, error } = await (supabase as any)
      .from("payment_orders")
      .select("amount_paise, status, created_at")
      .gte("created_at", sinceIso)
      .in("status", ["paid", "captured", "success"]);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "payment_orders",
        operation: "sumRazorpayPaidPaiseSince",
      });
    }

    return (data ?? []).reduce(
      (sum: number, row: { amount_paise?: number }) =>
        sum + Math.abs(Number(row.amount_paise) || 0),
      0,
    );
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

  async upsert(
    userId: string,
    row: Omit<TablesInsert<"answer_bank">, "user_id">,
    onConflict = "user_id,session_id,question_text",
  ): Promise<void> {
    const { error } = await supabase.from("answer_bank").upsert(
      { ...row, user_id: userId } as TablesInsert<"answer_bank">,
      { onConflict },
    );

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "answer_bank",
        operation: "upsert",
      });
    }
  },

  async deleteAllByUserId(userId: string): Promise<void> {
    const { error } = await supabase
      .from("answer_bank")
      .delete()
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "answer_bank",
        operation: "deleteAllByUserId",
      });
    }
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
      // Column-scoped: referred_email is no longer client-readable (security hardening)
      .select("id", { count: "exact", head: true })
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

  async upsertReferred(params: {
    referrerId: string;
    referredId: string;
    referredEmail?: string;
  }): Promise<void> {
    const { error } = await supabase.from("referrals").upsert(
      {
        referrer_id: params.referrerId,
        referred_id: params.referredId,
        referred_email: params.referredEmail ?? "",
        credits_awarded: 0,
      },
      { onConflict: "referred_id" as any, ignoreDuplicates: true },
    );

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "referrals",
        operation: "upsertReferred",
      });
    }
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

  async getById(id: string): Promise<Tables<"practice_rooms"> | null> {
    const { data, error } = await supabase
      .from("practice_rooms")
      .select("id, name, description, status, max_players, is_public, host_id, created_at")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "practice_rooms",
        operation: "getById",
      });
    }

    return data ?? null;
  },

  async create(room: TablesInsert<"practice_rooms">): Promise<Tables<"practice_rooms">> {
    return query(
      () =>
        supabase
          .from("practice_rooms")
          .insert(room)
          .select("id, name, description, status, max_players, is_public, host_id, created_at")
          .single(),
      { table: "practice_rooms", operation: "create" },
    );
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("practice_rooms").delete().eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "practice_rooms",
        operation: "delete",
      });
    }
  },

  async updateStatus(id: string, status: string): Promise<void> {
    const { error } = await supabase
      .from("practice_rooms")
      .update({ status })
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "practice_rooms",
        operation: "updateStatus",
      });
    }
  },

  async listParticipants(roomId: string): Promise<Tables<"room_participants">[]> {
    const { data, error } = await supabase
      .from("room_participants")
      .select("*")
      .eq("room_id", roomId)
      .is("left_at", null);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_participants",
        operation: "listParticipants",
      });
    }

    return data ?? [];
  },

  async findParticipant(
    roomId: string,
    userId: string,
  ): Promise<Tables<"room_participants"> | null> {
    const { data, error } = await supabase
      .from("room_participants")
      .select("*")
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_participants",
        operation: "findParticipant",
      });
    }

    return data ?? null;
  },

  async addParticipant(row: TablesInsert<"room_participants">): Promise<Tables<"room_participants">> {
    return query(
      () => supabase.from("room_participants").insert(row).select().single(),
      { table: "room_participants", operation: "addParticipant" },
    );
  },

  async reactivateParticipant(id: string, role: string): Promise<void> {
    const { error } = await supabase
      .from("room_participants")
      .update({ left_at: null, role, joined_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_participants",
        operation: "reactivateParticipant",
      });
    }
  },

  async markParticipantLeft(roomId: string, userId: string): Promise<void> {
    const { error } = await supabase
      .from("room_participants")
      .update({ left_at: new Date().toISOString() })
      .eq("room_id", roomId)
      .eq("user_id", userId)
      .is("left_at", null);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_participants",
        operation: "markParticipantLeft",
      });
    }
  },

  async listQuestions(roomId: string): Promise<Tables<"room_questions">[]> {
    const { data, error } = await supabase
      .from("room_questions")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_questions",
        operation: "listQuestions",
      });
    }

    return data ?? [];
  },

  async listMessages(roomId: string, limit = 100): Promise<Tables<"room_chat">[]> {
    const { data, error } = await supabase
      .from("room_chat")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_chat",
        operation: "listMessages",
      });
    }

    return data ?? [];
  },

  async sendMessage(message: TablesInsert<"room_chat">): Promise<void> {
    const { error } = await supabase.from("room_chat").insert(message);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "room_chat",
        operation: "sendMessage",
      });
    }
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

  async getDashboardStats(): Promise<{
    totalUsers: number;
    proUsers: number;
    todaySessions: number;
    totalSessions: number;
  }> {
    const today = new Date().toISOString().slice(0, 10);
    const [totalRes, proRes, todayRes, totalSessionsRes] = await Promise.all([
      supabase.from("profiles").select("id", { count: "exact", head: true }),
      supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .not("plan_id", "eq", "free"),
      supabase
        .from("sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", today),
      supabase.from("sessions").select("id", { count: "exact", head: true }),
    ]);

    const firstErr = [totalRes, proRes, todayRes, totalSessionsRes].find(
      (r) => r.error,
    )?.error;
    if (firstErr) {
      throw new DatabaseError(firstErr.message, ErrorCode.DB_QUERY_FAILED, {
        table: "admin_dashboard",
        operation: "getDashboardStats",
      });
    }

    return {
      totalUsers: totalRes.count ?? 0,
      proUsers: proRes.count ?? 0,
      todaySessions: todayRes.count ?? 0,
      totalSessions: totalSessionsRes.count ?? 0,
    };
  },
};

// ─── Mock tests (exam engine) ─────────────────────────────────────────────────

export type MockTestSummary = Pick<
  Tables<"mock_tests">,
  "id" | "test_name" | "status" | "created_at" | "config"
>;

export const mockTestsDB = {
  async listRecentByUserId(userId: string, limit = 5): Promise<MockTestSummary[]> {
    const { data, error } = await supabase
      .from("mock_tests")
      .select("id, test_name, status, created_at, config")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "mock_tests",
        operation: "listRecentByUserId",
      });
    }
    return (data ?? []) as MockTestSummary[];
  },

  async countCompletedByUserId(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("mock_tests")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "COMPLETED");

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "mock_tests",
        operation: "countCompletedByUserId",
      });
    }
    return count ?? 0;
  },

  async listSubmittedAtByUserId(userId: string, limit = 90): Promise<string[]> {
    const { data, error } = await supabase
      .from("mock_tests")
      .select("submitted_at")
      .eq("user_id", userId)
      .eq("status", "COMPLETED")
      .not("submitted_at", "is", null)
      .order("submitted_at", { ascending: false })
      .limit(limit);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "mock_tests",
        operation: "listSubmittedAtByUserId",
      });
    }
    return (data ?? [])
      .map((r) => r.submitted_at)
      .filter((d): d is string => typeof d === "string" && d.length > 0);
  },
};

export const testAnalysesDB = {
  async listAccuracyByUserId(userId: string): Promise<number[]> {
    const { data, error } = await supabase
      .from("test_analyses")
      .select("accuracy")
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "test_analyses",
        operation: "listAccuracyByUserId",
      });
    }
    return (data ?? []).map((r) => Number(r.accuracy ?? 0));
  },
};

// ─── Questions (mock-test bank) ───────────────────────────────────────────────

export const questionsDB = {
  async countByUploadedBy(userId: string): Promise<number> {
    const { count, error } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("uploaded_by", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "countByUploadedBy",
      });
    }
    return count ?? 0;
  },

  async list(params: {
    uploadedBy?: string;
    examType?: string;
    search?: string;
    limit?: number;
    columns?: string;
  } = {}): Promise<Tables<"questions">[]> {
    let q = supabase
      .from("questions")
      .select(params.columns ?? "*")
      .order("created_at", { ascending: false });

    if (params.limit) q = q.limit(params.limit);
    if (params.uploadedBy) q = q.eq("uploaded_by", params.uploadedBy);
    if (params.examType && params.examType !== "all") {
      q = q.eq("exam_type", params.examType);
    }
    if (params.search) q = q.ilike("question_text", `%${params.search}%`);

    const { data, error } = await q;
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "list",
      });
    }
    return (data ?? []) as unknown as Tables<"questions">[];
  },

  async getById(id: string): Promise<Tables<"questions"> | null> {
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "getById",
      });
    }
    return data;
  },

  async create(row: TablesInsert<"questions">): Promise<{ id: string }> {
    const { data, error } = await supabase
      .from("questions")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "create",
      });
    }
    return { id: data.id };
  },

  async update(id: string, patch: TablesUpdate<"questions">): Promise<void> {
    const { error } = await supabase.from("questions").update(patch).eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "update",
      });
    }
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "delete",
      });
    }
  },

  async deleteMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await supabase.from("questions").delete().in("id", ids);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "deleteMany",
      });
    }
  },

  async createMany(rows: TablesInsert<"questions">[]): Promise<void> {
    if (rows.length === 0) return;
    const { error } = await supabase.from("questions").insert(rows);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "questions",
        operation: "createMany",
      });
    }
  },
};

// ─── Feature flags ────────────────────────────────────────────────────────────

export const featureFlagsDB = {
  async listKeyEnabled(): Promise<Record<string, boolean>> {
    const { data, error } = await supabase
      .from("feature_flags")
      .select("key, is_enabled");

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "feature_flags",
        operation: "listKeyEnabled",
      });
    }

    const map: Record<string, boolean> = {};
    for (const row of data ?? []) {
      map[row.key] = row.is_enabled;
    }
    return map;
  },

  async upsertEnabled(key: string, is_enabled: boolean): Promise<void> {
    const { data: existing, error: fetchErr } = await supabase
      .from("feature_flags")
      .select("id")
      .eq("key", key)
      .maybeSingle();

    if (fetchErr) {
      throw new DatabaseError(fetchErr.message, ErrorCode.DB_QUERY_FAILED, {
        table: "feature_flags",
        operation: "upsertEnabled",
      });
    }

    if (existing?.id) {
      const { error } = await supabase
        .from("feature_flags")
        .update({ is_enabled, updated_at: new Date().toISOString() })
        .eq("key", key);
      if (error) {
        throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
          table: "feature_flags",
          operation: "upsertEnabled",
        });
      }
      return;
    }

    const { error } = await supabase.from("feature_flags").insert({
      key,
      name: key.replace(/_/g, " "),
      is_enabled,
      rollout_percent: 100,
    });
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "feature_flags",
        operation: "upsertEnabled",
      });
    }
  },
};

// ─── Gamification (badges & weekly challenges) ─────────────────────────────

export const gamificationDB = {
  async listBadgeIdsByUserId(userId: string): Promise<string[]> {
    const { data, error } = await supabase
      .from("user_badges")
      .select("badge_id")
      .eq("user_id", userId);

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "user_badges",
        operation: "listBadgeIdsByUserId",
      });
    }
    return (data ?? []).map((r) => r.badge_id);
  },

  async getActiveWeeklyChallenge(
    userId: string,
  ): Promise<Tables<"weekly_challenges"> | null> {
    const { data, error } = await supabase
      .from("weekly_challenges")
      .select("*")
      .eq("user_id", userId)
      .gte("week_end", new Date().toISOString())
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "weekly_challenges",
        operation: "getActiveWeeklyChallenge",
      });
    }
    return data;
  },

  async upsertBadge(
    userId: string,
    badgeId: string,
  ): Promise<void> {
    const { error } = await supabase.from("user_badges").upsert(
      {
        user_id: userId,
        badge_id: badgeId,
        earned_at: new Date().toISOString(),
      },
      { onConflict: "user_id,badge_id", ignoreDuplicates: true },
    );
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "user_badges",
        operation: "upsertBadge",
      });
    }
  },

  async updateWeeklyChallenge(
    id: string,
    patch: TablesUpdate<"weekly_challenges">,
  ): Promise<void> {
    const { error } = await supabase
      .from("weekly_challenges")
      .update(patch)
      .eq("id", id);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "weekly_challenges",
        operation: "updateWeeklyChallenge",
      });
    }
  },
};

// ─── Support (admin live chat) ───────────────────────────────────────────────

export const supportDB = {
  async listThreads(status: "all" | "open" | "pending" | "resolved" = "all") {
    let q: any = supabase
      .from("support_threads")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(100);
    if (status !== "all") q = q.eq("status", status);

    const { data, error } = await q;
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "support_threads",
        operation: "listThreads",
      });
    }
    return data ?? [];
  },

  async listMessagesByThreadId(threadId: string) {
    const { data, error } = await supabase
      .from("support_messages")
      .select("*")
      .eq("thread_id", threadId)
      .order("created_at", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "support_messages",
        operation: "listMessagesByThreadId",
      });
    }
    return data ?? [];
  },

  async markThreadReadForAdmin(threadId: string): Promise<void> {
    const { error } = await supabase
      .from("support_threads")
      .update({ unread_for_admin: false, updated_at: new Date().toISOString() })
      .eq("id", threadId);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "support_threads",
        operation: "markThreadReadForAdmin",
      });
    }
  },

  async updateThread(
    threadId: string,
    patch: TablesUpdate<"support_threads">,
  ): Promise<void> {
    const { error } = await supabase
      .from("support_threads")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", threadId);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "support_threads",
        operation: "updateThread",
      });
    }
  },

  async sendMessage(row: TablesInsert<"support_messages">): Promise<void> {
    const { error } = await supabase.from("support_messages").insert(row);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "support_messages",
        operation: "sendMessage",
      });
    }
  },
};

// ─── Scorecards ───────────────────────────────────────────────────────────────

type ScorecardShareUpdate = {
  is_shared: boolean;
  share_token: string;
};

export const scorecardsDB = {
  async getBySessionId(sessionId: string): Promise<Scorecard | null> {
    const { data, error } = await supabase
      .from("scorecards")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scorecards",
        operation: "getBySessionId",
      });
    }
    if (!data) {
      return null;
    }
    return mapRowToScorecard(data as unknown as ScorecardRow);
  },

  async create(scorecard: Scorecard): Promise<void> {
    const row = mapScorecardToInsert(scorecard);
    const { error } = await supabase
      .from("scorecards")
      .insert(row as TablesInsert<"scorecards">);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scorecards",
        operation: "create",
      });
    }
  },

  async markShared(sessionId: string, token: string): Promise<void> {
    const patch: ScorecardShareUpdate = {
      is_shared: true,
      share_token: token,
    };
    const { error } = await supabase
      .from("scorecards")
      .update(patch as TablesUpdate<"scorecards">)
      .eq("session_id", sessionId);
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scorecards",
        operation: "markShared",
      });
    }
  },

  async getByShareToken(token: string): Promise<Scorecard | null> {
    const { data, error } = await (supabase.rpc as (
      name: string,
      args: Record<string, unknown>,
    ) => ReturnType<typeof supabase.rpc>)("get_shared_scorecard", {
      p_token: token,
    });
    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "scorecards",
        operation: "getByShareToken",
      });
    }
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return null;
    return mapRowToScorecard(row as unknown as ScorecardRow);
  },
};

// ─── Help articles (marketing FAQ) ───────────────────────────────────────────

export type HelpArticlePublic = Pick<
  Tables<"help_articles">,
  | "slug"
  | "question"
  | "answer"
  | "body_md"
  | "category_slug"
  | "category_title"
  | "sort_order"
>;

export const helpArticlesDB = {
  async listPublished(): Promise<HelpArticlePublic[]> {
    const { data, error } = await supabase
      .from("help_articles")
      .select(
        "slug, question, answer, body_md, category_slug, category_title, sort_order",
      )
      .eq("published", true)
      .order("sort_order", { ascending: true });

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "help_articles",
        operation: "listPublished",
      });
    }
    return data ?? [];
  },

  async getBySlug(slug: string): Promise<HelpArticlePublic | null> {
    const { data, error } = await supabase
      .from("help_articles")
      .select(
        "slug, question, answer, body_md, category_slug, category_title, sort_order",
      )
      .eq("slug", slug)
      .eq("published", true)
      .maybeSingle();

    if (error) {
      throw new DatabaseError(error.message, ErrorCode.DB_QUERY_FAILED, {
        table: "help_articles",
        operation: "getBySlug",
      });
    }
    return data;
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
