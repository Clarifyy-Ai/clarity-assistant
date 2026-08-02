import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { FileUp, Loader2, RefreshCw, AlertTriangle } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  EXTRACT_LICENSE_CLASSES,
  validateExtractQuestionPaperPayload,
} from "@/lib/gov-exam/extractQuestionPaper";
import {
  listExamStages,
  listGovExamsAdmin,
  listIngestionJobs,
  triggerExtractQuestionPaper,
  type IngestionJobRow,
} from "@/lib/gov-exam/adminOps";

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(new Error("Failed to read PDF"));
    reader.readAsDataURL(file);
  });
}

function jobBadge(status: string): "gray" | "amber" | "emerald" | "red" | "blue" {
  if (status === "completed") return "emerald";
  if (status === "failed" || status === "cancelled") return "red";
  if (status === "queued" || status === "awaiting_payload") return "gray";
  if (status.includes("extract") || status.includes("normal")) return "blue";
  return "amber";
}

export default function AdminGovIngest() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [exams, setExams] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [stages, setStages] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [jobs, setJobs] = useState<IngestionJobRow[]>([]);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [examId, setExamId] = useState("");
  const [stageId, setStageId] = useState("");
  const [title, setTitle] = useState("");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [licenseClass, setLicenseClass] = useState<string>("user_upload");
  const [storagePath, setStoragePath] = useState("");
  const [textPayload, setTextPayload] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [lastConfidence, setLastConfidence] = useState<
    Array<{ index: number; flags: string[]; score: number }>
  >([]);

  async function loadJobs() {
    setLoadingJobs(true);
    const { data, error } = await listIngestionJobs({ limit: 40 });
    if (error) toast.error(error);
    setJobs(data);
    setLoadingJobs(false);
  }

  useEffect(() => {
    void loadJobs();
    void (async () => {
      const e = await listGovExamsAdmin({});
      if (!e.error) {
        setExams(e.data.map((x) => ({ id: x.id, code: x.code, name: x.name })));
      }
    })();
  }, []);

  useEffect(() => {
    if (!examId) {
      setStages([]);
      setStageId("");
      return;
    }
    void (async () => {
      const s = await listExamStages(examId);
      if (!s.error) {
        setStages(
          (s.data as Array<{ id: string; code: string; name: string }>).map((x) => ({
            id: x.id,
            code: x.code,
            name: x.name,
          })),
        );
      }
    })();
  }, [examId]);

  async function handleExtract() {
    let pdfBase64: string | undefined;
    if (pdfFile) {
      if (pdfFile.size > 15 * 1024 * 1024) {
        toast.error("PDF exceeds 15MB");
        return;
      }
      pdfBase64 = await fileToBase64(pdfFile);
    }

    const draft = {
      examId,
      stageId: stageId || undefined,
      title: title || pdfFile?.name || "Previous-year paper",
      year: Number(year),
      licenseClass,
      storagePath: storagePath.trim() || undefined,
      textPayload: textPayload.trim() || undefined,
      pdfBase64,
      createPaper: true,
    };

    const pre = validateExtractQuestionPaperPayload(draft);
    if (pre.ok === false) {
      toast.error(pre.message);
      return;
    }

    setSubmitting(true);
    const { data, error } = await triggerExtractQuestionPaper(draft);
    setSubmitting(false);

    if (error) {
      toast.error(error);
      return;
    }

    toast.success(data?.message ?? `Imported ${data?.questionsImported ?? 0} questions (needs review)`);
    setLastConfidence(data?.confidenceFlags ?? []);
    setPdfFile(null);
    setTextPayload("");
    if (fileRef.current) fileRef.current.value = "";
    void loadJobs();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="PDF / OCR ingest"
        description="Admin-authorized previous-year PDF extract. Never scrapes; OCR stays private until Q Review approval."
        icon={<FileUp className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Register PDF &amp; extract</h3>
          <p className="text-xs text-muted-foreground">
            Upload a PDF (base64), paste OCR text, or point at a storage path
            (<code className="mx-1">bucket/object.pdf</code>. Respect
            <code className="mx-1">license_class</code>. Output is always
            <code className="mx-1">is_public=false</code> until review.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Select value={examId || "none"} onValueChange={(v) => setExamId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Exam (required)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select exam</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={stageId || "none"} onValueChange={(v) => setStageId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Stage (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No stage</SelectItem>
                {stages.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="Paper title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="Year"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            />
            <Select value={licenseClass} onValueChange={setLicenseClass}>
              <SelectTrigger><SelectValue placeholder="License class" /></SelectTrigger>
              <SelectContent>
                {EXTRACT_LICENSE_CLASSES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Input
              placeholder="storage path (optional) e.g. documents/pyq/ssc.pdf"
              value={storagePath}
              onChange={(e) => setStoragePath(e.target.value)}
            />
          </div>
          <div>
            <input
              ref={fileRef}
              type="file"
              accept="application/pdf,.pdf"
              className="text-sm"
              onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
            />
            {pdfFile && (
              <p className="text-xs text-muted-foreground mt-1">
                {pdfFile.name} ({Math.round(pdfFile.size / 1024)} KB)
              </p>
            )}
          </div>
          <textarea
            className="w-full min-h-[100px] rounded-md border bg-background px-3 py-2 text-sm"
            placeholder="Optional pasted OCR / plain text (instead of PDF)"
            value={textPayload}
            onChange={(e) => setTextPayload(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handleExtract()}
              disabled={submitting || !examId}
              leftIcon={submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
            >
              Extract &amp; queue for review
            </Button>
            <Link
              to="/app/admin/gov/question-review"
              className="inline-flex items-center justify-center px-4 py-2.5 text-sm rounded-xl border border-border hover:bg-secondary"
            >
              Open Q Review
            </Link>
          </div>
        </CardContent>
      </Card>

      {lastConfidence.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Last run confidence flags
            </h3>
            <div className="flex flex-wrap gap-1">
              {lastConfidence.filter((c) => c.flags.length > 0 || c.score < 0.7).slice(0, 40).map((c) => (
                <Badge key={c.index} variant="amber" className="text-[10px]">
                  Q{c.index + 1}: {c.flags.join(",") || "low"} ({c.score})
                </Badge>
              ))}
              {lastConfidence.every((c) => c.flags.length === 0 && c.score >= 0.7) && (
                <span className="text-xs text-muted-foreground">No low-confidence flags</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Ingestion jobs</h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadJobs()}
          leftIcon={loadingJobs ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
        >
          Refresh
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Created</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Imported</TableHead>
                <TableHead>Mode / flags</TableHead>
                <TableHead>Error</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.length === 0 && !loadingJobs && (
                <TableRow>
                  <TableCell colSpan={5} className="text-sm text-muted-foreground text-center py-8">
                    No ingestion jobs yet
                  </TableCell>
                </TableRow>
              )}
              {jobs.map((j) => {
                const meta = j.metadata ?? {};
                const summary = meta.confidence_summary as
                  | { low?: number; flagged?: number; total?: number }
                  | undefined;
                return (
                  <TableRow key={j.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {new Date(j.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={jobBadge(j.status)}>{j.status}</Badge>
                    </TableCell>
                    <TableCell className="text-sm">{j.questions_imported}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {String(meta.mode ?? meta.kind ?? "—")}
                      {summary ? (
                        <span className="ml-1">
                          · flagged {summary.flagged ?? 0}/{summary.total ?? 0}
                          {(summary.low ?? 0) > 0 ? ` · low ${summary.low}` : ""}
                        </span>
                      ) : null}
                      {meta.needs_review === true ? " · needs review" : ""}
                    </TableCell>
                    <TableCell className="text-xs text-red-400 max-w-[220px] truncate">
                      {j.error ?? ""}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
