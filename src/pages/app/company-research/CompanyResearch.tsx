// @ts-nocheck
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { SkeletonCard } from "@/components/ui/SkeletonLoader";
import {
  Building2, Search, ChevronRight,
  Plus, Sparkles, Clock, Star,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";

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
  const { user }  = useAuthStore();

  const [query,     setQuery]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [saved,     setSaved]     = useState<any[]>([]);
  const [loadingSaved, setLoadingSaved] = useState(true);

  // Fetch previously generated briefs
  useState(() => {
    if (!user) return;
    supabase
      .from("company_research")
      .select("id, company_name, role_title, created_at, overview")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        setSaved(data ?? []);
        setLoadingSaved(false);
      });
  });

  async function handleSearch(company?: string) {
    const q = (company ?? query).trim();
    if (!q) return;

    // Navigate to company profile — it will generate the brief
    const slug = q.toLowerCase().replace(/\s+/g, "-");
    navigate(`/app/companies/${slug}?name=${encodeURIComponent(q)}`);
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        title="Company Research"
        subtitle="AI-generated interview briefs for any company"
      />

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
              className="w-full bg-black/30 border border-white/10 text-foreground placeholder-gray-600 rounded-xl pl-10 pr-4 py-3 text-sm focus:outline-none focus:border-violet-500"
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

        {/* Popular companies */}
        <div className="mt-4">
          <p className="text-xs text-muted-foreground mb-2">Popular companies</p>
          <div className="flex flex-wrap gap-2">
            {POPULAR.map((c) => (
              <button
                key={c}
                onClick={() => handleSearch(c)}
                className="px-3 py-1.5 bg-white/3 hover:bg-white/8 border border-white/10 hover:border-white/20 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-all"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Previously generated */}
      {loadingSaved ? (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}
        </div>
      ) : saved.length > 0 && (
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
                  <div className="w-9 h-9 bg-violet-500/10 rounded-xl flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-violet-400" />
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
      )}
    </div>
  );
}
