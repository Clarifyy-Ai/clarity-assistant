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

type ChecklistQueryClient = {
  from: (relation: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        eq: (
          column: string,
          value: string,
        ) => Promise<{ data: Array<{ item_id: string; checked: boolean }> | null; error: { message: string } | null }>;
      };
    };
    upsert: (
      rows: InterviewDayChecklistItem | InterviewDayChecklistItem[],
      options: { onConflict: string },
    ) => Promise<{ error: { message: string } | null }>;
  };
};

function checklistClient(): ChecklistQueryClient {
  return supabase as unknown as ChecklistQueryClient;
}

export function localChecklistStorageKey(interviewId: string): string {
  return `clarify:interview-day-checklist:${interviewId}`;
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

export function readLocalChecklist(interviewId: string): ChecklistState {
  try {
    return parseLocalChecklist(localStorage.getItem(localChecklistStorageKey(interviewId)));
  } catch {
    return {};
  }
}

export function writeLocalChecklist(interviewId: string, state: ChecklistState): void {
  try {
    localStorage.setItem(localChecklistStorageKey(interviewId), JSON.stringify(state));
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
  userId: string,
  interviewId: string,
): Promise<ChecklistState> {
  try {
    const { data, error } = await checklistClient()
      .from(INTERVIEW_DAY_CHECKLISTS_TABLE)
      .select("item_id, checked")
      .eq("user_id", userId)
      .eq("interview_id", interviewId);
    if (error) throw error;
    const remote = rowsToChecklistState(data);
    if (Object.keys(remote).length === 0) {
      return readLocalChecklist(interviewId);
    }
    writeLocalChecklist(interviewId, remote);
    return remote;
  } catch {
    return readLocalChecklist(interviewId);
  }
}

export async function upsertInterviewDayChecklistItem(input: {
  userId: string;
  interviewId: string;
  itemId: string;
  checked: boolean;
  nextState: ChecklistState;
}): Promise<{ persistedRemote: boolean }> {
  writeLocalChecklist(input.interviewId, input.nextState);
  const row: InterviewDayChecklistItem = {
    user_id: input.userId,
    interview_id: input.interviewId,
    item_id: input.itemId,
    checked: input.checked,
    updated_at: new Date().toISOString(),
  };
  try {
    const { error } = await checklistClient()
      .from(INTERVIEW_DAY_CHECKLISTS_TABLE)
      .upsert(row, { onConflict: "user_id,interview_id,item_id" });
    if (error) throw error;
    return { persistedRemote: true };
  } catch {
    toastPersistFallbackOnce();
    return { persistedRemote: false };
  }
}
