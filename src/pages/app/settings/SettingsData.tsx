// @ts-nocheck -- retained: Supabase .from() data types for profiles/sessions/answer_bank/etc.
// are typed as `any` in current generated schema due to manual migration columns; removing
// suppression produces ~15 implicit-any errors on data row field accesses.
import { fetchEdge } from "@/lib/network/fetchEdge";
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonText } from "@/components/ui/SkeletonLoader";
import {
  Download, FileJson, FileText,
  BarChart2, MessageSquare, BookOpen,
  CalendarDays, Trash2, CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsData — export specific data, storage summary
// ─────────────────────────────────────────────────────────────────

const EXPORT_TYPES = [
  {
    id:     "sessions",
    icon:   BarChart2,
    label:  "Sessions & scores",
    desc:   "All mock sessions with scores, timestamps, and metadata.",
    format: "JSON",
    color:  "text-violet-400",
    bg:     "bg-violet-500/10",
  },
  {
    id:     "transcripts",
    icon:   MessageSquare,
    label:  "Session transcripts",
    desc:   "Full answer transcripts from all recorded sessions.",
    format: "TXT",
    color:  "text-blue-400",
    bg:     "bg-blue-500/10",
  },
  {
    id:     "answers",
    icon:   BookOpen,
    label:  "Answer bank",
    desc:   "All saved STAR answers and practice responses.",
    format: "JSON",
    color:  "text-emerald-400",
    bg:     "bg-emerald-500/10",
  },
  {
    id:     "interviews",
    icon:   CalendarDays,
    label:  "Interview schedule",
    desc:   "All scheduled interviews and their details.",
    format: "CSV",
    color:  "text-amber-400",
    bg:     "bg-amber-500/10",
  },
  {
    id:     "full",
    icon:   FileJson,
    label:  "Full data export",
    desc:   "Everything — profile, sessions, answers, settings.",
    format: "ZIP",
    color:  "text-foreground",
    bg:     "bg-secondary",
  },
];

export default function SettingsData() {
  const { user } = useAuthStore();

  const [exporting, setExporting] = useState<string | null>(null);
  const [done,      setDone]      = useState<string[]>([]);

  async function handleExport(type: string) {
    setExporting(type);

    
    try {
      const res = await fetchEdge("export-user-data", { type });

      const blob = await res.blob();
      const ext  = EXPORT_TYPES.find((t) => t.id === type)?.format.toLowerCase() ?? "json";
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = url;
      a.download = `clarify-ai-${type}-${new Date().toISOString().slice(0, 10)}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
      setDone((p) => [...p, type]);
      setTimeout(() => setDone((p) => p.filter((d) => d !== type)), 3000);
    } catch (e) {
      toast.error((e instanceof Error ? e.message : null) ?? "Export failed. Please try again.");
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Data & Export</h2>

      {/* Storage summary */}
      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-4">Storage usage</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Sessions",   value: "—", icon: "🎤" },
            { label: "Transcripts",value: "—", icon: "📝" },
            { label: "Documents",  value: "—", icon: "📄" },
            { label: "Total",      value: "—", icon: "💾" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-1.5 p-3 bg-secondary border border-border rounded-xl"
            >
              <span className="text-xl">{item.icon}</span>
              <p className="text-sm font-bold text-foreground">{item.value}</p>
              <p className="text-[10px] text-muted-foreground">{item.label}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* Export types */}
      <div>
        <h3 className="text-sm font-semibold text-foreground mb-3">Export data</h3>
        <div className="space-y-2">
          {EXPORT_TYPES.map((exp) => {
            const isDone      = done.includes(exp.id);
            const isExporting = exporting === exp.id;

            return (
              <Card key={exp.id} padding="sm">
                <div className="flex items-center gap-4">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center shrink-0",
                    exp.bg
                  )}>
                    <exp.icon className={cn("w-4 h-4", exp.color)} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{exp.label}</p>
                      <Badge variant="gray" size="sm">{exp.format}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{exp.desc}</p>
                  </div>

                  <Button
                    variant={isDone ? "success" : "secondary"}
                    size="xs"
                    loading={isExporting}
                    disabled={!!exporting && !isExporting}
                    onClick={() => handleExport(exp.id)}
                    leftIcon={
                      isDone
                        ? <CheckCircle className="w-3 h-3" />
                        : <Download className="w-3 h-3" />
                    }
                  >
                    {isDone ? "Done!" : "Export"}
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Data retention notice */}
      <Card className="border-blue-500/15 bg-blue-500/3">
        <div className="flex items-start gap-3">
          <FileText className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-blue-300">Data retention policy</p>
            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
              Free plan: data retained for 6 months of inactivity.
              Pro plan: data retained indefinitely. Transcripts can be disabled
              in Privacy settings.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}

function cn(...classes: (string | boolean | undefined)[]) {
  return classes.filter(Boolean).join(" ");
}
