import { Fragment, useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { FileStack, Loader2 } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  PAPER_REVIEW_STATES,
  listGeneratedPapers,
  setPaperReviewState,
  summarizeBlueprint,
  type GeneratedPaperRow,
  type PaperReviewState,
} from "@/lib/gov-exam/adminOps";

function stateBadge(state: string) {
  if (state === "approved" || state === "expert_reviewed") return "emerald" as const;
  if (state === "rejected" || state === "retired") return "red" as const;
  if (state === "needs_review") return "amber" as const;
  if (state === "machine_validated") return "blue" as const;
  return "gray" as const;
}

export default function AdminGovPaperReview() {
  const [rows, setRows] = useState<GeneratedPaperRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data, error } = await listGeneratedPapers({ reviewState: reviewFilter });
    if (error) toast.error(error);
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [reviewFilter]);

  async function setState(row: GeneratedPaperRow, next: PaperReviewState) {
    setBusyId(row.id);
    const { error } = await setPaperReviewState(row.id, next, row.review_state);
    setBusyId(null);
    if (error) toast.error(error);
    else {
      toast.success(`Paper → ${next}`);
      void load();
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Generated paper review"
        description="Review AI-assembled papers, blueprint summaries, and review_state."
        icon={<FileStack className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Select value={reviewFilter} onValueChange={setReviewFilter}>
        <SelectTrigger className="w-[200px] h-8 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All states</SelectItem>
          {PAPER_REVIEW_STATES.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Card className="overflow-hidden" padding="none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Paper</TableHead>
              <TableHead>Exam</TableHead>
              <TableHead>Blueprint</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  <Loader2 className="w-4 h-4 inline animate-spin mr-2" /> Loading…
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No generated papers yet (or RLS is hiding non-owned drafts).
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    className="cursor-pointer"
                    onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                  >
                    <TableCell className="max-w-xs">
                      <p className="text-sm font-medium line-clamp-2">{row.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {row.paper_class} · {row.question_count}Q · {row.total_marks} marks ·{" "}
                        {row.duration_minutes}m
                        {row.quality_score != null ? ` · q=${row.quality_score}` : ""}
                      </p>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {row.gov_exams?.code ?? row.exam_id.slice(0, 8)}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {summarizeBlueprint(row.blueprint_json)}
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
                          onClick={() => void setState(row, "approved")}
                        >
                          Approve
                        </Button>
                      )}
                      {row.review_state !== "needs_review" &&
                        row.review_state !== "approved" && (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busyId === row.id}
                            onClick={() => void setState(row, "needs_review")}
                          >
                            Needs review
                          </Button>
                        )}
                      {row.review_state !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          onClick={() => void setState(row, "rejected")}
                        >
                          Reject
                        </Button>
                      )}
                      {row.review_state !== "retired" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busyId === row.id}
                          onClick={() => void setState(row, "retired")}
                        >
                          Retire
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                  {expanded === row.id && (
                    <TableRow>
                      <TableCell colSpan={5} className="bg-muted/20">
                        <pre className="text-[11px] overflow-x-auto max-h-48 p-2 whitespace-pre-wrap break-all">
                          {JSON.stringify(row.blueprint_json ?? {}, null, 2)}
                        </pre>
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
