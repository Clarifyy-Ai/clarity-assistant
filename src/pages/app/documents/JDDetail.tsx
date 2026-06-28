// @ts-nocheck
import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  FileText, Trash2, Building2, MapPin, DollarSign,
  CheckCircle, Clock, Edit, Save, X, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { jobDescriptionsDB } from "@/lib/supabase/database";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { companyProfilePath } from "@/lib/company/slug";

// ─── Matches actual `job_descriptions` table schema ───────────────────────────
interface JobDescription {
  id: string;
  user_id: string;
  title: string;
  target_role: string;
  company: string | null;
  content: string;
  url: string | null;
  input_method: string;
  is_active: boolean;
  parse_status: string;
  parsed_data: {
    required_skills?: string[];
    key_phrases?: string[];
    location?: string;
    salary_range?: string;
  } | null;
  parse_error: string | null;
  created_at: string;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function JDDetail() {
  const { id }      = useParams<{ id: string }>();
  const navigate    = useNavigate();
  const { user }    = useAuthStore();

  const [jd,          setJd]          = useState<JobDescription | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState<string | null>(null);
  const [editing,     setEditing]     = useState(false);
  const [editRole,    setEditRole]    = useState("");
  const [editCompany, setEditCompany] = useState("");
  const [savingEdit,  setSavingEdit]  = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const loadJd = useCallback(async () => {
    if (!id || !user?.id) return;
    setLoading(true);
    setFetchError(null);
    const { data, error } = await supabase
      .from("job_descriptions")
      .select("*")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      setFetchError(error.message);
      setJd(null);
    } else {
      setJd(data as JobDescription | null);
      setEditRole(data?.target_role ?? data?.title ?? "");
      setEditCompany(data?.company ?? "");
    }
    setLoading(false);
  }, [id, user?.id]);

  useEffect(() => {
    void loadJd();
  }, [loadJd]);

  async function handleSaveEdit() {
    if (!id || !user?.id) return;
    setSavingEdit(true);
    try {
      const { error } = await supabase
        .from("job_descriptions")
        .update({ target_role: editRole, title: editRole, company: editCompany })
        .eq("id", id)
        .eq("user_id", user.id);
      if (error) throw error;
      setJd((prev) =>
        prev ? { ...prev, target_role: editRole, title: editRole, company: editCompany } : prev
      );
      setEditing(false);
      toast.success("Job description updated");
    } catch {
      toast.error("Failed to update");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete() {
    if (!id || !user?.id) return;
    setDeleting(true);
    try {
      await jobDescriptionsDB.delete(id, user.id);
      toast.success("Job description deleted");
      navigate("/app/documents");
    } catch {
      toast.error("Failed to delete job description. Please try again.");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  if (fetchError) {
    return (
      <div className="space-y-4">
        <InlineErrorRetry message={fetchError} onRetry={() => void loadJd()} />
        <Link to="/app/documents" className="text-sm text-primary hover:underline inline-block">
          Back to Documents
        </Link>
      </div>
    );
  }

  if (!jd) {
    return (
      <Card>
        <EmptyState
          icon={FileText}
          title="Job description not found"
          description="This job description may have been deleted or the link is invalid."
          actionLabel="Back to Documents"
          onAction={() => navigate("/app/documents")}
          compact
        />
      </Card>
    );
  }

  const requirements = jd.parsed_data?.required_skills ?? [];
  const keywords     = jd.parsed_data?.key_phrases ?? [];
  const location     = jd.parsed_data?.location;
  const salary       = jd.parsed_data?.salary_range;

  return (
    <div>
      <PageHeader
        title={jd.target_role || jd.title || "Job Description"}
        description={jd.company ?? ""}
        icon={<FileText className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: jd.target_role || "JD" },
        ]}
        actions={
          <div className="flex gap-2">
            {!editing && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setEditing(true)}
                leftIcon={<Edit className="w-4 h-4" />}
              >
                Edit
              </Button>
            )}
            <Link to={jd.company ? companyProfilePath(jd.company) : "/app/companies"}>
              <Button variant="secondary" size="sm" leftIcon={<Building2 className="w-4 h-4" />}>
                Company Brief
              </Button>
            </Link>
            <Link to="/app/prep?tool=jd_fit">
              <Button variant="secondary" size="sm" leftIcon={<FileText className="w-4 h-4" />}>
                Gap Analysis
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDeleteOpen(true)}
              className="text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        {editing && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Edit Details</h3>
            <div className="space-y-2 mb-3">
              <input
                type="text"
                value={editRole}
                onChange={(e) => setEditRole(e.target.value)}
                placeholder="Job title / role"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <input
                type="text"
                value={editCompany}
                onChange={(e) => setEditCompany(e.target.value)}
                placeholder="Company name"
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveEdit}
                disabled={savingEdit}
                leftIcon={savingEdit ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              >
                Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setEditing(false);
                  setEditRole(jd?.target_role ?? jd?.title ?? "");
                  setEditCompany(jd?.company ?? "");
                }}
                leftIcon={<X className="w-4 h-4" />}
              >
                Cancel
              </Button>
            </div>
          </Card>
        )}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="text-center">
            <Building2 className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Company</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{jd.company || "—"}</p>
          </Card>
          <Card className="text-center">
            <MapPin className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Location</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{location || "—"}</p>
          </Card>
          <Card className="text-center">
            <DollarSign className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Salary</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{salary || "—"}</p>
          </Card>
          <Card className="text-center">
            {jd.is_active ? (
              <>
                <CheckCircle className="w-4 h-4 mx-auto text-emerald-500 mb-1" />
                <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                <p className="text-xs font-semibold text-emerald-500 mt-0.5">Active</p>
              </>
            ) : (
              <>
                <Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
                <p className="text-[10px] text-muted-foreground uppercase">Status</p>
                <p className="text-xs font-semibold text-muted-foreground mt-0.5">Inactive</p>
              </>
            )}
          </Card>
        </div>

        {requirements.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Key Requirements</h3>
            <ul className="space-y-1.5">
              {requirements.map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {keywords.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Keywords</h3>
            <div className="flex flex-wrap gap-1.5">
              {keywords.map((k: string) => (
                <span
                  key={k}
                  className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground"
                >
                  {k}
                </span>
              ))}
            </div>
          </Card>
        )}

        {jd.content && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Full Description</h3>
            <div className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
              {jd.content}
            </div>
          </Card>
        )}

        <p className="text-[11px] text-muted-foreground">
          Added{" "}
          {new Date(jd.created_at).toLocaleDateString(undefined, {
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete this job description?"
        description="This cannot be undone."
        confirmLabel="Delete"
        variant="destructive"
        isLoading={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
