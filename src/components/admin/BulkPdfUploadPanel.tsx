import { useRef, useState } from "react";
import { FileText, Loader2, Sparkles, CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { questionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { unwrapEdgePayload } from "@/lib/network/edgeResult";
import { normalizeExamTypeForStorage } from "@/lib/mock-test/examTypes";
import {
  isParseQuestionPdfQueuedPayload,
  pollParseQuestionPdfJob,
} from "@/lib/gov-exam/parseQuestionPdfJob";
import { cn } from "@/lib/utils";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

const TARGET_EXAMS = [
  "JEE_MAIN",
  "JEE_ADV",
  "NEET",
  "UPSC",
  "SSC_CGL",
  "IBPS_PO",
  "HPCL_ENGINEER",
  "PSU",
  "CUSTOM",
];

type FileJob = {
  id: string;
  file: File;
  status: "pending" | "processing" | "done" | "error";
  message?: string;
  count?: number;
};

interface BulkPdfUploadPanelProps {
  onImported?: () => void;
  defaultExamType?: string;
  defaultSourceYear?: string;
}

export function BulkPdfUploadPanel({
  onImported,
  defaultExamType = "UPSC",
  defaultSourceYear,
}: BulkPdfUploadPanelProps) {
  const user = useAuthStore((s) => s.user);
  const fileRef = useRef<HTMLInputElement>(null);
  const [examType, setExamType] = useState(defaultExamType);
  const [sourceYear, setSourceYear] = useState(
    defaultSourceYear ?? new Date().getFullYear().toString(),
  );
  const [jobs, setJobs] = useState<FileJob[]>([]);
  const [running, setRunning] = useState(false);

  function addFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    const pdfs = Array.from(fileList).filter(
      (f) => f.type === "application/pdf" || f.name.toLowerCase().endsWith(".pdf"),
    );
    if (pdfs.length === 0) {
      toast.error("Please select PDF files only.");
      return;
    }
    const oversized = pdfs.find((f) => f.size > 15 * 1024 * 1024);
    if (oversized) {
      toast.error(`${oversized.name} exceeds 15 MB limit.`);
      return;
    }
    setJobs((prev) => [
      ...prev,
      ...pdfs.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as const,
      })),
    ]);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function processOne(job: FileJob): Promise<FileJob> {
    if (!user?.id) throw new Error("Not authenticated");

    const formData = new FormData();
    formData.append("pdf", job.file);
    formData.append("exam_type", examType);
    formData.append("source_year", sourceYear);

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const token = session?.access_token ?? "";

    const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-question-pdf`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });

    const json = await response.json().catch(() => ({}));

    if (response.status === 504 || response.status === 502) {
      throw new Error(
        (json as { error?: string }).error ?? "PDF parsing failed. Credits refunded.",
      );
    }

    if (!response.ok && response.status !== 202) {
      throw new Error((json as { error?: string }).error ?? "PDF parsing failed");
    }

    let inner = unwrapEdgePayload<{
      questions?: unknown[];
      accepted?: boolean;
      jobId?: string;
      status?: string;
      persistedToBank?: boolean;
      count?: number;
      error?: string;
      message?: string;
    }>(json);

    if (response.status === 202 || isParseQuestionPdfQueuedPayload(inner)) {
      if (!inner.jobId) throw new Error("PDF queued but no job id was returned.");
      const parsedJob = await pollParseQuestionPdfJob(inner.jobId);
      if (parsedJob.status === "failed") {
        throw new Error(
          parsedJob.error || parsedJob.message || "PDF parsing failed. Credits refunded.",
        );
      }
      inner = {
        questions: parsedJob.questions,
        count: parsedJob.count,
        persistedToBank: parsedJob.persistedToBank,
      };
    }

    const questions = Array.isArray(inner.questions) ? inner.questions : [];
    if (inner.persistedToBank && (inner.count ?? questions.length) > 0) {
      const count = inner.count ?? questions.length;
      return {
        ...job,
        status: "done",
        count,
        message: `${count} questions saved`,
      };
    }

    if (questions.length === 0) throw new Error("No MCQs extracted from PDF");

    const storageExamType = normalizeExamTypeForStorage(examType) ?? examType;
    const rowsToInsert = questions.map((q: Record<string, unknown>) => ({
      ...q,
      exam_type: storageExamType,
      source_year: Number(sourceYear),
      source: "OFFICIAL_PYP",
      is_verified: true,
      is_public: true,
      uploaded_by: user.id,
    })) as Parameters<typeof questionsDB.createMany>[0];

    await questionsDB.createMany(rowsToInsert);

    return {
      ...job,
      status: "done",
      count: questions.length,
      message: `${questions.length} questions saved`,
    };
  }

  async function runQueue() {
    if (!jobs.some((j) => j.status === "pending")) {
      toast.error("Add PDF files to the queue first.");
      return;
    }
    setRunning(true);
    let totalImported = 0;

    for (const job of jobs) {
      if (job.status !== "pending") continue;

      setJobs((prev) =>
        prev.map((j) => (j.id === job.id ? { ...j, status: "processing" } : j)),
      );

      try {
        const result = await processOne(job);
        totalImported += result.count ?? 0;
        setJobs((prev) => prev.map((j) => (j.id === job.id ? result : j)));
      } catch (err) {
        const message = err instanceof Error ? err.message : "Failed";
        setJobs((prev) =>
          prev.map((j) =>
            j.id === job.id ? { ...j, status: "error", message } : j,
          ),
        );
      }
    }

    setRunning(false);
    if (totalImported > 0) {
      toast.success(`Imported ${totalImported} questions from PDF(s).`);
      onImported?.();
    }
  }

  function clearCompleted() {
    setJobs((prev) => prev.filter((j) => j.status === "pending" || j.status === "processing"));
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-foreground">Target exam</label>
          <Select value={examType} onValueChange={setExamType}>
            <SelectTrigger className="bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TARGET_EXAMS.map((e) => (
                <SelectItem key={e} value={e}>
                  {e.replace(/_/g, " ")}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <label className="text-xs font-semibold uppercase text-foreground">Source year</label>
          <Input
            type="number"
            value={sourceYear}
            onChange={(e) => setSourceYear(e.target.value)}
            className="bg-background"
          />
        </div>
      </div>

      <div
        className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-primary/30 bg-primary/5 p-8 cursor-pointer hover:border-primary/50 transition-colors"
        onClick={() => fileRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          addFiles(e.dataTransfer.files);
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          multiple
          className="sr-only"
          onChange={(e) => addFiles(e.target.files)}
        />
        <FileText className="h-10 w-10 text-primary mb-3" />
        <p className="font-medium text-foreground">Drop PDF exam papers here</p>
        <p className="text-sm text-muted-foreground mt-1 text-center">
          Official NTA / UPSC / SSC papers · multiple files · max 15 MB each
        </p>
      </div>

      {jobs.length > 0 && (
        <div className="space-y-2 rounded-xl border border-border divide-y divide-border overflow-hidden">
          {jobs.map((job) => (
            <div key={job.id} className="flex items-center gap-3 px-4 py-3 text-sm bg-card">
              {job.status === "processing" && (
                <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
              )}
              {job.status === "done" && (
                <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
              )}
              {job.status === "error" && (
                <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              )}
              {job.status === "pending" && (
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 truncate font-medium">{job.file.name}</span>
              <span
                className={cn(
                  "text-xs shrink-0",
                  job.status === "error" && "text-destructive",
                  job.status === "done" && "text-emerald-600",
                  job.status === "processing" && "text-primary",
                )}
              >
                {job.status === "pending" && "Queued"}
                {job.status === "processing" && "Extracting…"}
                {job.status === "done" && job.message}
                {job.status === "error" && job.message}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={() => void runQueue()}
          disabled={running || !jobs.some((j) => j.status === "pending")}
          className="bg-primary hover:bg-primary/90 text-white"
        >
          {running ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4 mr-2" />
          )}
          {running ? "Processing…" : "Extract & publish all"}
        </Button>
        <Button variant="outline" onClick={clearCompleted} disabled={running}>
          Clear finished
        </Button>
        <Button variant="ghost" onClick={() => setJobs([])} disabled={running}>
          Clear queue
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        AI reads each PDF and extracts MCQs with options A–D and answers. Questions are saved to
        the public bank as verified official PYP.
      </p>
    </div>
  );
}
