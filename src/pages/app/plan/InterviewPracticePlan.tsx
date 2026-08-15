import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Circle, ListTodo } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { useAuthStore } from "@/store/authStore";
import { supabase } from "@/lib/supabase/client";
import {
  buildInterviewPracticePlan,
  daysUntilInterview,
  type PracticePlanItem,
} from "@/lib/interview/practicePlan";

export default function InterviewPracticePlanPage() {
  const { user, profile } = useAuthStore();
  const [items, setItems] = useState<PracticePlanItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const daysLeft = daysUntilInterview(profile?.interview_date ?? null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!user?.id) {
        setLoading(false);
        return;
      }
      const { data: existing } = await supabase
        .from("interview_practice_plan_items")
        .select("*")
        .eq("user_id", user.id)
        .order("due_offset_days", { ascending: true });

      if (cancelled) return;

      if (existing && existing.length > 0) {
        setItems(
          existing.map((row) => ({
            id: row.id as string,
            title: row.title as string,
            activity_type: row.activity_type as PracticePlanItem["activity_type"],
            competency: (row.competency as string) ?? "",
            reason: (row.reason as string) ?? "",
            recommended_route: (row.recommended_route as string) ?? "/app/mock",
            completed: Boolean(row.completed),
            due_offset_days: Number(row.due_offset_days ?? 1),
          })),
        );
        setLoading(false);
        return;
      }

      const generated = buildInterviewPracticePlan({
        weakAreas: (profile as { interview_weaknesses?: string[] | null; improvement_goals?: string[] | null } | null)
          ?.interview_weaknesses ??
          (profile as { improvement_goals?: string[] | null } | null)?.improvement_goals ??
          [],
        strongAreas: profile?.interview_strengths ?? [],
        missingSkills: [],
        targetRole: profile?.target_role,
        interviewDate: profile?.interview_date,
      });

      const { data: plan } = await supabase
        .from("interview_practice_plans")
        .insert({
          user_id: user.id,
          title: "Interview practice plan",
          source: "rule_based",
          plan_json: { generated_at: new Date().toISOString() },
        })
        .select("id")
        .maybeSingle();

      if (plan?.id) {
        await supabase.from("interview_practice_plan_items").insert(
          generated.map((item) => ({
            id: undefined,
            plan_id: plan.id,
            user_id: user.id,
            title: item.title,
            activity_type: item.activity_type,
            competency: item.competency,
            reason: item.reason,
            recommended_route: item.recommended_route,
            completed: false,
            due_offset_days: item.due_offset_days,
          })),
        );
      }

      if (!cancelled) setItems(generated);
      setLoading(false);
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [user?.id, profile]);

  const remaining = useMemo(() => items.filter((i) => !i.completed).length, [items]);

  async function toggleItem(item: PracticePlanItem) {
    if (!user?.id) return;
    setSavingId(item.id);
    const next = !item.completed;
    setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, completed: next } : row)));
    await supabase
      .from("interview_practice_plan_items")
      .update({ completed: next, completed_at: next ? new Date().toISOString() : null })
      .eq("id", item.id)
      .eq("user_id", user.id);
    setSavingId(null);
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
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading plan…</p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Card key={item.id} className="p-4">
              <div className="flex items-start gap-3">
                <button
                  type="button"
                  aria-label={item.completed ? "Mark incomplete" : "Mark complete"}
                  disabled={savingId === item.id}
                  onClick={() => void toggleItem(item)}
                  className="mt-0.5"
                >
                  {item.completed ? (
                    <CheckCircle2 className="h-5 w-5 text-primary" />
                  ) : (
                    <Circle className="h-5 w-5 text-muted-foreground" />
                  )}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-foreground">{item.title}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
                  <Link
                    to={item.recommended_route}
                    className="mt-3 inline-flex rounded-xl border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary"
                  >
                    Open
                  </Link>
                </div>
                <ListTodo className="h-4 w-4 text-muted-foreground" />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
