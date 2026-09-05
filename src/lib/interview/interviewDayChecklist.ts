import { format } from "date-fns";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

/** Companion migration creates this table; generated types may lag. */
export const INTERVIEW_DAY_CHECKLISTS_TABLE = "interview_day_checklists" as const;

export type InterviewDayChecklistItem = {
  user_id: string;
  interview_id: string;
  item_id: string;
  checked: boolean;
  updated_at: string;
};

export type ChecklistState = Record<string, boolean>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const checklistDb = supabase as any;

const DAILY_SCOPE_PREFIX = "daily:";

export function localChecklistStorageKey(scopeId: string): string {
  return `clarify:interview-day-checklist:${scopeId}`;
}

/** Local-only scope when no interview is scheduled for today. */
export function dailyChecklistScopeId(when: Date = new Date()): string {
  return `${DAILY_SCOPE_PREFIX}${format(when, "yyyy-MM-dd")}`;
}

export function isDailyChecklistScope(scopeId: string): boolean {
  return scopeId.startsWith(DAILY_SCOPE_PREFIX);
}

export function resolveChecklistScopeId(
  interviewId: string | null | undefined,
  when: Date = new Date(),
): string {
  return interviewId?.trim() ? interviewId : dailyChecklistScopeId(when);
}

export function parseLocalChecklist(raw: string | null): ChecklistState {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const next: ChecklistState = {};
    for (const [key, value] of Object.entries(parsed)) {
      next[key] = Boolean(value);
    }
    return next;
  } catch {
    return {};
  }
}

export function rowsToChecklistState(
  rows: Array<{ item_id: string; checked: boolean }> | null | undefined,
): ChecklistState {
  const next: ChecklistState = {};
  for (const row of rows ?? []) {
    if (row.item_id) next[row.item_id] = Boolean(row.checked);
  }
  return next;
}

export function mergeChecklistState(
  local: ChecklistState,
  remote: ChecklistState,
): ChecklistState {
  return { ...local, ...remote };
}

export function readLocalChecklist(scopeId: string): ChecklistState {
  try {
    return parseLocalChecklist(localStorage.getItem(localChecklistStorageKey(scopeId)));
  } catch {
    return {};
  }
}

export function writeLocalChecklist(scopeId: string, state: ChecklistState): void {
  try {
    localStorage.setItem(localChecklistStorageKey(scopeId), JSON.stringify(state));
  } catch {
    /* quota / private mode */
  }
}

let persistFallbackToastShown = false;

export function resetChecklistPersistToastForTests(): void {
  persistFallbackToastShown = false;
}

function toastPersistFallbackOnce(): void {
  if (persistFallbackToastShown) return;
  persistFallbackToastShown = true;
  toast.warning("Checklist saved on this device only. Cloud sync is unavailable right now.");
}

export async function loadInterviewDayChecklist(
  userId: string | null | undefined,
  scopeId: string,
): Promise<ChecklistState> {
  const local = readLocalChecklist(scopeId);
  if (!userId || isDailyChecklistScope(scopeId)) {
    return local;
  }

  try {
    const { data, error } = await checklistDb
      .from(INTERVIEW_DAY_CHECKLISTS_TABLE)
      .select("item_id, checked")
      .eq("user_id", userId)
      .eq("interview_id", scopeId);
    if (error) throw error;
    const remote = rowsToChecklistState(data as Array<{ item_id: string; checked: boolean }>);
    const merged = mergeChecklistState(local, remote);
    writeLocalChecklist(scopeId, merged);
    return merged;
  } catch {
    return local;
  }
}

export async function upsertInterviewDayChecklistItem(input: {
  userId: string | null | undefined;
  scopeId: string;
  itemId: string;
  checked: boolean;
  nextState: ChecklistState;
}): Promise<{ persistedRemote: boolean }> {
  writeLocalChecklist(input.scopeId, input.nextState);
  if (!input.userId || isDailyChecklistScope(input.scopeId)) {
    return { persistedRemote: false };
  }

  const row: InterviewDayChecklistItem = {
    user_id: input.userId,
    interview_id: input.scopeId,
    item_id: input.itemId,
    checked: input.checked,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await checklistDb
      .from(INTERVIEW_DAY_CHECKLISTS_TABLE)
      .upsert(row, { onConflict: "user_id,interview_id,item_id" });
    if (error) throw error;
    return { persistedRemote: true };
  } catch {
    toastPersistFallbackOnce();
    return { persistedRemote: false };
  }
}
