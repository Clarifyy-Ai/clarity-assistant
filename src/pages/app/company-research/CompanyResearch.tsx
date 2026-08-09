import { useEffect, useState, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { companyProfilePath } from "@/lib/company/slug";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { AI_CREDIT_COSTS } from "@/lib/constants/creditEconomics";
import { PageHeader } from "@/components/layout/PageHeader";
import { PlanGate } from "@/components/layout/PlanGate";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import { EmptyState } from "@/components/common/EmptyState";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import {
  Building2, Search, ChevronRight,
  Plus, Sparkles, Clock, Star, Coins,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

// ─────────────────────────────────────────────────────────────────
// CompanyResearch — search + saved company briefs
// ─────────────────────────────────────────────────────────────────

const POPULAR = [
  "Google", "Meta", "Apple", "Amazon", "Microsoft",
  "Stripe", "Airbnb", "Netflix", "Uber", "OpenAI",
  "Notion", "Figma", "Vercel", "Shopify", "Atlassian",
];

export default function CompanyResearch() {
  const navigate  = useNavigate();
  const [searchParams] = useSearchParams();
  const { user }  = useAuthStore();

  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [saved,     setSaved]     = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);

  const loadSavedBriefs = useCallback(async () => {
    if (!user?.id) return;
    setLoadingSaved(true);
    setSavedError(null);
    const { data, error } = await supabase
      .from("company_research")
      .select("id, company_name, role_title, created_at, overview")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) {
      console.error("[CompanyResearch] saved briefs:", error);
      setSavedError(error.message);
      setSaved([]);
    } else {
      setSaved(data ?? []);
    }
    setLoadingSaved(false);
  }, [user?.id]);

  // Fetch previously generated briefs
  useEffect(() => {
    if (!user) return;
    void loadSavedBriefs();
  }, [user, loadSavedBriefs]);

  useEffect(() => {
    const q = searchParams.get("q")?.trim();
    if (q) {
      setQuery(q);
      navigate(companyProfilePath(q), { replace: true });
    }
  }, [searchParams, navigate]);

  async function handleSearch(company?: string) {
    const q = (company ?? query).trim();
    if (!q) return;
    navigate(companyProfilePath(q));
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Company Research"
        subtitle="AI-generated interview briefs for any company"
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.companyResearch },
        ]}
      />

      <PlanGate requiredPlan="pro">
      <div className="space-y-6">
      {/* Search bar */}
      <Card>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
              placeholder="Enter a company name…"
              className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
              autoFocus
            />
          </div>
          <Button
            variant="primary"
            size="md"
            loading={loading}
            disabled={!query.trim()}
            onClick={() => handleSearch()}
            leftIcon={<Sparkles className="w-4 h-4" />}
          >
            Generate brief
          </Button>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mt-2.5">
          <Coins className="w-3.5 h-3.5 text-amber-400 shrink-0" />
          <span>Generating a new deep-dive brief consumes {AI_CREDIT_COSTS.company_research} credits</span>
        </div>

        {/* Popular companies */}
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Popular companies</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((c) => (
              <button
                key={c}
                onClick={() => handleSearch(c)}
                className="px-3 py-1.5 bg-secondary hover:bg-secondary/80 border border-border hover:border-primary/30 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-all"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Previously generated */}
      {savedError && (
        <InlineErrorRetry message={savedError} onRetry={() => void loadSavedBriefs()} />
      )}

      {loadingSaved ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : saved.length > 0 ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3">
            Recent briefs
          </p>
          <div className="space-y-2">
            {saved.map((s) => (
              <Card
                key={s.id}
                hover
                padding="sm"
                onClick={() => navigate(`/app/companies/${s.company_name.toLowerCase().replace(/\s+/g, "-")}?name=${encodeURIComponent(s.company_name)}`)}
              >
                <div className="flex items-center gap-4">
                  <div className="w-9 h-9 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground">{s.company_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {s.role_title && `${s.role_title} · `}
                      {format(new Date(s.created_at), "MMM d, yyyy")}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                </div>
              </Card>
            ))}
          </div>
        </div>
      ) : !savedError ? (
        <Card>
          <EmptyState
            icon={Building2}
            title="No saved briefs yet"
            description="Search for a company above to generate your first AI interview brief."
            compact
          />
        </Card>
      ) : null}
      </div>
      </PlanGate>
    </div>
  );
}
