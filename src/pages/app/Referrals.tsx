import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuthStore } from "@/store/userStore";
import {
  referralsDB,
  type ReferralDashboard,
  type ReferralDashboardHistoryItem,
} from "@/lib/supabase/database";
import { buildReferralLink } from "@/lib/referrals";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Gift, Copy, Users, Zap, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";
import { PAGE_SHELL } from "@/lib/ui/responsivePage";

type PageState =
  | "loading"
  | "eligible"
  | "programme_disabled"
  | "temporary_backend_failure"
  | "no_referrals_yet"
  | "referrals_available"
  | "code_unavailable";

type HistoryFilter = "all" | "pending" | "rewarded" | "converted";

function resolvePageState(dashboard: ReferralDashboard | null, error: string | null): PageState {
  if (error) return "temporary_backend_failure";
  if (!dashboard) return "loading";
  if (dashboard.account.eligibilityReason === "programme_disabled" || !dashboard.programme) {
    return "programme_disabled";
  }
  if (!dashboard.account.referralCode) return "code_unavailable";
  if (dashboard.history.length === 0) return "no_referrals_yet";
  return "referrals_available";
}

function statusChipClass(status: string): string {
  switch (status) {
    case "rewarded":
      return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300";
    case "converted":
      return "bg-sky-500/15 text-sky-700 dark:text-sky-300";
    case "signed_up":
    case "pending":
      return "bg-amber-500/15 text-amber-800 dark:text-amber-200";
    default:
      return "bg-muted text-muted-foreground";
  }
}

function matchesFilter(item: ReferralDashboardHistoryItem, filter: HistoryFilter): boolean {
  if (filter === "all") return true;
  if (filter === "pending") return item.status === "pending" || item.status === "signed_up";
  if (filter === "rewarded") return item.status === "rewarded";
  if (filter === "converted") return item.status === "converted" || Boolean(item.convertedAt);
  return true;
}

export default function Referrals() {
  const { user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [dashboard, setDashboard] = useState<ReferralDashboard | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");

  const loadDashboard = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const data = await referralsDB.getReferralDashboard();
      setDashboard(data);
      setLoadError(null);
    } catch (err) {
      setDashboard(null);
      setLoadError(err instanceof Error ? err.message : "Could not load referral dashboard");
      toast.error("Could not load referral dashboard");
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const pageState: PageState = loading
    ? "loading"
    : resolvePageState(dashboard, loadError);

  const code = dashboard?.account.referralCode ?? null;
  const link = code
    ? dashboard?.account.referralLink || buildReferralLink(code)
    : null;

  const refereeCredits = dashboard?.programme?.refereeCreditReward ?? null;
  const referrerCredits = dashboard?.programme?.referrerCreditReward ?? null;
  const discountPercent = dashboard?.programme?.referralDiscountPercent ?? null;

  const filteredHistory = useMemo(() => {
    const history = dashboard?.history ?? [];
    return history.filter((item) => matchesFilter(item, historyFilter));
  }, [dashboard?.history, historyFilter]);

  function copyLink() {
    if (!link) {
      toast.error("Referral link unavailable. Refresh the page or contact support.");
      return;
    }
    void navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  async function shareLink() {
    if (!link) {
      toast.error("Referral link unavailable. Refresh the page or contact support.");
      return;
    }
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "Join Career Pilot",
          text: "Practice interviews with AI coaching — use my referral link:",
          url: link,
        });
        return;
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
      }
    }
    copyLink();
  }

  const steps =
    refereeCredits != null && referrerCredits != null
      ? [
          { icon: Share2, title: "Share your link", desc: "Send your unique referral link to friends" },
          { icon: Users, title: "They sign up", desc: "Your friend creates a free account with your code" },
          {
            icon: Zap,
            title: "You both earn credits",
            desc: `They get ${refereeCredits} credits and you get ${referrerCredits} credits as soon as they sign up`,
          },
        ]
      : null;

  return (
    <PageContent data-testid="page-width-root" className={PAGE_SHELL}>
      <PageHeader
        title="Referrals"
        description="Invite friends and earn bonus credits"
        icon={<Gift className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.referrals },
        ]}
      />

      {pageState === "temporary_backend_failure" && loadError && (
        <InlineErrorRetry
          message={loadError}
          onRetry={() => void loadDashboard()}
          className="mb-4"
        />
      )}

      {pageState === "programme_disabled" && (
        <Card className="mb-4 p-4">
          <p className="text-sm text-muted-foreground">
            The referral programme is currently paused. Check back later — existing rewards are
            unchanged.
          </p>
        </Card>
      )}

      {pageState === "code_unavailable" && (
        <InlineErrorRetry
          message="We could not mint your referral code. Retry or contact support if this persists."
          onRetry={() => void loadDashboard()}
          className="mb-4"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Your Referral Link</h3>
            {pageState === "loading" ? (
              <div className="space-y-2">
                <div className="h-10 bg-muted animate-pulse rounded-lg" data-testid="referral-code-skeleton" />
                <div className="h-4 w-40 bg-muted animate-pulse rounded" />
              </div>
            ) : !code || !link ? (
              <p className="text-sm text-destructive">
                Referral link unavailable right now.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div
                    className="flex-1 min-w-[200px] bg-muted rounded-xl px-3 py-2.5 text-sm text-muted-foreground font-mono truncate"
                    data-testid="referral-link"
                  >
                    {link}
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void shareLink()}
                    leftIcon={<Share2 className="w-4 h-4" />}
                  >
                    Share
                  </Button>
                  <Button
                    variant={copied ? "success" : "primary"}
                    size="sm"
                    onClick={copyLink}
                    data-testid="referral-copy"
                    leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Referral code:{" "}
                  <span className="font-mono font-semibold text-foreground" data-testid="referral-code">
                    {code}
                  </span>
                </p>
                {discountPercent != null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Friends also get {discountPercent}% off their first purchase.
                  </p>
                )}
              </>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">How it works</h3>
            {pageState === "loading" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 bg-muted animate-pulse rounded-lg" />
                ))}
              </div>
            ) : !steps ? (
              <p className="text-sm text-muted-foreground">
                Programme terms are unavailable. Retry to load reward amounts.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {steps.map((step, i) => (
                  <div key={i} className="text-center">
                    <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-primary/15 flex items-center justify-center">
                      <step.icon className="w-5 h-5 text-primary" />
                    </div>
                    <p className="text-sm font-medium text-foreground">{step.title}</p>
                    <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">Friends you invited</h3>
              {(pageState === "referrals_available" || pageState === "no_referrals_yet") && (
                <div className="flex flex-wrap gap-1" data-testid="referral-history-filters">
                  {(
                    [
                      ["all", "All"],
                      ["pending", "Pending"],
                      ["rewarded", "Rewarded"],
                      ["converted", "Converted"],
                    ] as const
                  ).map(([key, label]) => (
                    <Button
                      key={key}
                      size="sm"
                      variant={historyFilter === key ? "primary" : "outline"}
                      onClick={() => setHistoryFilter(key)}
                    >
                      {label}
                    </Button>
                  ))}
                </div>
              )}
            </div>

            {pageState === "loading" ? (
              <div className="space-y-2">
                <div className="h-10 bg-muted animate-pulse rounded-lg" />
                <div className="h-10 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : pageState === "temporary_backend_failure" ? (
              <p className="text-sm text-muted-foreground">
                History could not be loaded. Use Retry above.
              </p>
            ) : pageState === "no_referrals_yet" ? (
              <p className="text-sm text-muted-foreground" data-testid="referral-empty">
                No signups yet. Share your link to start earning credits.
              </p>
            ) : filteredHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No referrals match this filter.</p>
            ) : (
              <ul className="divide-y divide-border" data-testid="referral-history">
                {filteredHistory.map((invite) => (
                  <li key={invite.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {invite.referredEmailMasked || "Friend"}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span
                          className={`text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded ${statusChipClass(invite.status)}`}
                        >
                          {invite.status.replace(/_/g, " ")}
                        </span>
                        <p className="text-xs text-muted-foreground">
                          {invite.signedUpAt
                            ? new Date(invite.signedUpAt).toLocaleDateString()
                            : invite.createdAt
                              ? new Date(invite.createdAt).toLocaleDateString()
                              : ""}
                        </p>
                      </div>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">
                      +{invite.creditsAwarded}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="text-center">
            <Users className="w-6 h-6 mx-auto text-primary mb-2" />
            {pageState === "loading" ? (
              <div className="h-7 w-12 mx-auto bg-muted animate-pulse rounded" />
            ) : pageState === "temporary_backend_failure" ? (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            ) : (
              <p className="text-2xl font-bold text-foreground" data-testid="referral-invited-count">
                {dashboard?.summary.attributed ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Friends Invited</p>
          </Card>
          <Card className="text-center">
            <Zap className="w-6 h-6 mx-auto text-amber-500 mb-2" />
            {pageState === "loading" ? (
              <div className="h-7 w-12 mx-auto bg-muted animate-pulse rounded" />
            ) : pageState === "temporary_backend_failure" ? (
              <p className="text-2xl font-bold text-muted-foreground">—</p>
            ) : (
              <p className="text-2xl font-bold text-foreground" data-testid="referral-credits-earned">
                {dashboard?.summary.creditsEarned ?? 0}
              </p>
            )}
            <p className="text-xs text-muted-foreground">Credits Earned</p>
          </Card>
          {dashboard?.programme && (
            <Card className="p-3 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground text-sm">Programme</p>
              <p>{dashboard.programme.name}</p>
              <p className="font-mono">{dashboard.programme.version}</p>
            </Card>
          )}
        </div>
      </div>
    </PageContent>
  );
}
