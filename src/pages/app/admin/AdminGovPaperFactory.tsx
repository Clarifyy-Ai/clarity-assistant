import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Factory, Loader2, AlertTriangle } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  PAPER_FACTORY_MODES,
  scraperApi,
  type PaperFactoryExamRow,
  type PaperFactoryMode,
} from "@/lib/scraper/client";
import { toAdminUserMessage } from "@/lib/admin/adminErrors";

function examQuery(row: PaperFactoryExamRow): string {
  return String(row.code || row.prompt_label || row.name || row.id || "").trim();
}

function examLabel(row: PaperFactoryExamRow): string {
  const code = String(row.code || "").trim();
  const name = String(row.name || row.prompt_label || "").trim();
  if (code && name && code !== name) return `${code} — ${name}`;
  return name || code || examQuery(row) || "Untitled exam";
}

export default function AdminGovPaperFactory() {
  const configured = scraperApi.isConfigured();
  const [exams, setExams] = useState<PaperFactoryExamRow[]>([]);
  const [loadingExams, setLoadingExams] = useState(configured);
  const [exam, setExam] = useState("");
  const [stage, setStage] = useState("");
  const [mode, setMode] = useState<PaperFactoryMode>("generated_mock");
  const [language, setLanguage] = useState("en");
  const [questionCount, setQuestionCount] = useState(25);
  const [jobId, setJobId] = useState("");
  const [busy, setBusy] = useState<"plan" | "process" | "generate" | null>(null);
  const [plan, setPlan] = useState<Record<string, unknown> | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    if (!configured) return;
    void (async () => {
      setLoadingExams(true);
      try {
        const res = await scraperApi.paperFactoryExams();
        setExams(res.exams ?? []);
        const first = examQuery(res.exams?.[0] ?? {});
        if (first) setExam((current) => current || first);
      } catch (err) {
        toast.error(toAdminUserMessage(err, undefined, "paper_factory.exams"));
      } finally {
        setLoadingExams(false);
      }
    })();
  }, [configured]);

  const selectedExam = useMemo(
    () => exams.find((row) => examQuery(row) === exam) ?? null,
    [exams, exam],
  );

  function planBody() {
    return {
      exam: exam.trim(),
      stage: stage.trim() || null,
      language: language.trim() || "en",
      mode,
      question_count: questionCount,
    };
  }

  async function handlePlan() {
    if (!exam.trim()) {
      toast.error("Select an exam before planning.");
      return;
    }
    setBusy("plan");
    setPlan(null);
    try {
      const res = await scraperApi.paperFactoryPlan(planBody());
      setPlan(res.plan ?? {});
      toast.success("Blueprint planned (no AI spend).");
    } catch (err) {
      toast.error(toAdminUserMessage(err, undefined, "paper_factory.plan"));
    } finally {
      setBusy(null);
    }
  }

  async function handleProcessJob() {
    const id = jobId.trim();
    if (!id) {
      toast.error("Paste a gov_paper_generation_jobs id first.");
      return;
    }
    setBusy("process");
    setLastResult(null);
    try {
      const res = await scraperApi.paperFactoryProcessJob(id);
      setLastResult(res as unknown as Record<string, unknown>);
      toast.success(res.already_completed ? "Job was already completed." : "Job processed.");
    } catch (err) {
      toast.error(toAdminUserMessage(err, undefined, "paper_factory.process"));
    } finally {
      setBusy(null);
    }
  }

  async function handleGenerate() {
    if (!exam.trim()) {
      toast.error("Select an exam before generating.");
      return;
    }
    setBusy("generate");
    setLastResult(null);
    try {
      const res = await scraperApi.paperFactoryGenerate({
        ...planBody(),
        publish: true,
        use_bank: true,
        include_questions: false,
      });
      setLastResult(res as unknown as Record<string, unknown>);
      toast.success(
        res.complete
          ? `Generated ${res.question_count ?? 0} questions.`
          : "Generate finished incomplete — check quality_score.",
      );
    } catch (err) {
      toast.error(toAdminUserMessage(err, undefined, "paper_factory.generate"));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Paper factory"
        description="Plan a blueprint, process a queued generation job, or run a short lab generate against FastAPI."
        icon={<Factory className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      {!configured ? (
        <Card>
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Scraper URL is not configured</p>
              <p className="text-xs text-muted-foreground mt-1">
                Set <code className="text-[11px]">VITE_SCRAPER_URL</code> to the FastAPI service.
                Admin calls use your JWT; HMAC stays on Edge.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="space-y-4 py-4">
              <p className="text-sm font-medium">Plan blueprint</p>
              <p className="text-xs text-muted-foreground">
                Builds section quotas without calling Gemini. Preferred next step is Process job
                on a durable <code className="text-[11px]">gov_paper_generation_jobs</code> row.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Exam</p>
                  <Select
                    value={exam}
                    onValueChange={setExam}
                    disabled={loadingExams || exams.length === 0}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder={loadingExams ? "Loading exams…" : "Select exam"} />
                    </SelectTrigger>
                    <SelectContent>
                      {exams.map((row) => {
                        const value = examQuery(row);
                        return (
                          <SelectItem key={value || String(row.id)} value={value}>
                            {examLabel(row)}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Stage (optional)"
                  value={stage}
                  onChange={(e) => setStage(e.target.value)}
                  placeholder="Prelims / Mains / …"
                />
                <div>
                  <p className="text-xs text-muted-foreground mb-1">Mode</p>
                  <Select value={mode} onValueChange={(v) => setMode(v as PaperFactoryMode)}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAPER_FACTORY_MODES.map((item) => (
                        <SelectItem key={item} value={item}>{item}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Input
                  label="Language"
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  placeholder="en"
                />
                <Input
                  label="Question count"
                  type="number"
                  min={5}
                  max={100}
                  value={questionCount}
                  onChange={(e) => setQuestionCount(Number(e.target.value) || 25)}
                  hint="Lab generate defaults to 25. Full 100-item runs belong on the job table."
                />
              </div>
              {selectedExam?.id ? (
                <p className="text-[11px] text-muted-foreground">Registry id: {String(selectedExam.id)}</p>
              ) : null}
              <Button onClick={() => void handlePlan()} disabled={busy !== null || !exam}>
                {busy === "plan" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Plan (no AI)
              </Button>
              {plan ? (
                <pre className="text-[11px] overflow-x-auto max-h-64 p-2 rounded-lg bg-muted/20 whitespace-pre-wrap break-all">
                  {JSON.stringify(plan, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-4">
              <p className="text-sm font-medium">Process queued job</p>
              <p className="text-xs text-muted-foreground">
                Same engine as the embedded paper-factory worker. Use this for durable generation.
              </p>
              <Input
                label="Job id"
                value={jobId}
                onChange={(e) => setJobId(e.target.value)}
                placeholder="gov_paper_generation_jobs uuid"
              />
              <Button
                onClick={() => void handleProcessJob()}
                disabled={busy !== null || !jobId.trim()}
              >
                {busy === "process" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Process job
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="space-y-4 py-4">
              <p className="text-sm font-medium">Lab generate</p>
              <p className="text-xs text-muted-foreground">
                Synchronous HTTP generate (90s timeout). Do not use this for 100-question AI papers.
                Prefer Process job.
              </p>
              <Button
                variant="outline"
                onClick={() => void handleGenerate()}
                disabled={busy !== null || !exam}
              >
                {busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                Generate {questionCount} questions
              </Button>
              {lastResult ? (
                <pre className="text-[11px] overflow-x-auto max-h-48 p-2 rounded-lg bg-muted/20 whitespace-pre-wrap break-all">
                  {JSON.stringify(lastResult, null, 2)}
                </pre>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
