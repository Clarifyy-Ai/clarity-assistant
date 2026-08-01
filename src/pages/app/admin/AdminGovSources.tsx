import { useEffect, useState } from "react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/Badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Link2, Loader2, Plus } from "lucide-react";
import { AdminGovDisclaimer } from "./AdminGovDisclaimer";
import {
  DOCUMENT_TYPES,
  LICENSE_CLASSES,
  SOURCE_REVIEW_STATES,
  listOfficialSources,
  listGovExamsAdmin,
  listRecruitingBodies,
  registerOfficialSource,
  setSourceReviewState,
  type OfficialSourceRow,
  type SourceReviewState,
} from "@/lib/gov-exam/adminOps";

function reviewBadgeVariant(state: string): "gray" | "amber" | "emerald" | "red" | "blue" {
  if (state === "approved") return "emerald";
  if (state === "retired" || state === "rejected") return "red";
  if (state === "in_review") return "amber";
  if (state === "draft") return "gray";
  return "blue";
}

export default function AdminGovSources() {
  const [rows, setRows] = useState<OfficialSourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [reviewFilter, setReviewFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");

  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [documentType, setDocumentType] = useState<string>("notification");
  const [licenseClass, setLicenseClass] = useState<string>("official_public");
  const [examId, setExamId] = useState<string>("");
  const [bodyId, setBodyId] = useState<string>("");
  const [exams, setExams] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [bodies, setBodies] = useState<Array<{ id: string; code: string; name: string }>>([]);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    const { data, error } = await listOfficialSources({
      reviewState: reviewFilter,
      documentType: typeFilter,
    });
    if (error) toast.error(error);
    setRows(data);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, [reviewFilter, typeFilter]);

  useEffect(() => {
    void (async () => {
      const [e, b] = await Promise.all([listGovExamsAdmin({}), listRecruitingBodies()]);
      if (!e.error) {
        setExams(e.data.map((x) => ({ id: x.id, code: x.code, name: x.name })));
      }
      if (!b.error) {
        setBodies(
          (b.data as Array<{ id: string; code: string; name: string }>).map((x) => ({
            id: x.id,
            code: x.code,
            name: x.name,
          })),
        );
      }
    })();
  }, []);

  async function handleRegister() {
    if (title.trim().length < 3) {
      toast.error("Title must be at least 3 characters");
      return;
    }
    if (!url.trim().startsWith("http")) {
      toast.error("Provide a valid official URL (https://…)");
      return;
    }
    setSaving(true);
    const { error } = await registerOfficialSource({
      title,
      source_url: url,
      document_type: documentType,
      license_class: licenseClass,
      exam_id: examId || null,
      recruiting_body_id: bodyId || null,
    });
    setSaving(false);
    if (error) {
      toast.error(error);
      return;
    }
    toast.success("Source registered (draft)");
    setTitle("");
    setUrl("");
    void load();
  }

  async function setState(row: OfficialSourceRow, next: SourceReviewState) {
    setBusyId(row.id);
    const { error } = await setSourceReviewState(row.id, next, row.review_state);
    setBusyId(null);
    if (error) toast.error(error);
    else {
      toast.success(`Marked ${next}`);
      void load();
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      <PageHeader
        title="Official sources"
        description="Register and review official exam links (metadata only — no scraping)."
        icon={<Link2 className="w-5 h-5 text-red-400" />}
      />
      <AdminGovDisclaimer />

      <Card>
        <CardContent className="p-4 space-y-3">
          <h3 className="text-sm font-semibold">Register source link</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Input
              placeholder="Title (e.g. SSC CGL 2025 Notification)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Input
              placeholder="https://… official URL"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <Select value={documentType} onValueChange={setDocumentType}>
              <SelectTrigger><SelectValue placeholder="Document type" /></SelectTrigger>
              <SelectContent>
                {DOCUMENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={licenseClass} onValueChange={setLicenseClass}>
              <SelectTrigger><SelectValue placeholder="License" /></SelectTrigger>
              <SelectContent>
                {LICENSE_CLASSES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={bodyId || "none"} onValueChange={(v) => setBodyId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Recruiting body" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No body</SelectItem>
                {bodies.map((b) => (
                  <SelectItem key={b.id} value={b.id}>{b.code} — {b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={examId || "none"} onValueChange={(v) => setExamId(v === "none" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Exam (optional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No exam</SelectItem>
                {exams.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.code} — {e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            onClick={() => void handleRegister()}
            disabled={saving}
            leftIcon={saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          >
            Register draft source
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2">
        <Select value={reviewFilter} onValueChange={setReviewFilter}>
          <SelectTrigger className="w-[160px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All states</SelectItem>
            {SOURCE_REVIEW_STATES.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[180px] h-8 text-sm"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {DOCUMENT_TYPES.map((t) => (
              <SelectItem key={t} value={t}>{t}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden" padding="none">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Title</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>License</TableHead>
              <TableHead>State</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">Loading…</TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">
                  No sources visible. Apply admin RLS migration if drafts are missing.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-xs">
                    <p className="font-medium text-sm line-clamp-2">{row.title}</p>
                    {row.source_url && (
                      <a
                        href={row.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-primary hover:underline break-all"
                      >
                        {row.source_url}
                      </a>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.document_type}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{row.license_class}</TableCell>
                  <TableCell>
                    <Badge variant={reviewBadgeVariant(row.review_state)} size="sm">
                      {row.review_state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right space-x-1">
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
                    {row.review_state !== "rejected" && row.review_state !== "approved" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busyId === row.id}
                        onClick={() => void setState(row, "rejected")}
                      >
                        Reject
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}
