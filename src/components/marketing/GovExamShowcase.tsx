import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Clock, CheckCircle2, Landmark } from "lucide-react";
import { cn } from "@/lib/utils";

const GOV_EXAMS = ["UPSC CSE", "SSC CGL", "IBPS PO", "HPCL", "PSU"];

const SAMPLE_QUESTIONS = [
  {
    exam: "UPSC CSE",
    q: "Which article of the Constitution deals with the Election Commission?",
    options: ["Art. 324", "Art. 326", "Art. 329", "Art. 330"],
    correct: 0,
  },
  {
    exam: "SSC CGL",
    q: "If 15% of a number is 45, what is 40% of that number?",
    options: ["100", "120", "140", "160"],
    correct: 1,
  },
  {
    exam: "IBPS PO",
    q: "RBI's repo rate is primarily used to control…",
    options: ["Inflation", "Exports", "FDI", "Tax revenue"],
    correct: 0,
  },
];

interface GovExamShowcaseProps {
  compact?: boolean;
  className?: string;
}

export function GovExamShowcase({ compact = false, className }: GovExamShowcaseProps) {
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(compact ? 847 : 2847);
  const [paletteFilled, setPaletteFilled] = useState(0);

  const question = SAMPLE_QUESTIONS[qIndex];

  useEffect(() => {
    const t = setInterval(() => setSeconds((s) => (s > 0 ? s - 1 : compact ? 847 : 2847)), 1000);
    return () => clearInterval(t);
  }, [compact]);

  useEffect(() => {
    const t = setInterval(() => {
      setSelected(null);
      setQIndex((i) => (i + 1) % SAMPLE_QUESTIONS.length);
      setPaletteFilled((p) => (p >= 24 ? 3 : p + 1));
    }, compact ? 3500 : 4500);
    return () => clearInterval(t);
  }, [compact]);

  useEffect(() => {
    if (selected !== null) return;
    const t = setTimeout(() => setSelected(question.correct), compact ? 1800 : 2200);
    return () => clearTimeout(t);
  }, [qIndex, selected, question.correct, compact]);

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;

  return (
    <div
      className={cn(
        "rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/10 via-background to-primary/5 overflow-hidden",
        compact ? "p-4" : "p-6",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Landmark className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className={cn("font-bold text-foreground", compact ? "text-xs" : "text-sm")}>
              Gov Exam Mock Tests
            </p>
            <p className="text-[10px] text-muted-foreground">
              Official PYP papers · timed exam mode
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-amber-500 font-mono text-xs font-semibold bg-amber-500/10 px-2 py-1 rounded-lg">
          <Clock className="w-3.5 h-3.5" />
          {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
        </div>
      </div>

      <div className={cn("grid gap-4", compact ? "grid-cols-1" : "grid-cols-1 lg:grid-cols-5")}>
        {!compact && (
          <div className="lg:col-span-2 space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
              Question palette
            </p>
            <div className="grid grid-cols-6 gap-1.5">
              {Array.from({ length: 24 }, (_, i) => {
                const answered = i < paletteFilled;
                const current = i === paletteFilled;
                return (
                  <m.div
                    key={i}
                    animate={{
                      scale: current ? 1.08 : 1,
                      backgroundColor: answered
                        ? "rgba(34, 197, 94, 0.2)"
                        : current
                          ? "rgba(245, 158, 11, 0.25)"
                          : "rgba(148, 163, 184, 0.1)",
                    }}
                    className={cn(
                      "aspect-square rounded-md flex items-center justify-center text-[9px] font-bold border",
                      answered
                        ? "border-emerald-500/40 text-emerald-600"
                        : current
                          ? "border-amber-500/50 text-amber-600"
                          : "border-border text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </m.div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-1.5 pt-2">
              {GOV_EXAMS.map((exam) => (
                <span
                  key={exam}
                  className="text-[9px] px-2 py-0.5 rounded-full bg-background/80 border border-border text-muted-foreground"
                >
                  {exam}
                </span>
              ))}
            </div>
          </div>
        )}

        <div className={cn(compact ? "" : "lg:col-span-3", "rounded-xl border border-border bg-card/80 p-4")}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600">
              {question.exam}
            </span>
            <span className="text-[10px] text-muted-foreground">Q{qIndex + 1} of 100</span>
          </div>

          <AnimatePresence mode="wait">
            <m.p
              key={qIndex}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className={cn("font-medium text-foreground mb-4", compact ? "text-xs" : "text-sm")}
            >
              {question.q}
            </m.p>
          </AnimatePresence>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {question.options.map((opt, i) => (
              <m.button
                key={opt}
                type="button"
                animate={{
                  borderColor:
                    selected === i
                      ? i === question.correct
                        ? "rgba(34, 197, 94, 0.5)"
                        : "rgba(239, 68, 68, 0.5)"
                      : "rgba(148, 163, 184, 0.2)",
                  backgroundColor:
                    selected === i
                      ? i === question.correct
                        ? "rgba(34, 197, 94, 0.1)"
                        : "rgba(239, 68, 68, 0.08)"
                      : "transparent",
                }}
                className="flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs text-foreground"
              >
                <span className="w-5 h-5 rounded-md bg-secondary flex items-center justify-center text-[10px] font-bold shrink-0">
                  {String.fromCharCode(65 + i)}
                </span>
                <span className="flex-1">{opt}</span>
                {selected === i && i === question.correct && (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                )}
              </m.button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
