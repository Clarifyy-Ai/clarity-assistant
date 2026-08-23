import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ListTodo, Loader2, RotateCcw } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import {
  daysUntilInterview,
  type PracticePlanItem,
} from "@/lib/interview/practicePlan";
import {
  loadOrCreatePlan,
  starBuilderReturnPath,
  toggleCompleted,
  type ItemSaveState,
} from "@/lib/interview/practicePlanRepository";

export default function InterviewPracticePlanPage() {
  const { user, profile } = useAuthStore();
  const [items, setItems] = useState<PracticePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saveStates, setSaveStates] = useState<Record<string, ItemSaveState>>({});
  const [error, setError] = useState<string | null>(null);

  const daysLeft = daysUntilInterview(
    (profile as { interview_date?: string | null } | null)?.interview_date ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const next = await loadOrCreatePlan(user.id, {
          weakAreas:
            (profile as { interview_weaknesses?: string[] | null; improvement_goals?: string[] | null } | null)
              ?.interview_weaknesses ??
            (profile as { improvement_goals?: string[] | null } | null)?.improvement_goals ??
            [],
          strongAreas:
            (profile as { interview_strengths?: string[] | null } | null)?.interview_strengths ?? [],
          missingSkills: [],
          targetRole: profile?.target_role,
          interviewDate: (profile as { interview_date?: string | null } | null)?.interview_date,
        });
        if (!cancelled) {
          setItems(next);
          setSaveStates({});
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not create your practice plan.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile]);

  const remaining = useMemo(() => items.filter((i) => !i.completed).length, [items]);

  async function toggleItem(item: PracticePlanItem) {
    if (!user?.id) return;
    if (saveStates[item.id] === "SAVING") return;

    const previous = item.completed;
    const next = !previous;
    setSaveStates((s) => ({ ...s, [item.id]: "SAVING" }));
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, completed: next } : row)));
    setError(null);

    const result = await toggleCompleted(user.id, item.id, next);
    if (result.ok === false) {
      setItems((prev) =>
        prev.map((row) => (row.id === item.id ? { ...row, completed: previous } : row)),
      );
      setSaveStates((s) => ({ ...s, [item.id]: "SAVE_FAILED" }));
      setError(result.error);
      return;
    }

    setItems((prev) => prev.map((row) => (row.id === item.id ? result.item : row)));
    setSaveStates((s) => ({ ...s, [item.id]: "SAVED" }));
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 pb-16">
      <PageHeader
        title="Interview practice plan"
        description="Personalized next actions from your debriefs and job match. No fabricated readiness score."
      />
      {typeof daysLeft === "number" && (
        <p className="text-sm text-muted-foreground">
          {daysLeft >= 0
            ? `${daysLeft} day${daysLeft === 1 ? "" : "s"} until your target interview date.`
            : "Your target interview date is in the past — use this as a revision checklist."}
        </p>
      )}
      <p className="text-sm text-muted-foreground">{remaining} open activities</p>
      {error && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading plan…</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const state = saveStates[item.id] ?? "IDLE";
            const openHref = starBuilderReturnPath(item.recommended_route);
            return (
              <Card key={item.id} className="p-4">
                <div className="flex items-start gap-3">
                  <button
                    type="button"
                    aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                    disabled={state === "SAVING"}
                    onClick={() => void toggleItem(item)}
                    className="mt-0.5"
                  >
                    {state === "SAVING" ? (
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                    ) : item.completed ? (
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    ) : (
                      <Circle className="h-5 w-5 text-muted-foreground" />
                    )}
                  </button>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-foreground">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {state === "SAVING" && (
                        <span className="text-[11px] text-muted-foreground">Saving…</span>
                      )}
                      {state === "SAVED" && (
                        <span className="text-[11px] text-emerald-600 dark:text-emerald-400">Saved</span>
                      )}
                      {state === "SAVE_FAILED" && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-red-500"
                          onClick={() => void toggleItem(item)}
                        >
                          <RotateCcw className="h-3 w-3" /> Retry save
                        </button>
                      )}
                    </div>
                    <Link
                      to={openHref}
                      className="mt-3 inline-flex rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                    >
                      Open
                    </Link>
                  </div>
                  <ListTodo className="h-4 w-4 text-muted-foreground" />
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
