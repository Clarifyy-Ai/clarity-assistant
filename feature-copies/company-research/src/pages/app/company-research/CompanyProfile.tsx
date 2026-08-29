import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useSearchParams, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { PlanGate } from "@/components/layout/PlanGate";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
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
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { normalizePlanId } from "@/lib/billing/planIds";
import { normalizeCompanyName } from "@/lib/company/normalizeCompanyName";

/**
 * The Edge Function is the only writer of `company_research`. It returns
 * `persisted: true` only after the row is committed, so the page never shows a
 * brief that would disappear on reload.
 */
type CompanyResearchResponse = {
  success?: boolean;
  id?: string;
  persisted?: boolean;
  brief?: Record<string, unknown>;
};

export default function CompanyProfile() {
  const { id }     = useParams<{ id: string }>();
  const [params]   = useSearchParams();
  const navigate   = useNavigate();
  const { user, profile } = useAuthStore();
  const planId = normalizePlanId((profile as { plan_id?: string } | null)?.plan_id);

  const companyName = params.get("name") ?? id?.replace(/-/g, " ") ?? "";

  const [brief,    setBrief]    = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [needsGenerateConfirm, setNeedsGenerateConfirm] = useState(false);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const inFlightRef = useRef(false);

  // ── Generate or load brief ────────────────────────────────────
  const generateBrief = useCallback(async (force = false) => {
    if (!companyName.trim()) {
      setError("No company name provided.");
      setLoading(false);
      return;
    }
    // Guards double-click: a second submit would spend credits again.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    setLoading(true);
    setError(null);

    try {
      if (!force) {
        const { data: cached, error: cacheErr } = await supabase
          .from("company_research")
          .select("*")
          .eq("user_id", user?.id ?? "")
          .eq("company_name_normalized", normalizeCompanyName(companyName))
          .maybeSingle();

        if (cacheErr) {
          console.warn("[CompanyProfile] Cache read failed:", cacheErr.message);
        }

        if (cached?.raw_data) {
          setBrief(cached.raw_data);
          setLoading(false);
          setNeedsGenerateConfirm(false);
          return;
        }

        // No saved brief — require explicit confirm before spending credits.
        setLoading(false);
        setNeedsGenerateConfirm(true);
        return;
      }

      // Omit x-idempotency-key so the Edge Function derives minute-bucketed force keys.
      const result = await fetchEdgeJson<CompanyResearchResponse>(
        "company-research",
        {
          company: companyName,
          role: params.get("role") ?? "",
          force: true,
        },
      );

      if (!result?.persisted || !result?.brief) {
        setError("Research was generated but could not be saved. Please retry.");
        return;
      }

      // Confirm persistence from DB — do not rely on React state alone after refresh.
      const { data: persisted, error: verifyErr } = await supabase
        .from("company_research")
        .select("raw_data")
        .eq("user_id", user?.id ?? "")
        .eq("company_name_normalized", normalizeCompanyName(companyName))
        .maybeSingle();

      if (verifyErr) {
        console.warn("[CompanyProfile] Post-save verify failed:", verifyErr.message);
      }

      const briefFromDb =
        persisted?.raw_data && typeof persisted.raw_data === "object"
          ? persisted.raw_data
          : result.brief;

      setBrief(briefFromDb);
      setNeedsGenerateConfirm(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to generate brief";
      console.error("[CompanyProfile] generateBrief error:", err);
      setError(msg);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, [companyName, user?.id, params]);

  useEffect(() => {
    if (planId === "free") return;
    if (companyName) void generateBrief(false);
  }, [companyName, user?.id, planId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (planId === "free") {
    return (
      <PageContent className="max-w-3xl space-y-5">
        <PageHeader
          title={companyName || "Company research"}
          subtitle="AI-generated interview prep briefs"
          breadcrumbs={[
            { label: "Company Research", href: "/app/companies" },
            { label: companyName || "Company" },
          ]}
        />
        <PlanGate requiredPlan="pro" featureFlag="company_research">
          <Card className="min-h-[12rem] p-6" aria-hidden="true">
            <div className="h-24 rounded-xl bg-muted/40" />
          </Card>
        </PlanGate>
      </PageContent>
    );
  }

  if (needsGenerateConfirm && !brief && !loading) {
    return (
      <PageContent className="max-w-3xl space-y-5">
        <PageHeader
          title={companyName || "Company research"}
          subtitle="Generate an AI interview prep brief"
          breadcrumbs={[
            { label: "Company Research", href: "/app/companies" },
            { label: companyName || "Company" },
          ]}
        />
        {/* A failed generation leaves this gate mounted — without the banner the
            user would see the same CTA with no idea why nothing happened. */}
        {error ? (
          <InlineErrorRetry message={error} onRetry={() => void generateBrief(true)} />
        ) : null}
        <Card className="p-6 space-y-4 text-center">
          <Building2 className="w-10 h-10 text-primary mx-auto" />
          <p className="text-sm text-muted-foreground">
            No saved brief yet for <strong>{companyName}</strong>. Generating costs{" "}
            <strong>{AI_CREDIT_COSTS.company_research} credits</strong>.
          </p>
          <div className="flex justify-center gap-3 flex-wrap">
            <Button variant="secondary" onClick={() => navigate("/app/companies")}>
              Cancel
            </Button>
            <Button
              variant="primary"
              leftIcon={<Sparkles className="w-4 h-4" />}
              onClick={() => setConfirmGenerate(true)}
            >
              Generate brief ({AI_CREDIT_COSTS.company_research} credits)
            </Button>
          </div>
        </Card>
        <ConfirmDialog
          open={confirmGenerate}
          onOpenChange={setConfirmGenerate}
          title="Generate company brief?"
          description={`This uses ${AI_CREDIT_COSTS.company_research} credits to create an AI interview prep brief for ${companyName}.`}
          confirmLabel={`Spend ${AI_CREDIT_COSTS.company_research} credits`}
          onConfirm={async () => {
            setConfirmGenerate(false);
            await generateBrief(true);
          }}
        />
      </PageContent>
    );
  }

  // ── Loading state ─────────────────────────────────────────────

  // Only full-page skeleton on first load. Refresh must keep the brief + Refresh
  // control mounted so in-flight guards work and Playwright cannot re-click after
  // the button remounts when loading flips false.
  if (loading && !brief) {
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

  if (error && !brief) {
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
            disabled={loading}
            aria-busy={loading}
            onClick={() => void generateBrief(true)}
            leftIcon={
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            }
          >
            Refresh
          </Button>
        }
      />

      {error ? (
        <InlineErrorRetry message={error} onRetry={() => void generateBrief(true)} />
      ) : null}
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
