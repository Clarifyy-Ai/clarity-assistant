import { useState, useEffect } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { FileText, Trash2, Building2, MapPin, DollarSign, CheckCircle, Clock } from "lucide-react";
import { toast } from "sonner";

interface JD {
  id: string;
  title: string;
  company_name: string;
  job_title: string;
  job_location: string;
  salary_range: string;
  content: string;
  requirements: string[];
  keywords: string[];
  is_active: boolean;
  created_at: string;
}

export default function JDDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const [jd, setJd] = useState<JD | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id || !user?.id) return;
    (async () => {
      const { data } = await supabase
        .from("documents")
        .select("*")
        .eq("id", id)
        .eq("type", "job_description")
        .eq("user_id", user.id)
        .single();
      setJd(data as JD | null);
      setLoading(false);
    })();
  }, [id, user?.id]);

  async function handleDelete() {
    if (!id || !confirm("Delete this job description?")) return;
    await supabase.from("documents").delete().eq("id", id);
    toast.success("Job description deleted");
    navigate("/app/documents");
  }

  if (loading) return <Card className="animate-pulse h-48" />;

  if (!jd) {
    return (
      <Card className="text-center py-12">
        <p className="text-foreground font-medium">Job description not found</p>
        <Link to="/app/documents" className="text-sm text-violet-500 hover:underline mt-2 inline-block">Back to Documents</Link>
      </Card>
    );
  }

  return (
    <div>
      <PageHeader
        title={jd.job_title || jd.title || "Job Description"}
        description={jd.company_name ?? ""}
        icon={<FileText className="w-5 h-5 text-violet-400" />}
        breadcrumbs={[
          { label: "Documents", href: "/app/documents" },
          { label: jd.title || "JD" },
        ]}
        actions={
          <div className="flex gap-2">
            <Link to={`/app/companies/${encodeURIComponent(jd.company_name ?? "")}`}>
              <Button variant="secondary" size="sm" leftIcon={<Building2 className="w-4 h-4" />}>Company Brief</Button>
            </Link>
            <Link to="/app/prep?tool=gap_analysis">
              <Button variant="secondary" size="sm" leftIcon={<FileText className="w-4 h-4" />}>Gap Analysis</Button>
            </Link>
            <Button variant="ghost" size="sm" onClick={handleDelete} className="text-red-400 hover:text-red-300">
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        }
      />

      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Card className="text-center">
            <Building2 className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Company</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{jd.company_name || "—"}</p>
          </Card>
          <Card className="text-center">
            <MapPin className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Location</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{jd.job_location || "—"}</p>
          </Card>
          <Card className="text-center">
            <DollarSign className="w-4 h-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-[10px] text-muted-foreground uppercase">Salary</p>
            <p className="text-xs font-semibold text-foreground mt-0.5">{jd.salary_range || "—"}</p>
          </Card>
          <Card className="text-center">
            {jd.is_active
              ? <><CheckCircle className="w-4 h-4 mx-auto text-emerald-500 mb-1" /><p className="text-[10px] text-muted-foreground uppercase">Status</p><p className="text-xs font-semibold text-emerald-500 mt-0.5">Active</p></>
              : <><Clock className="w-4 h-4 mx-auto text-muted-foreground mb-1" /><p className="text-[10px] text-muted-foreground uppercase">Status</p><p className="text-xs font-semibold text-muted-foreground mt-0.5">Inactive</p></>}
          </Card>
        </div>

        {jd.requirements && jd.requirements.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Key Requirements</h3>
            <ul className="space-y-1.5">
              {jd.requirements.map((r: string, i: number) => (
                <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full bg-violet-500 mt-1.5 flex-shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {jd.keywords && jd.keywords.length > 0 && (
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-2">Keywords</h3>
            <div className="flex flex-wrap gap-1.5">
              {jd.keywords.map((k: string) => (
                <span key={k} className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-muted text-muted-foreground">{k}</span>
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
          Added {new Date(jd.created_at).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })}
        </p>
      </div>
    </div>
  );
}
