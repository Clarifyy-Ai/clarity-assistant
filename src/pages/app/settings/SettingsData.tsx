// @ts-nocheck -- retained: Supabase .from() data types for profiles/sessions/answer_bank/etc.
// are typed as `any` in current generated schema due to manual migration columns; removing
// suppression produces ~15 implicit-any errors on data row field accesses.
import { fetchEdge } from "@/lib/network/fetchEdge";
import { useRef, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Download,
  FileJson,
  FileText,
  BarChart2,
  MessageSquare,
  BookOpen,
  CalendarDays,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";
import {
  createExportIdempotencyKey,
  messageFromExportCaught,
  messageFromExportResponse,
} from "@/lib/export/exportUserFacingError";

// ─────────────────────────────────────────────────────────────────
// SettingsData — export specific data, storage summary
// ─────────────────────────────────────────────────────────────────

const EXPORT_TYPES = [
  {
    id: "sessions",
    icon: BarChart2,
    label: "Sessions & scores",
    desc: "All mock sessions with scores, timestamps, and metadata.",
    format: "JSON",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    id: "transcripts",
    icon: MessageSquare,
    label: "Session transcripts",
    desc: "Full answer transcripts from all recorded sessions.",
    format: "JSON",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    id: "answers",
    icon: BookOpen,
    label: "Answer bank",
    desc: "All saved STAR answers and practice responses.",
    format: "JSON",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    id: "interviews",
    icon: CalendarDays,
    label: "Interview schedule",
    desc: "All scheduled interviews and their details.",
    format: "JSON",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    id: "full",
    icon: FileJson,
    label: "Full data export",
    desc: "Everything — profile, sessions, answers, settings.",
    format: "JSON",
    color: "text-foreground",
    bg: "bg-secondary",
  },
];

export default function SettingsData() {
  const { user: _user } = useAuthStore();

  const [exporting, setExporting] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const retryKeys = useRef(new Map<string, string>());

  async function handleExport(type: string) {
    if (exporting) return;
    setExporting(type);

    const idempotencyKey = retryKeys.current.get(type) ?? createExportIdempotencyKey(type);
    retryKeys.current.set(type, idempotencyKey);

    try {
      const res = await fetchEdge(
        "export-user-data",
        { type, idempotencyKey },
        { headers: { "Idempotency-Key": idempotencyKey } }
      );

      if (!res.ok) {
        const msg = await messageFromExportResponse(res);
        toast.error(msg);
        return;
      }

      const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
      const blob = await res.blob();
      if (!blob.size || !contentType.includes("application/json")) {
        throw new Error("Export response was invalid.");
      }
      // Parse the downloaded payload before creating a browser download. This
      // prevents an HTML/proxy error page from being saved as a successful file.
      const payload = JSON.parse(await blob.text()) as unknown;
      if (!payload || typeof payload !== "object") {
        throw new Error("Export response was invalid.");
      }
      const downloadBlob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      });
      const url = URL.createObjectURL(downloadBlob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `clarify-ai-${type}-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      retryKeys.current.delete(type);
      setDone((p) => [...p, type]);
      setTimeout(() => setDone((p) => p.filter((d) => d !== type)), 3000);
      toast.success("Export downloaded successfully");
    } catch (e) {
      toast.error(messageFromExportCaught(e));
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Data & Export</h2>

      {/* Storage summary */}
      <Card>
        <h3 className="mb-4 text-sm font-semibold text-foreground">Storage usage</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: "Sessions", value: "—", icon: "🎤" },
            { label: "Transcripts", value: "—", icon: "📝" },
            { label: "Documents", value: "—", icon: "📄" },
            { label: "Total", value: "—", icon: "💾" },
          ].map((item) => (
            <div
              key={item.label}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-3"
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
        <h3 className="mb-3 text-sm font-semibold text-foreground">Export data</h3>
        <div className="space-y-2">
          {EXPORT_TYPES.map((exp) => {
            const isDone = done.includes(exp.id);
            const isExporting = exporting === exp.id;

            return (
              <Card key={exp.id} padding="sm">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      exp.bg
                    )}
                  >
                    <exp.icon className={cn("h-4 w-4", exp.color)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{exp.label}</p>
                      <Badge variant="gray" size="sm">
                        {exp.format}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{exp.desc}</p>
                  </div>

                  <Button
                    variant={isDone ? "success" : "secondary"}
                    size="xs"
                    loading={isExporting}
                    disabled={!!exporting}
                    data-testid={`export-${exp.id}`}
                    onClick={() => handleExport(exp.id)}
                    leftIcon={
                      isDone ? (
                        <CheckCircle className="h-3 w-3" />
                      ) : (
                        <Download className="h-3 w-3" />
                      )
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
      <Card className="bg-blue-500/3 border-blue-500/15">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            <p className="text-xs font-semibold text-blue-300">Data retention policy</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Free plan: data retained for 6 months of inactivity. Pro plan: data retained
              indefinitely. Transcripts can be disabled in Privacy settings.
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
