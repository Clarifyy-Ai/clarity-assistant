// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { useCredits } from "@/hooks/useCredits";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Star, Sparkles, Save, Loader2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

const EXAMPLES = [
  "Tell me about a time you led a team through a difficult project.",
  "Describe a situation where you had to deal with a tight deadline.",
  "Give an example of how you resolved a conflict at work.",
  "Tell me about a time you failed and what you learned.",
];

export default function StarBuilder() {
  const { user } = useAuthStore();
  const credits = useCredits();

  const [question, setQuestion] = useState("");
  const [situation, setSituation] = useState("");
  const [task, setTask] = useState("");
  const [action, setAction] = useState("");
  const [result, setResult] = useState("");
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);

  const hasContent = situation || task || action || result;

  async function handlePolish() {
    if (!hasContent) {
      toast.error("Write something in the STAR fields first.");
      return;
    }

    const deductResult = await credits.deduct("star_generate");
    if (!deductResult.success) {
      toast.error(deductResult.error ?? "Not enough credits.");
      return;
    }

    setPolishing(true);
    try {
      const input = `Question: ${question || "(general behavioral)"}\n\nSituation: ${situation}\nTask: ${task}\nAction: ${action}\nResult: ${result}`;

      const { data, error } = await supabase.functions.invoke("prep-tool", {
        body: { tool_id: "star_method", input },
      });

      if (error) throw error;

      const text = data?.result ?? data?.output ?? "";
      if (text) {
        const parts = parseSTAR(text);
        if (parts.situation) setSituation(parts.situation);
        if (parts.task) setTask(parts.task);
        if (parts.action) setAction(parts.action);
        if (parts.result) setResult(parts.result);
        toast.success("Answer polished with AI!");
      }
    } catch (err) {
      credits.refund("star_generate");
      toast.error("AI polish failed. Credits refunded.");
    } finally {
      setPolishing(false);
    }
  }

  async function handleSave() {
    if (!user?.id || !hasContent) return;
    setSaving(true);
    try {
      const answerText = `**Situation:** ${situation}\n\n**Task:** ${task}\n\n**Action:** ${action}\n\n**Result:** ${result}`;
      const { error } = await supabase.from("answer_bank").insert({
        user_id: user.id,
        question_text: question || "Behavioral question",
        answer_text: answerText,
        category: "Behavioural",
        source: "prep_lab",
        tags: ["star"],
      });
      if (error) throw error;
      toast.success("Saved to Answer Bank!");
    } catch {
      toast.error("Failed to save answer.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="STAR Builder"
        description="Structure behavioral answers using the STAR framework"
        icon={<Star className="w-5 h-5 text-amber-400" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <label className="block text-sm font-medium text-foreground mb-1.5">
              Interview Question
            </label>
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Tell me about a time you led a team..."
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50"
            />
          </Card>

          {(["Situation", "Task", "Action", "Result"] as const).map((label) => {
            const val = { Situation: situation, Task: task, Action: action, Result: result }[label];
            const setter = { Situation: setSituation, Task: setTask, Action: setAction, Result: setResult }[label];
            const hints: Record<string, string> = {
              Situation: "Describe the context — where, when, and what was happening.",
              Task: "What was your specific responsibility or challenge?",
              Action: "What steps did you personally take?",
              Result: "What was the outcome? Quantify if possible.",
            };
            return (
              <Card key={label}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="w-6 h-6 rounded-md bg-violet-500/15 flex items-center justify-center text-xs font-bold text-violet-500">
                    {label[0]}
                  </span>
                  <label className="text-sm font-medium text-foreground">{label}</label>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{hints[label]}</p>
                <textarea
                  value={val}
                  onChange={(e) => setter(e.target.value)}
                  rows={3}
                  placeholder={`Write your ${label.toLowerCase()} here...`}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/50 resize-none"
                />
              </Card>
            );
          })}

          <div className="flex gap-2">
            <Button
              variant="primary"
              onClick={handlePolish}
              disabled={polishing || !hasContent}
              leftIcon={polishing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            >
              {polishing ? "Polishing..." : "AI Polish (1 credit)"}
            </Button>
            <Button
              variant="secondary"
              onClick={handleSave}
              disabled={saving || !hasContent}
              leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            >
              Save to Answer Bank
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-muted-foreground" />
              Example Questions
            </h3>
            <div className="space-y-2">
              {EXAMPLES.map((ex, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(ex)}
                  className={cn(
                    "w-full text-left text-xs p-2.5 rounded-lg border border-border",
                    "hover:bg-accent/10 hover:border-violet-500/30 transition-all",
                    "text-muted-foreground hover:text-foreground"
                  )}
                >
                  {ex}
                </button>
              ))}
            </div>
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Tips</h3>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li>Be specific — avoid vague generalities.</li>
              <li>Focus on YOUR actions, not the team's.</li>
              <li>Quantify results when possible (%, $, time).</li>
              <li>Keep each section 2-4 sentences.</li>
              <li>Use AI Polish to refine your language.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}

function parseSTAR(text: string) {
  const out = { situation: "", task: "", action: "", result: "" };
  const lower = text.toLowerCase();

  const sIdx = lower.indexOf("situation");
  const tIdx = lower.indexOf("task");
  const aIdx = lower.indexOf("action");
  const rIdx = lower.indexOf("result");

  function extract(start: number, end: number) {
    if (start < 0) return "";
    const raw = text.slice(start, end > 0 ? end : undefined);
    return raw.replace(/^[^:]*:\s*/i, "").trim();
  }

  out.situation = extract(sIdx, tIdx);
  out.task = extract(tIdx, aIdx);
  out.action = extract(aIdx, rIdx);
  out.result = extract(rIdx, -1);

  return out;
}
