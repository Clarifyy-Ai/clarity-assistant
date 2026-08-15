import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { referralsDB, type ReferralInviteRow } from "@/lib/supabase/database";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageContent } from "@/components/layout/PageContent";
import { InlineErrorRetry } from "@/components/common/InlineErrorRetry";
import { Gift, Copy, Users, Zap, Check, Share2 } from "lucide-react";
import { toast } from "sonner";
import { PRODUCT_NAMES } from "@/lib/constants/productNames";

export default function Referrals() {
  const { profile, user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [invitedCount, setInvitedCount] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);
  const [invites, setInvites] = useState<ReferralInviteRow[]>([]);
  const [refereeCredits, setRefereeCredits] = useState(25);
  const [referrerCredits, setReferrerCredits] = useState(25);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [code, setCode] = useState<string | null>(
    profile?.referral_code?.trim() ? profile.referral_code.trim().toUpperCase() : null,
  );

  async function loadStats() {
    if (!user?.id) return;
    setStatsLoading(true);
    try {
      const [stats, program, list] = await Promise.all([
        referralsDB.getStats(user.id),
        referralsDB.getProgramCopy().catch(() => ({
          refereeCredits: 25,
          referrerCredits: 25,
          discountPercent: 50,
        })),
        referralsDB.listMine().catch(() => [] as ReferralInviteRow[]),
      ]);
      setInvitedCount(stats.invitedCount);
      setCreditsEarned(stats.creditsEarned);
      setRefereeCredits(program.refereeCredits);
      setReferrerCredits(program.referrerCredits);
      setInvites(list);
      setStatsError(null);
    } catch (err) {
      setStatsError(err instanceof Error ? err.message : "Could not load referral stats");
      toast.error("Could not load referral stats");
    } finally {
      setStatsLoading(false);
    }
  }

  useEffect(() => {
    void loadStats();
  }, [user?.id]);

  useEffect(() => {
    const fromProfile = profile?.referral_code?.trim();
    if (fromProfile) {
      setCode(fromProfile.toUpperCase());
      return;
    }
    if (!user?.id) return;
    let cancelled = false;
    void referralsDB
      .ensureMyCode()
      .then((ensured) => {
        if (!cancelled && ensured) setCode(ensured);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error("Could not load your referral code. Refresh and try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.referral_code, user?.id]);

  const link = code ? `${window.location.origin}/signup?ref=${code}` : null;

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
          title: "Join Clarify AI",
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

  const steps = [
    { icon: Share2, title: "Share your link", desc: "Send your unique referral link to friends" },
    { icon: Users, title: "They sign up", desc: "Your friend creates a free account with your code" },
    {
      icon: Zap,
      title: "You both earn credits",
      desc: `They get ${refereeCredits} credits and you get ${referrerCredits} credits as soon as they sign up`,
    },
  ];

  return (
    <PageContent>
      <PageHeader
        title="Referrals"
        description="Invite friends and earn bonus credits"
        icon={<Gift className="w-5 h-5 text-primary" />}
        breadcrumbs={[
          { label: PRODUCT_NAMES.dashboard, href: "/app/dashboard" },
          { label: PRODUCT_NAMES.referrals },
        ]}
      />

      {statsError && (
        <InlineErrorRetry
          message={statsError}
          onRetry={() => void loadStats()}
          className="mb-4"
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Your Referral Link</h3>
            {!code ? (
              <p className="text-sm text-destructive">
                We could not load your referral code. Refresh the page or contact support if this persists.
              </p>
            ) : (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="flex-1 min-w-[200px] bg-muted rounded-xl px-3 py-2.5 text-sm text-muted-foreground font-mono truncate">
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
                    leftIcon={copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  Referral code: <span className="font-mono font-semibold text-foreground">{code}</span>
                </p>
              </>
            )}
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">How it works</h3>
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
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Friends you invited</h3>
            {statsLoading ? (
              <div className="space-y-2">
                <div className="h-10 bg-muted animate-pulse rounded-lg" />
                <div className="h-10 bg-muted animate-pulse rounded-lg" />
              </div>
            ) : invites.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No signups yet. Share your link to start earning credits.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {invites.map((invite) => (
                  <li key={invite.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">
                        {invite.referred_email_masked || "Friend"}
                      </p>
                      <p className="text-xs text-muted-foreground capitalize">
                        {invite.status.replace(/_/g, " ")}
                        {invite.signed_up_at
                          ? ` · ${new Date(invite.signed_up_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-foreground shrink-0">
                      +{invite.credits_awarded}
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
            {statsLoading ? (
              <div className="h-7 w-12 mx-auto bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{invitedCount}</p>
            )}
            <p className="text-xs text-muted-foreground">Friends Invited</p>
          </Card>
          <Card className="text-center">
            <Zap className="w-6 h-6 mx-auto text-amber-500 mb-2" />
            {statsLoading ? (
              <div className="h-7 w-12 mx-auto bg-muted animate-pulse rounded" />
            ) : (
              <p className="text-2xl font-bold text-foreground">{creditsEarned}</p>
            )}
            <p className="text-xs text-muted-foreground">Credits Earned</p>
          </Card>
        </div>
      </div>
    </PageContent>
  );
}
