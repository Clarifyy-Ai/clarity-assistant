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
import { CheckCircle2, Languages, Loader2, Ban } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import { TRANSLATION_LANGUAGES } from "@/lib/gov-exam/questionTranslations";
import {
  TRANSLATION_REVIEW_STATES,
  approveTranslation,
  listTranslationsForReview,
  rejectTranslation,
  type QuestionTranslationRow,
  type TranslationReviewState,
} from "@/lib/gov-exam/adminOps";

function stateBadge(state: string) {
  if (state === "approved") return "emerald" as const;
  if (state === "rejected") return "red" as const;
  if (state === "needs_review") return "amber" as const;
  return "gray" as const;
}

function formatOptions(options: unknown): string {
  if (!options) return "—";
  if (Array.isArray(options)) {
    return options
      .map((o, i) => {
        if (typeof o === "string") return `${String.fromCharCode(65 + i)}. ${o}`;
        if (o && typeof o === "object") {
          const row = o as { label?: string; text?: string };
          return `${row.label ?? String.fromCharCode(65 + i)}. ${row.text ?? JSON.stringify(o)}`;
        }
        return String(o);
      })
      .join("\n");
  }
  return JSON.stringify(options, null, 2);
}

export default function AdminGovTranslationReview() {
  const [rows, setRows] = useState<QuestionTranslationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [language, setLanguage] = useState("hi");
  const [status, setStatus] = useState<TranslationReviewState | "all">("needs_review");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await listTranslationsForReview({
      language,
      reviewState: status,
    });
    if (error) toast.error(error);
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [language, status]);

  async function act(row: QuestionTranslationRow, next: "approved" | "rejected") {
    setBusyId(row.id);
    const { error } =
      next === "approved"
        ? await approveTranslation(row.id, row.review_state)
        : await rejectTranslation(row.id, row.review_state);
    setBusyId(null);
    if (error) toast.error(error);
    else {
      toast.success(`Translation ${next}`);
      void load();
    }
  }

  return (
    <div className="space-y-6 max-w-6xl min-w-0">
      <PageHeader
        title="Translation review"
        description="Human review for Hindi and other regional translations. Only approved rows surface in mock tests. Not a certified language pack."
        icon={<Languages className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Card>
        <CardContent className="p-4 flex flex-wrap gap-2 items-end">
          <Select value={language} onValueChange={setLanguage}>
            <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All languages</SelectItem>
              {TRANSLATION_LANGUAGES.map((l) => (
                <SelectItem key={l.code} value={l.code}>
                  {l.label} ({l.code})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={status}
            onValueChange={(v) => setStatus(v as TranslationReviewState | "all")}
          >
            <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All states</SelectItem>
              {TRANSLATION_REVIEW_STATES.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </CardContent>
      </Card>

      <Card className="overflow-hidden min-w-0" padding="none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Language</TableHead>
              <TableHead>Preview</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-muted-foreground">
                  No translations match these filters.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() =>
                      setExpanded((prev) => (prev === row.id ? null : row.id))
                    }
                  >
                    <TableCell className="text-xs font-medium uppercase">
                      {row.language}
                    </TableCell>
                    <TableCell className="max-w-md">
                      <p className="text-sm line-clamp-2">{row.question_text}</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {row.questions?.exam_type ?? "—"}
                        {row.questions?.topic ? ` · ${row.questions.topic}` : ""}
                        {row.source_version ? ` · src ${row.source_version}` : ""}
                      </p>
                    </TableCell>
                    <TableCell>
                      <Badge variant={stateBadge(row.review_state)} size="sm">
                        {row.review_state}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1" onClick={(e) => e.stopPropagation()}>
                      {row.review_state !== "approved" && (
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
                      {row.review_state !== "rejected" && (
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
                    </TableCell>
                  </TableRow>
                  {expanded === row.id && (
                    <TableRow>
                      <TableCell colSpan={4} className="bg-muted/20">
                        <div className="grid gap-4 md:grid-cols-2 py-2">
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              English (source)
                            </p>
                            <p className="text-sm whitespace-pre-wrap">
                              {row.questions?.question_text ?? "—"}
                            </p>
                            <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                              {formatOptions(row.questions?.options)}
                            </pre>
                            {row.questions?.explanation && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Expl: {row.questions.explanation}
                              </p>
                            )}
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                              {row.language.toUpperCase()} (translation)
                            </p>
                            <p className="text-sm whitespace-pre-wrap">{row.question_text}</p>
                            <pre className="mt-2 text-xs text-muted-foreground whitespace-pre-wrap font-sans">
                              {formatOptions(row.options)}
                            </pre>
                            {row.explanation && (
                              <p className="mt-2 text-xs text-muted-foreground">
                                Expl: {row.explanation}
                              </p>
                            )}
                          </div>
                        </div>
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
