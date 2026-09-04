import { fetchEdge } from "@/lib/network/fetchEdge";
import { useEffect, useRef, useState } from "react";
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
import { cn } from "@/lib/utils";
import {
  createExportIdempotencyKey,
  messageFromExportCaught,
  messageFromExportResponse,
} from "@/lib/export/exportUserFacingError";
import {
  exportFormatBadge,
  serializeExportDownload,
  triggerBlobDownload,
} from "@/lib/export/exportFormats";
import {
  fetchStorageUsage,
  formatStorageCardSubtext,
  formatStorageCardValue,
  type UserStorageUsage,
} from "@/lib/settings/storageUsage";

const EXPORT_TYPES = [
  {
    id: "sessions",
    icon: BarChart2,
    label: "Sessions & scores",
    desc: "All mock sessions with scores, timestamps, and metadata.",
    color: "text-primary",
    bg: "bg-primary/10",
  },
  {
    id: "transcripts",
    icon: MessageSquare,
    label: "Session transcripts",
    desc: "Full answer transcripts from all recorded sessions.",
    color: "text-blue-400",
    bg: "bg-blue-500/10",
  },
  {
    id: "answers",
    icon: BookOpen,
    label: "Answer bank",
    desc: "All saved STAR answers and practice responses.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
  },
  {
    id: "interviews",
    icon: CalendarDays,
    label: "Interview schedule",
    desc: "All scheduled interviews and their details.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
  },
  {
    id: "full",
    icon: FileJson,
    label: "Full data export",
    desc: "Everything — profile, sessions, answers, settings (JSON).",
    color: "text-foreground",
    bg: "bg-secondary",
  },
] as const;

export default function SettingsData() {
  const [exporting, setExporting] = useState<string | null>(null);
  const [done, setDone] = useState<string[]>([]);
  const retryKeys = useRef(new Map<string, string>());

  const [usage, setUsage] = useState<UserStorageUsage | null>(null);
  const [usageLoading, setUsageLoading] = useState(true);
  const [usageError, setUsageError] = useState<string | null>(null);

  async function loadUsage() {
    setUsageLoading(true);
    setUsageError(null);
    try {
      const next = await fetchStorageUsage();
      setUsage(next);
    } catch (err) {
      setUsage(null);
      setUsageError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "Storage usage could not be loaded.",
      );
    } finally {
      setUsageLoading(false);
    }
  }

  useEffect(() => {
    void loadUsage();
  }, []);

  async function handleExport(type: string) {
    if (exporting) return;
    setExporting(type);

    const idempotencyKey = retryKeys.current.get(type) ?? createExportIdempotencyKey(type);
    retryKeys.current.set(type, idempotencyKey);

    try {
      const res = await fetchEdge(
        "export-user-data",
        { type, idempotencyKey },
        { headers: { "Idempotency-Key": idempotencyKey } },
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
      // Parse before download so an HTML/proxy error page is never saved as success.
      const payload = JSON.parse(await blob.text()) as unknown;
      if (!payload || typeof payload !== "object") {
        throw new Error("Export response was invalid.");
      }

      const download = serializeExportDownload(type, payload);
      if (!download.mime.toLowerCase().includes(download.format === "CSV" ? "csv" : "json")) {
        throw new Error("Export MIME did not match the advertised format.");
      }
      if (
        (download.format === "CSV" && !download.filename.endsWith(".csv")) ||
        (download.format === "JSON" && !download.filename.endsWith(".json"))
      ) {
        throw new Error("Export filename extension did not match the format.");
      }

      triggerBlobDownload(download.blob, download.filename);
      retryKeys.current.delete(type);
      setDone((p) => [...p, type]);
      setTimeout(() => setDone((p) => p.filter((d) => d !== type)), 3000);
      toast.success(`${download.format} export downloaded`);
    } catch (e) {
      toast.error(messageFromExportCaught(e));
    } finally {
      setExporting(null);
    }
  }

  const storageCards = [
    { key: "sessions" as const, label: "Sessions", icon: "🎤" },
    { key: "transcripts" as const, label: "Transcripts", icon: "📝" },
    { key: "documents" as const, label: "Documents", icon: "📄" },
    { key: "total" as const, label: "Total", icon: "💾" },
  ];

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-foreground">Data & Export</h2>

      <Card>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-foreground">Storage usage</h3>
          <Button
            variant="ghost"
            size="xs"
            disabled={usageLoading}
            onClick={() => void loadUsage()}
            data-testid="storage-usage-refresh"
          >
            Refresh
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {storageCards.map((item) => {
            const segment = usage?.[item.key];
            const value = usageLoading
              ? "…"
              : usageError
                ? "Unavailable"
                : formatStorageCardValue(segment);
            const sub = usageLoading
              ? "Loading"
              : usageError
                ? usageError
                : formatStorageCardSubtext(segment);
            return (
              <div
                key={item.label}
                className="flex flex-col items-center gap-1.5 rounded-xl border border-border bg-secondary p-3"
                data-testid={`storage-card-${item.key}`}
              >
                <span className="text-xl" aria-hidden>
                  {item.icon}
                </span>
                <p className="text-sm font-bold text-foreground">{value}</p>
                <p className="text-[10px] text-muted-foreground">{item.label}</p>
                <p className="text-[10px] text-muted-foreground text-center leading-snug">{sub}</p>
              </div>
            );
          })}
        </div>
        {(usageError ||
          usage?.documents.status === "unavailable" ||
          usage?.total.status === "unavailable") && (
          <p className="mt-3 text-xs text-muted-foreground" data-testid="storage-usage-footnote">
            {usageError
              ? "Live storage measurement is unavailable right now. Exports still work."
              : usage?.documents.reason ||
                usage?.total.reason ||
                "Some storage segments could not be measured from the provider."}
          </p>
        )}
      </Card>

      <div>
        <h3 className="mb-3 text-sm font-semibold text-foreground">Export data</h3>
        <p className="mb-3 text-xs text-muted-foreground">
          Sessions, transcripts, answers, and interviews download as CSV. Full export is pretty-printed JSON.
          Files are never labeled as PDF.
        </p>
        <div className="space-y-2">
          {EXPORT_TYPES.map((exp) => {
            const isDone = done.includes(exp.id);
            const isExporting = exporting === exp.id;
            const format = exportFormatBadge(exp.id);

            return (
              <Card key={exp.id} padding="sm">
                <div className="flex items-center gap-4">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
                      exp.bg,
                    )}
                  >
                    <exp.icon className={cn("h-4 w-4", exp.color)} />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground">{exp.label}</p>
                      <Badge variant="gray" size="sm">
                        {format}
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

      <Card className="bg-blue-500/3 border-blue-500/15">
        <div className="flex items-start gap-3">
          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
          <div>
            <p className="text-xs font-semibold text-blue-300">Data retention policy</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Free plan: data retained for 6 months of inactivity. Pro plan: data retained
              indefinitely while subscribed. You can export or delete your data at any time.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
