// @ts-nocheck
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase/client";
import { questionsDB } from "@/lib/supabase/database";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Database, Upload, RefreshCw, Sparkles, FileText, Loader2, CheckCircle2, Server, Play, Pause, Square } from "lucide-react";
import ExcelImportTab from "@/pages/app/mock-test/ExcelImportTab";
import { cn } from "@/lib/utils";
import { unwrapEdgePayload } from "@/lib/network/edgeResult";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { normalizeExamTypeForStorage } from "@/lib/mock-test/examTypes";
import { scraperApi, ScraperNotConfiguredError } from "@/lib/scraper/client";
import { useScrapeJob } from "@/hooks/useScrapeJob";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;

interface BankStat {
  exam_type: string;
  total: number;
  verified: number;
  ai_generated: number;
  years: string[];
  subjects: string[];
}

const TARGET_EXAMS = ["JEE_MAIN", "JEE_ADVANCED", "NEET", "UPSC", "SSC_CGL", "IBPS_PO", "NDA"];

export default function AdminSeedQuestions() {
  const user = useAuthStore((s) => s.user);
  const [stats, setStats] = useState<BankStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);

  // PDF Upload States
  const fileRef = useRef<HTMLInputElement>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [examType, setExamType] = useState<string>("JEE_MAIN");
  const [sourceYear, setSourceYear] = useState<string>(new Date().getFullYear().toString());
  const [parsingPdf, setParsingPdf] = useState(false);

  useEffect(() => { void loadStats(); }, []);

  async function loadStats() {
    setLoading(true);
    try {
      const data = await questionsDB.list({
        columns: "exam_type, source, is_verified, subject, source_year",
      });

      const map: Record<string, BankStat> = {};
      for (const q of data) {
        const et = q.exam_type ?? "CUSTOM";
        if (!map[et]) map[et] = { exam_type: et, total: 0, verified: 0, ai_generated: 0, years: [], subjects: [] };
        map[et].total++;
        if (q.is_verified) map[et].verified++;
        if (q.source === "AI_GENERATED") map[et].ai_generated++;
        if (q.source_year && !map[et].years.includes(String(q.source_year))) map[et].years.push(String(q.source_year));
        if (q.subject && !map[et].subjects.includes(q.subject)) map[et].subjects.push(q.subject);
      }
      setStats(Object.values(map).sort((a, b) => b.total - a.total));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load stats");
    } finally {
      setLoading(false);
    }
  }

  // Phase 1 & 2: AI-Assisted Official PDF Processing
  async function handleProcessPDF() {
    if (!pdfFile) return toast.error("Please select a PDF file first.");
    if (!user?.id) return;

    setParsingPdf(true);
    try {
      const formData = new FormData();
      formData.append("pdf", pdfFile);
      formData.append("exam_type", examType);
      formData.append("source_year", sourceYear);

      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token ?? "";

      toast.info("Sending paper to AI for extraction. This takes ~30-60 seconds.");

      // Sends to edge function for Claude/Gemini parsing
      const response = await fetch(`${SUPABASE_URL}/functions/v1/parse-question-pdf`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error ?? "Failed to process PDF via AI."
        );
      }
      const json = await response.json();
      const inner = unwrapEdgePayload<{ questions?: unknown[] }>(json);
      const questions = Array.isArray(inner.questions) ? inner.questions : [];

      if (questions.length === 0) throw new Error("No questions extracted.");

      // Phase 2: Bulk-save verified questions as OFFICIAL_PYP
      const storageExamType = normalizeExamTypeForStorage(examType) ?? examType;
      const rowsToInsert = questions.map((q: any) => ({
        ...q,
        exam_type: storageExamType,
        source_year: Number(sourceYear),
        source: "OFFICIAL_PYP",
        is_verified: true,    // Admin uploads are verified by default
        is_public: true,      // Added to global public bank
        uploaded_by: user.id
      }));

      await questionsDB.createMany(rowsToInsert);

      toast.success(`Successfully extracted and verified ${questions.length} questions!`);
      setPdfFile(null);
      if (fileRef.current) fileRef.current.value = "";
      void loadStats();

    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Failed to parse PDF.");
    } finally {
      setParsingPdf(false);
    }
  }

  // AI gap-fill is disabled by policy — admins must scrape papers via collect-exam-papers.
  function triggerGapFill(exam: string) {
    toast.error(
      `AI gap-fill is disabled. Use "Collect from public sources" or upload PDFs to add more ${exam} questions.`,
    );
  }

  async function collectPublicPapers() {
    setCollecting(true);
    const toastId = toast.loading(`Collecting public papers for ${examType}…`);
    try {
      const res = await fetchEdgeJson<{
        imported?: number;
        pdfs_found?: number;
        message?: string;
        errors?: string[];
      }>("collect-exam-papers", {
        exam_type: examType,
        year: Number(sourceYear),
      });
      const imported = res.imported ?? 0;
      if (imported > 0) {
        toast.success(`Imported ${imported} questions from ${res.pdfs_found ?? 0} PDF(s).`, { id: toastId });
      } else {
        toast.warning(res.message ?? "No questions imported. Try a custom listing URL.", { id: toastId });
      }
      if (res.errors?.length) console.warn("[collect-exam-papers]", res.errors);
      void loadStats();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Collection failed", { id: toastId });
    } finally {
      setCollecting(false);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl pb-20">
      <PageHeader title="Seed Question Bank" description="Automated pipeline for building the public previous-year exam database." />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Phase 1 & 2: Official Paper AI Pipeline */}
        <Card className="border-violet-500/30 bg-violet-500/5 shadow-sm">
          <CardContent className="p-6 space-y-5">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-violet-500" />
              <h3 className="font-bold text-foreground text-lg">AI Paper Extraction Pipeline</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Upload official NTA/UPSC PDFs. AI will extract equations, options, and answers, then save them directly to the public bank.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase">Target Exam</label>
                <Select value={examType} onValueChange={setExamType}>
                  <SelectTrigger className="bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_EXAMS.map(e => <SelectItem key={e} value={e}>{e.replace('_', ' ')}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase">Source Year</label>
                <Input type="number" value={sourceYear} onChange={e => setSourceYear(e.target.value)} className="bg-background" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-foreground uppercase">Official Paper PDF</label>
              <div className="flex items-center gap-3">
                <Input 
                  type="file" 
                  accept="application/pdf" 
                  ref={fileRef}
                  onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  className="bg-background cursor-pointer"
                />
                <Button onClick={handleProcessPDF} disabled={!pdfFile || parsingPdf} className="shrink-0 bg-violet-600 hover:bg-violet-700 text-white">
                  {parsingPdf ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sparkles className="w-4 h-4 mr-2" />}
                  {parsingPdf ? "Parsing..." : "Extract & Save"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Public source collector (allowlisted official portals) */}
        <Card className="border-emerald-500/30 bg-emerald-500/5 shadow-sm lg:col-span-2">
          <CardContent className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-500" />
              <h3 className="font-bold text-foreground text-lg">Collect from Public Sources</h3>
            </div>
            <p className="text-sm text-muted-foreground">
              Admin-only scraper for allowlisted official portals (NTA, UPSC, SSC). Respects domain allowlist —
              does not crawl arbitrary sites. Uses the Target Exam and Source Year above.
            </p>
            <Button
              onClick={() => void collectPublicPapers()}
              disabled={collecting}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {collecting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 mr-2" />
              )}
              {collecting ? "Collecting…" : "Collect public papers"}
            </Button>
          </CardContent>
        </Card>

        {/* Standard Excel Import */}
        <Card className="shadow-sm">
          <CardContent className="p-6 space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <Upload className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-foreground text-lg">Bulk Excel Import</h3>
            </div>
            <ExcelImportTab onImported={() => void loadStats()} />
          </CardContent>
        </Card>
      </div>

      {/* Question Bank Status Dashboard */}
      <Card className="shadow-sm">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Database className="h-6 w-6 text-blue-500" />
              <h3 className="font-bold text-foreground text-lg">Question Bank Status Dashboard</h3>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadStats()} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-2", loading && "animate-spin")} /> Refresh Stats
            </Button>
          </div>

          {loading ? (
            <div className="space-y-2 mt-4">
              {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-muted/20 animate-pulse" />)}
            </div>
          ) : stats.length === 0 ? (
            <div className="text-center py-10 border border-dashed rounded-xl bg-muted/10 mt-4">
              <Database className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-50" />
              <p className="text-foreground font-medium">No questions in the global bank yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto mt-4 rounded-xl border border-border">
              <table className="w-full text-sm text-left">
                <thead className="bg-muted/50 border-b border-border">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Exam Category</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Total Qs</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Official (Verified)</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">AI Generated</th>
                    <th className="px-4 py-3 font-semibold text-muted-foreground">Coverage</th>
                    <th className="px-4 py-3 font-semibold text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {stats.map((s) => (
                    <tr key={s.exam_type} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3 font-bold text-foreground">{s.exam_type.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 font-mono font-bold text-lg">{s.total}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-green-600 dark:text-green-400 bg-green-500/10 w-fit px-2 py-0.5 rounded-md font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" /> {s.verified}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400 bg-amber-500/10 w-fit px-2 py-0.5 rounded-md font-medium">
                          <Sparkles className="w-3.5 h-3.5" /> {s.ai_generated}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground max-w-[200px] truncate" title={s.years.join(", ")}>
                        {s.years.sort().slice(-3).join(", ")} {s.years.length > 3 && `+${s.years.length - 3} more`}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button 
                          variant="outline" 
                          size="sm" 
                          className="h-8 text-xs border-violet-500/30 text-violet-600 hover:bg-violet-500/10"
                          onClick={() => triggerGapFill(s.exam_type)}
                        >
                          <Sparkles className="w-3 h-3 mr-1.5" /> Gap Fill
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
