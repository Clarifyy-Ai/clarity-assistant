import { Fragment, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  REGISTRY_REVIEW_STATES,
  listGovExamsAdmin,
  listExamStages,
  listPatternVersions,
  listSyllabusVersions,
  listGovExamBankReadiness,
  setExamReviewState,
  setPatternReviewState,
  setSyllabusReviewState,
  type GovExamRow,
  type GovExamBankReadinessRow,
  type RegistryReviewState,
} from "@/lib/gov-exam/adminOps";
import { formatBankCoverage } from "@/lib/gov-exam/bankReadiness";

const FAMILIES = [
  "ssc",
  "railways",
  "banking",
  "upsc",
  "state_psc",
  "defence",
  "teaching",
  "other",
];

function stateBadge(state: string) {
  if (state === "approved") return "emerald" as const;
  if (state === "retired") return "red" as const;
  if (state === "in_review") return "amber" as const;
  return "gray" as const;
}

type StageRow = { id: string; code: string; name: string; sort_order: number };
type PatternRow = {
  id: string;
  version: string;
  stage_id: string;
  total_questions: number;
  duration_minutes: number;
  review_state: RegistryReviewState;
};
type SyllabusRow = {
  id: string;
  version: string;
  stage_id: string;
  review_state: RegistryReviewState;
  topics_json: unknown;
};

export default function AdminGovExamRegistry() {
  const [rows, setRows] = useState<GovExamRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [familyFilter, setFamilyFilter] = useState("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [stages, setStages] = useState<StageRow[]>([]);
  const [patterns, setPatterns] = useState<PatternRow[]>([]);
  const [syllabi, setSyllabi] = useState<SyllabusRow[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [bankRows, setBankRows] = useState<GovExamBankReadinessRow[]>([]);
  const [bankLoading, setBankLoading] = useState(true);
  const [bankError, setBankError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await listGovExamsAdmin({
      reviewState: reviewFilter,
      family: familyFilter,
    });
    if (error) toast.error(error);
    setRows(data);
    setLoading(false);
  }

  async function loadBankReadiness() {
    setBankLoading(true);
    setBankError(null);
    const { data, error } = await listGovExamBankReadiness();
    if (error) {
      setBankError(error);
      setBankRows([]);
    } else {
      setBankRows(data);
    }
    setBankLoading(false);
  }

  useEffect(() => {
    void load();
  }, [reviewFilter, familyFilter]);

  useEffect(() => {
    void loadBankReadiness();
  }, []);

  async function expand(exam: GovExamRow) {
    if (expanded === exam.id) {
      setExpanded(null);
      return;
    }
    setExpanded(exam.id);
    setDetailLoading(true);
    const [s, p, sy] = await Promise.all([
      listExamStages(exam.id),
      listPatternVersions(exam.id),
      listSyllabusVersions(exam.id),
    ]);
    if (s.error || p.error || sy.error) {
      toast.error(s.error || p.error || sy.error || "Failed to load versions");
    }
    setStages(s.data as StageRow[]);
    setPatterns(p.data as PatternRow[]);
    setSyllabi(sy.data as SyllabusRow[]);
    setDetailLoading(false);
  }

  async function examAction(exam: GovExamRow, next: RegistryReviewState) {
    setBusy(exam.id);
    const { error } = await setExamReviewState(exam.id, next, exam.review_state);
    setBusy(null);
    if (error) toast.error(error);
    else {
      toast.success(`Exam ${exam.code} → ${next}`);
      void load();
    }
  }

  async function patternAction(id: string, next: RegistryReviewState, prev: RegistryReviewState) {
    setBusy(id);
    const { error } = await setPatternReviewState(id, next, prev);
    setBusy(null);
    if (error) toast.error(error);
    else if (expanded) {
      const p = await listPatternVersions(expanded);
      setPatterns(p.data as PatternRow[]);
      toast.success(`Pattern → ${next}`);
    }
  }

  async function syllabusAction(id: string, next: RegistryReviewState, prev: RegistryReviewState) {
    setBusy(id);
    const { error } = await setSyllabusReviewState(id, next, prev);
    setBusy(null);
    if (error) toast.error(error);
    else if (expanded) {
      const sy = await listSyllabusVersions(expanded);
      setSyllabi(sy.data as SyllabusRow[]);
      toast.success(`Syllabus → ${next}`);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Exam registry"
        description="Browse gov_exams, stages, pattern versions, and syllabus versions."
        icon={<BookOpen className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Bank readiness matrix</p>
              <p className="text-xs text-muted-foreground">
                Public verified questions vs approved pattern total — gates Full Simulation.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={bankLoading}
              onClick={() => void loadBankReadiness()}
            >
              {bankLoading ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
              ) : null}
              Refresh
            </Button>
          </div>
          {bankError && (
            <p className="text-xs text-amber-700 dark:text-amber-400">
              {bankError.includes("get_gov_exam_bank_readiness") ||
              bankError.toLowerCase().includes("function")
                ? "RPC missing — apply migration 20260802160000_gov_exam_bank_readiness.sql."
                : bankError}
            </p>
          )}
          <div className="overflow-x-auto rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Exam</TableHead>
                  <TableHead>Legacy type</TableHead>
                  <TableHead>Pattern</TableHead>
                  <TableHead>Coverage</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Full sim</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {bankLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground text-sm">
                      <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading bank counts…
                    </TableCell>
                  </TableRow>
                ) : bankRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-muted-foreground text-sm">
                      No readiness rows. Ensure gov exams are seeded and the readiness migration is applied.
                    </TableCell>
                  </TableRow>
                ) : (
                  bankRows.map((r) => (
                    <TableRow key={r.exam_id}>
                      <TableCell>
                        <div className="font-mono text-xs">{r.exam_code}</div>
                        <div className="text-xs text-muted-foreground">{r.exam_name}</div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate">
                        {r.legacy_exam_type ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.pattern_version ?? "—"}
                        {r.required_questions ? ` · ${r.required_questions}Q` : ""}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {formatBankCoverage(r.approved_public_count, r.required_questions)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            r.status === "ready"
                              ? "emerald"
                              : r.status === "partial"
                                ? "amber"
                                : "gray"
                          }
                          size="sm"
                        >
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs">
                        {r.full_simulation_available ? "yes" : "no"}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {REGISTRY_REVIEW_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={familyFilter} onValueChange={setFamilyFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All families</SelectItem>
            {FAMILIES.map((f) => (
              <SelectItem key={f} value={f}>{f}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden" padding="none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Family</TableHead>
              <TableHead>Body</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-muted-foreground">
                  No exams visible. Non-approved rows require the admin RLS migration.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((exam) => (
                <Fragment key={exam.id}>
                  <TableRow className="cursor-pointer" onClick={() => void expand(exam)}>
                    <TableCell>
                      {expanded === exam.id
                        ? <ChevronDown className="w-4 h-4" />
                        : <ChevronRight className="w-4 h-4" />}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{exam.code}</TableCell>
                    <TableCell className="text-sm">{exam.name}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{exam.family}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {exam.recruiting_bodies?.code ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        <Badge variant={stateBadge(exam.review_state)} size="sm">
                          {exam.review_state}
                        </Badge>
                        {exam.is_public && <Badge size="sm">public</Badge>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      {exam.review_state !== "approved" && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === exam.id}
                          onClick={() => void examAction(exam, "approved")}
                        >
                          Approve
                        </Button>
                      )}
                      {exam.review_state !== "retired" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy === exam.id}
                          onClick={() => void examAction(exam, "retired")}
                        >
                          Retire
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded === exam.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/20 p-4">
                        {detailLoading ? (
                          <p className="text-sm text-muted-foreground">Loading versions…</p>
                        ) : (
                          <div className="grid gap-4 md:grid-cols-3 text-sm">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                                Stages
                              </p>
                              {stages.length === 0 ? (
                                <p className="text-muted-foreground text-xs">None</p>
                              ) : (
                                <ul className="space-y-1">
                                  {stages.map((s) => (
                                    <li key={s.id} className="font-mono text-xs">
                                      {s.code} — {s.name}
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                                Pattern versions
                              </p>
                              {patterns.length === 0 ? (
                                <p className="text-muted-foreground text-xs">None</p>
                              ) : (
                                <ul className="space-y-2">
                                  {patterns.map((p) => (
                                    <li key={p.id} className="space-y-1">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-mono text-xs">{p.version}</span>
                                        <Badge variant={stateBadge(p.review_state)} size="sm">
                                          {p.review_state}
                                        </Badge>
                                        <span className="text-[11px] text-muted-foreground">
                                          {p.total_questions}Q · {p.duration_minutes}m
                                        </span>
                                      </div>
                                      <div className="space-x-1">
                                        {p.review_state !== "approved" && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            disabled={busy === p.id}
                                            onClick={() => void patternAction(p.id, "approved", p.review_state)}
                                          >
                                            Approve
                                          </Button>
                                        )}
                                        {p.review_state !== "retired" && (
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            disabled={busy === p.id}
                                            onClick={() => void patternAction(p.id, "retired", p.review_state)}
                                          >
                                            Retire
                                          </Button>
                                        )}
                                      </div>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                                Syllabus versions
                              </p>
                              {syllabi.length === 0 ? (
                                <p className="text-muted-foreground text-xs">None</p>
                              ) : (
                                <ul className="space-y-2">
                                  {syllabi.map((s) => {
                                    const topicCount = Array.isArray(s.topics_json)
                                      ? s.topics_json.length
                                      : 0;
                                    return (
                                      <li key={s.id} className="space-y-1">
                                        <div className="flex items-center gap-2 flex-wrap">
                                          <span className="font-mono text-xs">{s.version}</span>
                                          <Badge variant={stateBadge(s.review_state)} size="sm">
                                            {s.review_state}
                                          </Badge>
                                          <span className="text-[11px] text-muted-foreground">
                                            {topicCount} topics
                                          </span>
                                        </div>
                                        <div className="space-x-1">
                                          {s.review_state !== "approved" && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              disabled={busy === s.id}
                                              onClick={() => void syllabusAction(s.id, "approved", s.review_state)}
                                            >
                                              Approve
                                            </Button>
                                          )}
                                          {s.review_state !== "retired" && (
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              disabled={busy === s.id}
                                              onClick={() => void syllabusAction(s.id, "retired", s.review_state)}
                                            >
                                              Retire
                                            </Button>
                                          )}
                                        </div>
                                      </li>
                                    );
                                  })}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}
                        {exam.description && (
                          <Card className="mt-3">
                            <CardContent className="p-3 text-xs text-muted-foreground">
                              {exam.description}
                            </CardContent>
                          </Card>
                        )}
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
