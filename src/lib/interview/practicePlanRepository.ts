/**
 * Authoritative create/load/update for interview practice plan items.
 * Always uses DB-generated UUIDs — never client slug IDs for persistence.
 */

import { supabase } from "@/lib/supabase/client";
import {
  buildInterviewPracticePlan,
  type PracticePlanActivityType,
  type PracticePlanInput,
  type PracticePlanItem,
} from "@/lib/interview/practicePlan";

export type ItemSaveState = "IDLE" | "SAVING" | "SAVED" | "SAVE_FAILED";

export type PracticePlanItemRow = {
  id: string;
  plan_id: string;
  user_id: string;
  title: string;
  activity_type: string;
  competency: string | null;
  reason: string | null;
  recommended_route: string | null;
  completed: boolean;
  due_offset_days: number;
  completed_at: string | null;
  created_at: string;
};

const ACTIVITY_TYPES = new Set<PracticePlanActivityType>([
  "mock_session",
  "star_story",
  "question_drill",
  "resume_gap",
  "coding_practice",
  "revision",
]);

export function mapRowToItem(row: PracticePlanItemRow): PracticePlanItem {
  const activity = ACTIVITY_TYPES.has(row.activity_type as PracticePlanActivityType)
    ? (row.activity_type as PracticePlanActivityType)
    : "revision";
  return {
    id: row.id,
    title: row.title,
    activity_type: activity,
    competency: row.competency ?? "",
    reason: row.reason ?? "",
    recommended_route: row.recommended_route ?? "/app/mock",
    completed: Boolean(row.completed),
    due_offset_days: Number(row.due_offset_days ?? 1),
  };
}

export function buildInsertPayload(
  planId: string,
  userId: string,
  item: PracticePlanItem,
): Omit<PracticePlanItemRow, "id" | "created_at" | "completed_at"> & {
  completed_at?: null;
} {
  return {
    plan_id: planId,
    user_id: userId,
    title: item.title,
    activity_type: item.activity_type,
    competency: item.competency || null,
    reason: item.reason || null,
    recommended_route: item.recommended_route || null,
    completed: false,
    due_offset_days: item.due_offset_days,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value,
  );
}

export async function listItemsForUser(userId: string): Promise<PracticePlanItem[]> {
  const { data, error } = await supabase
    .from("interview_practice_plan_items")
    .select("*")
    .eq("user_id", userId)
    .order("due_offset_days", { ascending: true });

  if (error) throw error;
  return ((data ?? []) as PracticePlanItemRow[]).map(mapRowToItem);
}

async function getOrCreatePlanId(userId: string): Promise<string> {
  const { data: existingPlans, error: listError } = await supabase
    .from("interview_practice_plans")
    .select("id")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1);

  if (listError) throw listError;
  const existingId = existingPlans?.[0]?.id as string | undefined;
  if (existingId) return existingId;

  const { data: plan, error: planError } = await supabase
    .from("interview_practice_plans")
    .insert({
      user_id: userId,
      title: "Interview practice plan",
      source: "rule_based",
      plan_json: { generated_at: new Date().toISOString() },
    })
    .select("id")
    .maybeSingle();

  if (planError) throw planError;
  if (!plan?.id) throw new Error("Could not create practice plan.");
  return plan.id as string;
}

export async function loadOrCreatePlan(
  userId: string,
  input: PracticePlanInput,
): Promise<PracticePlanItem[]> {
  const existing = await listItemsForUser(userId);
  if (existing.length > 0) return existing;

  const planId = await getOrCreatePlanId(userId);
  const underPlan = await supabase
    .from("interview_practice_plan_items")
    .select("*")
    .eq("user_id", userId)
    .eq("plan_id", planId)
    .order("due_offset_days", { ascending: true });

  if (underPlan.error) throw underPlan.error;
  if (underPlan.data && underPlan.data.length > 0) {
    return (underPlan.data as PracticePlanItemRow[]).map(mapRowToItem);
  }

  const generated = buildInterviewPracticePlan(input);
  const payloads = generated.map((item) => buildInsertPayload(planId, userId, item));

  const { data: inserted, error: itemsError } = await supabase
    .from("interview_practice_plan_items")
    .insert(payloads)
    .select("*");

  if (itemsError) throw itemsError;
  if (!inserted || inserted.length === 0) {
    throw new Error("Practice plan items were not saved.");
  }

  return (inserted as PracticePlanItemRow[]).map(mapRowToItem);
}

export type ToggleCompletedResult =
  | { ok: true; item: PracticePlanItem }
  | { ok: false; error: string };

/**
 * Persist completed toggle. Requires a real DB UUID.
 * Returns the confirmed row from the database — never trust optimistic state alone.
 */
export async function toggleCompleted(
  userId: string,
  itemId: string,
  completed: boolean,
): Promise<ToggleCompletedResult> {
  if (!isUuid(itemId)) {
    return {
      ok: false,
      error: "This activity is not linked to a saved plan item. Refresh and try again.",
    };
  }

  const completedAt = completed ? new Date().toISOString() : null;
  const { data, error } = await supabase
    .from("interview_practice_plan_items")
    .update({ completed, completed_at: completedAt })
    .eq("id", itemId)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) {
    return { ok: false, error: error.message || "Could not save activity." };
  }
  if (!data) {
    return {
      ok: false,
      error: "Activity was not updated. Refresh and try again.",
    };
  }

  return { ok: true, item: mapRowToItem(data as PracticePlanItemRow) };
}

export function starBuilderReturnPath(recommendedRoute: string): string {
  const base = recommendedRoute.split("?")[0] || "/app/prep/star-builder";
  if (base.includes("star-builder")) {
    return `${base}?returnTo=${encodeURIComponent("/app/plan")}`;
  }
  return recommendedRoute;
}
