import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useEffect, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  ChevronLeft, Building2, Target, Star,
  Brain, TrendingUp, Users, Globe,
  BookOpen, Sparkles, RefreshCw,
  CheckCircle, MessageSquare,
} from "lucide-react";
import { cn } from "@/lib/utils";

export default function CompanyProfile() {
  const { id }     = useParams<{ id: string }>();
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();

  const companyName = params.get("name") ?? id?.replace(/-/g, " ") ?? "";

  const [brief,    setBrief]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);

  // ── Generate or load brief ────────────────────────────────────
  // FIX 3: wrapped in useCallback with proper deps to avoid stale closures
  const generateBrief = useCallback(async (force = false) => {
    // FIX 5: guard against empty company name
    if (!companyName.trim()) {
      setError("No company name provided.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // ── Cache check ─────────────────────────────────────────
      // FIX 2: use .maybeSingle() instead of .single() to avoid
      // PGRST116 / 406 error when no cached row exists
      if (!force) {
        const { data: cached, error: cacheErr } = await supabase
          .from("company_research")
          .select("*")
          .eq("user_id", user?.id)
          .ilike("company_name", companyName)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();  // FIX 2: returns null (not error) when 0 rows

        if (cacheErr) {
          // Non-fatal — log and fall through to generation
          console.warn("[CompanyProfile] Cache read failed:", cacheErr.message);
        } else if (cached?.raw_data) {
          setBrief(cached.raw_data);
          setLoading(false);
          return;
        }
      }

      // ── Edge function call ───────────────────────────────────
      const data = await fetchEdgeJson<Record<string, unknown>>("company-research", {
        company: companyName,
      });
      setBrief(data);

      // ── Cache the result ─────────────────────────────────────
      // FIX 4: add onConflict so upsert updates existing row
      // instead of inserting duplicates on every refresh
      const d = data as any;
      const { error: upsertErr } = await supabase
        .from("company_research")
        .upsert(
          {
            user_id:      user?.id,
            company_name: companyName,
            role_title:   params.get("role") ?? null,
            raw_data:     d,
            overview:     d.overview  ?? null,
            culture:      d.culture   ?? null,
            prep_tips:    Array.isArray(d.tips) ? d.tips.join("; ") : null,
          } as any,
          { onConflict: "user_id,company_name" }  // FIX 4: update, don't insert
        );

      if (upsertErr) {
        // Non-fatal — brief is already set, just log
        console.warn("[CompanyProfile] Cache write failed:", upsertErr.message);
      }

    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate brief";
      // FIX 7: log the real error, show user-friendly message
      console.error("[CompanyProfile] generateBrief error:", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  // FIX 6: include user?.id in deps so cache check runs with correct user
  }, [companyName, user?.id, params]);

  // FIX 6: include user?.id in dep array
  useEffect(() => {
    if (companyName) generateBrief();
  }, [companyName, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Loading state ─────────────────────────────────────────────

  if (loading) {
    return (
      <PageContent className="max-w-3xl space-y-5">
        <PageHeader
          title={companyName || "Company research"}
          subtitle="Generating AI brief…"
          breadcrumbs={[
            { label: "Company Research", href: "/app/companies" },
            { label: companyName || "Loading" },
          ]}
        />
        {[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}
      </PageContent>
    );
  }

  if (error) {
    return (
      <PageContent className="max-w-3xl space-y-5">
        <PageHeader
          title={companyName || "Company research"}
          breadcrumbs={[
            { label: "Company Research", href: "/app/companies" },
            { label: companyName || "Error" },
          ]}
        />
        <InlineErrorRetry message={error} onRetry={() => void generateBrief(true)} />
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => navigate("/app/companies")}>
            <ChevronLeft className="w-3 h-3 mr-1" />
            Back to companies
          </Button>
        </div>
      </PageContent>
    );
  }

  if (!brief) {
    return (
      <PageContent className="max-w-3xl space-y-5">
        <PageHeader
          title={companyName || "Company research"}
          breadcrumbs={[
            { label: "Company Research", href: "/app/companies" },
            { label: companyName || "Not found" },
          ]}
        />
        <Card>
          <EmptyState
            icon={Building2}
            title="No brief available"
            description={`We couldn't find a research brief for ${companyName || "this company"}.`}
            actionLabel="Generate brief"
            onAction={() => void generateBrief(true)}
            secondaryActionLabel="Back to companies"
            onSecondaryAction={() => navigate("/app/companies")}
          />
        </Card>
      </PageContent>
    );
  }

  return (
    <PageContent className="max-w-3xl space-y-5">
      <PageHeader
        title={companyName}
        subtitle={brief.industry || "AI-generated interview prep brief"}
        breadcrumbs={[
          { label: "Company Research", href: "/app/companies" },
          { label: companyName },
        ]}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={() => generateBrief(true)}
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        }
      />

      {/* Company header */}
      <div className="flex items-center gap-4">
        <div className="w-14 h-14 bg-gradient-to-br from-primary/30 to-blue-600/30 border border-border rounded-2xl flex items-center justify-center text-2xl font-black text-foreground shrink-0">
          {companyName[0]?.toUpperCase()}
        </div>
        <div>
          {brief.tags?.length > 0 && (
            <div className="flex gap-2 flex-wrap">
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
            <Building2 className="w-4 h-4 text-primary" />
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
                  onClick={() => navigate(`/app/mock?company=${encodeURIComponent(companyName)}&q=${encodeURIComponent(q)}`)}
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

      {/* Tips + watch outs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {brief.tips?.length > 0 && (
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <Brain className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Pro tips</h3>
            </div>
            <ul className="space-y-2">
              {brief.tips.map((t: string, i: number) => (
                <li key={i} className="text-xs text-foreground flex items-start gap-2">
                  <span className="text-primary shrink-0 mt-0.5">→</span>
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
      <Card className="flex items-center gap-4 bg-gradient-to-r from-primary/10 to-blue-600/10 border-primary/20">
        <Sparkles className="w-5 h-5 text-primary shrink-0" />
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
          onClick={() => navigate(`/app/mock?company=${encodeURIComponent(companyName)}`)}
        >
          Practice now →
        </Button>
      </Card>
    </PageContent>
  );
}
