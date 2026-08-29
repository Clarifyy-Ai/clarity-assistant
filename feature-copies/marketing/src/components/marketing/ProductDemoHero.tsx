import { useEffect, useState } from "react";
import { m, AnimatePresence } from "framer-motion";
import { Mic, Zap, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

const STAR_LINES = [
  { label: "Situation", text: "Led a 3-person team to ship a critical feature two weeks ahead of schedule..." },
  { label: "Task", text: "Coordinated design, backend, and QA while managing stakeholder expectations..." },
  { label: "Action", text: "Ran daily standups, cut scope in half, and shipped an MVP first..." },
  { label: "Result", text: "Delivered on time, reduced bug count by 40%, praised by VP of Eng..." },
];

const METRICS = [
  { label: "Confidence", target: 87, color: "bg-emerald-500" },
  { label: "Clarity", target: 92, color: "bg-blue-500" },
  { label: "Pacing (WPM)", target: 74, color: "bg-primary" },
];

function WaveformBars() {
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[0, 1, 2, 3, 4].map((i) => (
        <m.span
          key={i}
          className="w-0.5 rounded-full bg-primary/80"
          animate={{ height: ["40%", "100%", "55%", "90%", "40%"] }}
          transition={{
            duration: 1.2,
            repeat: Infinity,
            delay: i * 0.12,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

export function ProductDemoHero() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [metrics, setMetrics] = useState(METRICS.map((m) => ({ ...m, value: 0 })));

  useEffect(() => {
    const lineTimer = setInterval(() => {
      setVisibleLines((v) => (v >= STAR_LINES.length ? 0 : v + 1));
    }, 2200);
    return () => clearInterval(lineTimer);
  }, []);

  useEffect(() => {
    const animateMetrics = () => {
      setMetrics(METRICS.map((m) => ({ ...m, value: 0 })));
      METRICS.forEach((m, idx) => {
        setTimeout(() => {
          setMetrics((prev) =>
            prev.map((p, i) => (i === idx ? { ...p, value: m.target } : p)),
          );
        }, 400 + idx * 350);
      });
    };
    animateMetrics();
    const metricTimer = setInterval(animateMetrics, 5000);
    return () => clearInterval(metricTimer);
  }, []);

  return (
    <m.div
      className="relative rounded-2xl border border-border bg-card shadow-2xl shadow-black/30 overflow-hidden"
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay: 0.3 }}
    >
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-secondary/30">
        <div className="flex gap-1.5">
          <span className="w-3 h-3 rounded-full bg-red-400/70" />
          <span className="w-3 h-3 rounded-full bg-amber-400/70" />
          <span className="w-3 h-3 rounded-full bg-emerald-400/70" />
        </div>
        <div className="flex-1 mx-4">
          <div className="h-5 rounded-md bg-secondary/60 w-48 mx-auto text-[10px] text-muted-foreground/60 flex items-center justify-center">
            Clarify AI — Practice Session
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <m.span
            className="w-2 h-2 rounded-full bg-emerald-400"
            animate={{ opacity: [1, 0.3, 1] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
          <span className="text-[10px] text-emerald-400 font-medium">Live</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 min-h-[280px] sm:min-h-[340px]">
        <div className="lg:col-span-2 lg:border-r border-border p-4 sm:p-6 flex flex-col gap-4 border-b lg:border-b-0">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                <Mic className="w-4 h-4 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold truncate">Mock Interview — Software Engineer</p>
                <p className="text-[10px] text-muted-foreground">FAANG Behavioral Round</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <WaveformBars />
              <span className="px-2.5 py-0.5 rounded-full bg-primary/10 text-[10px] font-medium text-primary border border-primary/20 whitespace-nowrap">
                Practice Coach Active
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-secondary/20 p-4 flex-1 flex flex-col gap-3">
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
              Interviewer question
            </p>
            <p className="text-sm font-semibold leading-relaxed">
              &ldquo;Tell me about a time you had to lead a project under a tight deadline with limited resources.&rdquo;
            </p>
            <div className="mt-auto pt-3 border-t border-border">
              <div className="flex items-center gap-1.5 mb-2">
                <Zap className="w-3 h-3 text-primary" />
                <p className="text-[10px] text-primary font-semibold uppercase tracking-wide">
                  Practice Coach — STAR Answer
                </p>
                <m.span
                  className="ml-auto text-[9px] text-muted-foreground"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                >
                  Gemini · GPT-4o · Claude
                </m.span>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground leading-relaxed min-h-[88px]">
                <AnimatePresence mode="popLayout">
                  {STAR_LINES.slice(0, visibleLines).map((line) => (
                    <m.p
                      key={line.label}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.35 }}
                    >
                      <span className="font-semibold text-foreground">{line.label}:</span>{" "}
                      {line.text}
                    </m.p>
                  ))}
                </AnimatePresence>
                {visibleLines < STAR_LINES.length && (
                  <m.span
                    className="inline-block w-1.5 h-3.5 bg-primary/70 rounded-sm"
                    animate={{ opacity: [1, 0] }}
                    transition={{ duration: 0.6, repeat: Infinity }}
                  />
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-4 bg-secondary/10">
          <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
            Live Metrics
          </p>
          <div className="space-y-3">
            {metrics.map((metric) => (
              <div key={metric.label}>
                <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                  <span>{metric.label}</span>
                  <span className="font-semibold text-foreground">{metric.value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  <m.div
                    className={cn("h-1.5 rounded-full", metric.color)}
                    animate={{ width: `${metric.value}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-auto space-y-2">
            <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide">
              Topics covered
            </p>
            {["Leadership", "Time management", "Prioritization"].map((t, i) => (
              <m.div
                key={t}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 + i * 0.15 }}
              >
                <CheckCircle2 className="w-3 h-3 text-primary flex-shrink-0" />
                {t}
              </m.div>
            ))}
          </div>
        </div>
      </div>
    </m.div>
  );
}
