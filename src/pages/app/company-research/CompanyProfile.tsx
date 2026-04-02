// @ts-nocheck
import { fetchEdge } from "@/lib/network/fetchEdge";
import { useEffect, useState } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard, SkeletonText } from "@/components/ui/SkeletonLoader";
import {
  ChevronLeft, Building2, Target, Star,
  Brain, TrendingUp, Users, Globe,
  BookOpen, Sparkles, RefreshCw,
  CheckCircle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// CompanyProfile — full AI-generated company brief
// ─────────────────────────────────────────────────────────────────

export default function CompanyProfile() {
  const { slug }        = useParams<{ slug: string }>();
  const [params]        = useSearchParams();
  const navigate        = useNavigate();
  const { user }        = useAuthStore();

  const companyName     = params.get("name") ?? slug?.replace(/-/g, " ") ?? "";

  const [brief,    setBrief]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saved,    setSaved]    = useState(false);

  useEffect(() => {
    if (companyName) generateBrief();
  }, [companyName]);

  async function generateBrief(force = false) {
    setLoading(true);
    setError(null);

    // Check cache first (unless forcing)
    if (!force) {
      const { data: cached } = await supabase
        .from("company_research")
        .select("*")
        .eq("user_id", user?.id)
        .ilike("company_name", companyName)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (cached?.raw_data) {
        setBrief(cached.raw_data);
        setLoading(false);
        return;
      }
    }

    // Generate via Edge Function
    
    try {
      const res = await fetchEdge("company-research", { company: companyName });

      if (!res.ok) throw new Error("Failed to generate brief");

      const data = await res.json();
      setBrief(data);

      // Cache it
      await supabase.from("company_research").upsert({
        user_id:       user?.id,
        company_name:  companyName,
        raw_data:      data,
        overview:      data.overview ?? null,
        culture:       data.culture ?? null,
        prep_tips:     data.tips?.join("; ") ?? null,
      });

    } catch (err) {
      setError("Failed to generate brief. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl space-y-5">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-violet-600/20 rounded-xl animate-pulse" />
          <div className="space-y-2">
            <div className="h-5 w-32 bg-secondary rounded animate-pulse" />
            <div className="h-3 w-48 bg-accent/5 rounded animate-pulse" />
          </div>
        </div>
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
        <div className="text-center">
          <p className="text-xs text-muted-foreground animate-pulse">
            Generating AI brief for {companyName}…
          </p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-3xl text-center py-20 space-y-4">
        <p className="text-red-400 text-sm">{error}</p>
        <Button variant="secondary" size="sm" onClick={() => generateBrief(true)}>
          Try again
        </Button>
      </div>
    );
  }

  if (!brief) {
    return (
      <div className="max-w-3xl text-center py-20 space-y-4">
        <Building2 className="w-10 h-10 text-muted-foreground/40 mx-auto" />
        <p className="text-sm text-muted-foreground">No brief available for {companyName || "this company"}.</p>
        <div className="flex items-center justify-center gap-3">
          <Button variant="secondary" size="sm" onClick={() => navigate("/app/companies")}>
            <ChevronLeft className="w-3 h-3 mr-1" />
            Back
          </Button>
          <Button variant="primary" size="sm" onClick={() => generateBrief(true)}>
            <RefreshCw className="w-3 h-3 mr-1" />
            Generate Brief
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-5">

      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate("/app/companies")}
          className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Company Research
        </button>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => generateBrief(true)}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Company header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-violet-600/30 to-blue-600/30 border border-border rounded-2xl flex items-center justify-center text-2xl font-black text-foreground shrink-0">
          {companyName[0]?.toUpperCase()}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground capitalize">
            {companyName}
          </h1>
          {brief.industry && (
            <p className="text-muted-foreground text-sm mt-0.5">{brief.industry}</p>
          )}
          {brief.tags?.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {brief.tags.map((t: string) => (
                <Badge key={t} variant="default" size="sm">{t}</Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Overview */}
      {brief.overview && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Building2 className="w-4 h-4 text-violet-400" />
            <h3 className="text-sm font-semibold text-foreground">Overview</h3>
          </div>
          <p className="text-sm text-foreground leading-relaxed">{brief.overview}</p>
        </Card>
      )}

      {/* Interview process */}
      {brief.interview_process?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-semibold text-foreground">Interview process</h3>
          </div>
          <ol className="space-y-3">
            {brief.interview_process.map((step: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <div className="w-6 h-6 bg-emerald-500/10 border border-emerald-500/20 rounded-full flex items-center justify-center text-[10px] font-bold text-emerald-400 shrink-0 mt-0.5">
                  {i + 1}
                </div>
                <p className="text-sm text-foreground leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        </Card>
      )}

      {/* Likely questions */}
      {brief.questions?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-semibold text-foreground">Likely interview questions</h3>
          </div>
          <ul className="space-y-3">
            {brief.questions.map((q: string, i: number) => (
              <li key={i} className="flex items-start gap-3">
                <span className="text-xs text-muted-foreground shrink-0 tabular-nums pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="flex-1">
                  <p className="text-sm text-foreground">{q}</p>
                </div>
                <Button
                  variant="ghost"
                  size="xs"
                  onClick={() => navigate(`/app/mock?company=${companyName}&q=${encodeURIComponent(q)}`)}
                  className="shrink-0"
                >
                  Practice
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Values */}
      {brief.values?.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-semibold text-foreground">Core values to reference</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {brief.values.map((v: string) => (
              <div
                key={v}
                className="flex items-center gap-2 p-3 bg-amber-500/5 border border-amber-500/10 rounded-xl"
              >
                <CheckCircle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="text-xs text-amber-300 font-medium">{v}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Red flags + tips */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {brief.tips?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-semibold text-foreground">Pro tips</h3>
            </div>
            <ul className="space-y-2">
              {brief.tips.map((t: string, i: number) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                  <span className="text-violet-400 shrink-0 mt-0.5">→</span>
                  {t}
                </li>
              ))}
            </ul>
          </Card>
        )}

        {brief.watch_outs?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Target className="w-4 h-4 text-red-400" />
              <h3 className="text-sm font-semibold text-foreground">Watch out for</h3>
            </div>
            <ul className="space-y-2">
              {brief.watch_outs.map((w: string, i: number) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                  <span className="text-red-400 shrink-0 mt-0.5">⚠</span>
                  {w}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      {/* CTA */}
      <Card className="flex items-center gap-4 bg-gradient-to-r from-violet-600/10 to-blue-600/10 border-violet-500/20">
        <Sparkles className="w-5 h-5 text-violet-400 shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">
            Ready to practice for {companyName}?
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Start a mock session using company-specific questions.
          </p>
        </div>
        <Button
          variant="primary"
          size="sm"
          onClick={() => navigate(`/app/mock?company=${companyName}`)}
        >
          Practice now →
        </Button>
      </Card>
    </div>
  );
}
