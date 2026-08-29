import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  CheckCircle2, ListChecks, Loader2, Ban, Archive, Languages, EyeOff,
} from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import { QUESTION_EXAM_TYPE_OPTIONS } from "@/lib/mock-test/examTypes";
import { TRANSLATION_LANGUAGES } from "@/lib/gov-exam/questionTranslations";
import {
  applyQuestionVerifyAction,
  bulkApplyQuestionVerifyAction,
  bulkRequestQuestionTranslation,
  deriveQuestionQueueStatus,
  listQuestionsForReview,
  listVerificationRunway,
  setQuestionReviewStatus,
  type QuestionQueueStatus,
  type QuestionReviewFilterStatus,
  type QuestionReviewRow,
  type VerificationRunwayRow,
} from "@/lib/gov-exam/adminOps";

const STATUS_OPTIONS: Array<QuestionReviewFilterStatus> = [
  "public_unverified",
  "all",
  "pending",
  "approved",
  "rejected",
  "retired",
];

function statusBadge(status: QuestionQueueStatus) {
  if (status === "approved") return "emerald" as const;
  if (status === "pending") return "amber" as const;
  if (status === "rejected") return "red" as const;
  return "gray" as const;
}

function runwayBadge(status: string) {
  if (status === "ready") return "emerald" as const;
  if (status === "partial") return "amber" as const;
  return "red" as const;
}

export default function AdminGovQuestionReview() {
  const [rows, setRows] = useState<QuestionReviewRow[]>([]);
  const [runway, setRunway] = useState<VerificationRunwayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [examType, setExamType] = useState("all");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<QuestionReviewFilterStatus>("public_unverified");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [translationLang, setTranslationLang] = useState("hi");
  const [bulkConfirm, setBulkConfirm] = useState<{
    title: string;
    description: string;
    variant: "default" | "destructive" | "info";
    run: () => Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>;
  } | null>(null);

  async function load() {
    setLoading(true);
    setLoadError(null);
    const [qRes, rRes] = await Promise.all([
      listQuestionsForReview({ examType, topic, status }),
      listVerificationRunway(),
    ]);
    if (qRes.error) {
      setLoadError(qRes.error);
      toast.error(qRes.error);
      setRows([]);
    } else {
      setRows(qRes.data);
    }
    if (rRes.error) toast.error(rRes.error);
    setRunway(rRes.data);
    setSelected(new Set());
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [examType, status]);

  const rowsById = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows]);

  const matchingRunway = useMemo(() => {
    if (examType === "all") return runway;
    return runway.filter((r) => r.legacy_exam_type === examType);
  }, [runway, examType]);

  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  function toggleAll(checked: boolean) {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(rows.map((r) => r.id)));
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function act(row: QuestionReviewRow, next: "approved" | "rejected" | "retired") {
    setBusyId(row.id);
    const { error } = await setQuestionReviewStatus(row.id, next, {
      is_verified: row.is_verified,
      is_public: row.is_public,
      metadata: row.metadata,
    });
    setBusyId(null);
    if (error) toast.error(error);
    else {
      toast.success(`Question ${next}`);
      void load();
    }
  }

  async function verifyOne(row: QuestionReviewRow) {
    setBusyId(row.id);
    const { error } = await applyQuestionVerifyAction(row.id, "verify", row);
    setBusyId(null);
    if (error) toast.error(error);
    else {
      toast.success("Question verified");
      void load();
    }
  }

  function confirmBulk(
    label: string,
    run: () => Promise<{ ok: number; failed: Array<{ id: string; error: string }> }>,
    variant: "default" | "destructive" | "info" = "default",
  ) {
    const ids = [...selected];
    if (ids.length === 0) {
      toast.error("Select at least one question");
      return;
    }
    setBulkConfirm({
      title: `${label} ${ids.length} selected question(s)?`,
      description: "This is an explicit admin action — questions are not auto-verified.",
      variant,
      run,
    });
  }

  async function runBulkConfirm() {
    if (!bulkConfirm) return;
    const run = bulkConfirm.run;
    setBulkBusy(true);
    const result = await run();
    setBulkBusy(false);
    setBulkConfirm(null);
    if (result.failed.length) {
      toast.error(`${result.ok} ok, ${result.failed.length} failed`);
    } else {
      toast.success(`Complete (${result.ok})`);
    }
    void load();
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Question review queue"
        description="Certify packs by verifying existing public questions. Filter public+unverified, then verify / unpublish / request translation — never invents copyrighted content."
        icon={<ListChecks className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h2 className="text-sm font-medium">Verification runway</h2>
            <p className="text-[11px] text-muted-foreground">
              verifies_needed = pattern total − public verified (via bank readiness RPC)
            </p>
          </div>
          {matchingRunway.length === 0 ? (
            <p className="text-xs text-muted-foreground">No readiness rows loaded.</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {matchingRunway.map((r) => (
                <div
                  key={`${r.exam_id}-${r.stage_id ?? "x"}`}
                  className="rounded-lg border border-border/60 px-3 py-2 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{r.exam_code}</span>
                    <Badge variant={runwayBadge(r.status)} size="sm">{r.status}</Badge>
                  </div>
                  <p className="text-muted-foreground">
                    verified {r.approved_public_count}/{r.required_questions}
                    {" · "}
                    public {r.public_count}
                    {" · "}
                    unverified {r.unverified_public_count}
                  </p>
                  <p>
                    Need{" "}
                    <span className="font-semibold text-foreground">{r.verifies_needed}</span>
                    {" "}more verifies for ready
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-end">
          <Select value={examType} onValueChange={setExamType}>
            <SelectTrigger className="w-[200px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All exam types</SelectItem>
              {QUESTION_EXAM_TYPE_OPTIONS.map((e) => (
                <SelectItem key={e} value={e}>{e}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as QuestionReviewFilterStatus)}
          >
            <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((s) => (
                <SelectItem key={s} value={s}>
                  {s === "public_unverified" ? "public + unverified" : s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="sm:w-48 h-8"
            placeholder="Topic contains…"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            fullWidth={false}
          />
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Apply
          </Button>
          <Link
            to="/app/admin/questions"
            className="text-xs text-primary hover:underline ml-auto"
          >
            Full question editor →
          </Link>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card>
          <CardContent className="p-3 flex flex-wrap gap-2 items-center">
            <span className="text-xs text-muted-foreground mr-1">
              {selected.size} selected
            </span>
            <Button
              size="sm"
              disabled={bulkBusy}
              leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
              onClick={() =>
                void confirmBulk("Verify", () =>
                  bulkApplyQuestionVerifyAction([...selected], "verify", rowsById),
                )
              }
            >
              Verify
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              leftIcon={<EyeOff className="w-3.5 h-3.5" />}
              onClick={() =>
                confirmBulk(
                  "Unpublish",
                  () => bulkApplyQuestionVerifyAction([...selected], "unpublish", rowsById),
                  "destructive",
                )
              }
            >
              Unpublish
            </Button>
            <Select value={translationLang} onValueChange={setTranslationLang}>
              <SelectTrigger className="w-[120px] h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSLATION_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              variant="outline"
              disabled={bulkBusy}
              leftIcon={<Languages className="w-3.5 h-3.5" />}
              onClick={() =>
                void confirmBulk(`Request ${translationLang} translation for`, () =>
                  bulkRequestQuestionTranslation([...selected], translationLang, rowsById),
                )
              }
            >
              Request translation
            </Button>
            {bulkBusy && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
          </CardContent>
        </Card>
      )}

      {loadError && (
        <InlineErrorRetry message={loadError} onRetry={() => void load()} />
      )}

      {!loading && !loadError && rows.length === 0 && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">No questions match these filters.</p>
            <p>
              If you expected OCR output, confirm the PDF ingest finished and that source
              metadata is present, then switch status to <span className="font-mono">pending</span>.
              Missing sources show as empty here — not as a failed request.
            </p>
          </CardContent>
        </Card>
      )}

      <Card className="overflow-hidden" padding="none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Select all"
                />
              </TableHead>
              <TableHead>Question</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Topic</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="text-muted-foreground">
                  No questions match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => {
                const qs = deriveQuestionQueueStatus(row);
                const isPublicUnverified = row.is_public === true && row.is_verified !== true;
                return (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleOne(row.id, v === true)}
                        aria-label={`Select question ${row.id}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm line-clamp-2">{row.question_text}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {row.subject}
                        {row.difficulty ? ` · ${row.difficulty}` : ""}
                        {row.source ? ` · ${row.source}` : ""}
                        {row.is_public ? " · public" : " · private"}
                        {row.is_verified ? " · verified" : " · unverified"}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.exam_type ?? "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.topic}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadge(qs)} size="sm">{qs}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {isPublicUnverified && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => void verifyOne(row)}
                        >
                          Verify
                        </Button>
                      )}
                      {qs !== "approved" && !isPublicUnverified && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busyId === row.id}
                          leftIcon={<CheckCircle2 className="w-3.5 h-3.5" />}
                          onClick={() => void act(row, "approved")}
                        >
                          Approve
                        </Button>
                      )}
                      {qs !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          leftIcon={<Ban className="w-3.5 h-3.5" />}
                          onClick={() => void act(row, "rejected")}
                        >
                          Reject
                        </Button>
                      )}
                      {qs !== "retired" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          leftIcon={<Archive className="w-3.5 h-3.5" />}
                          onClick={() => void act(row, "retired")}
                        >
                          Retire
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </Card>

      <ConfirmDialog
        open={bulkConfirm !== null}
        onOpenChange={(open) => {
          if (!open && !bulkBusy) setBulkConfirm(null);
        }}
        title={bulkConfirm?.title ?? "Confirm action"}
        description={bulkConfirm?.description}
        confirmLabel="Confirm"
        variant={bulkConfirm?.variant ?? "default"}
        isLoading={bulkBusy}
        onConfirm={() => void runBulkConfirm()}
      />
    </div>
  );
}
