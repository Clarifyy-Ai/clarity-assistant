import { useState, useEffect } from "react";
import { useAuthStore } from "@/store/userStore";
import { supabase } from "@/lib/supabase/client";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/layout/PageHeader";
import { Gift, Copy, Users, Zap, Check, Share2 } from "lucide-react";
import { toast } from "sonner";

export default function Referrals() {
  const { profile, user } = useAuthStore();
  const [copied, setCopied] = useState(false);
  const [invitedCount, setInvitedCount] = useState(0);
  const [creditsEarned, setCreditsEarned] = useState(0);

  useEffect(() => {
    if (!user?.id) return;
    (async () => {
      const { count } = await supabase
        .from("referrals")
        .select("*", { count: "exact", head: true })
        .eq("referrer_id", user.id);
      setInvitedCount(count ?? 0);

      const { data } = await supabase
        .from("referrals")
        .select("credits_awarded")
        .eq("referrer_id", user.id);
      const total = (data ?? []).reduce((sum: number, r: { credits_awarded?: number }) => sum + (r.credits_awarded ?? 0), 0);
      setCreditsEarned(total);
    })();
  }, [user?.id]);

  const code = profile?.id?.slice(0, 8)?.toUpperCase() ?? "XXXXXX";
  const link = `${window.location.origin}/signup?ref=${code}`;

  function copyLink() {
    navigator.clipboard.writeText(link);
    setCopied(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 2000);
  }

  const steps = [
    { icon: Share2, title: "Share your link", desc: "Send your unique referral link to friends" },
    { icon: Users, title: "They sign up", desc: "Your friend creates a free account" },
    { icon: Zap, title: "You both earn credits", desc: "Get 25 bonus credits each when they complete onboarding" },
  ];

  return (
    <div>
      <PageHeader
        title="Referrals"
        description="Invite friends and earn bonus credits"
        icon={<Gift className="w-5 h-5 text-violet-400" />}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-3">Your Referral Link</h3>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-xl px-3 py-2.5 text-sm text-muted-foreground font-mono truncate">
                {link}
              </div>
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
          </Card>

          <Card>
            <h3 className="text-sm font-semibold text-foreground mb-4">How it works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {steps.map((step, i) => (
                <div key={i} className="text-center">
                  <div className="w-10 h-10 mx-auto mb-2 rounded-xl bg-violet-500/15 flex items-center justify-center">
                    <step.icon className="w-5 h-5 text-violet-500" />
                  </div>
                  <p className="text-sm font-medium text-foreground">{step.title}</p>
                  <p className="text-xs text-muted-foreground mt-1">{step.desc}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="text-center">
            <Users className="w-6 h-6 mx-auto text-violet-500 mb-2" />
            <p className="text-2xl font-bold text-foreground">{invitedCount}</p>
            <p className="text-xs text-muted-foreground">Friends Invited</p>
          </Card>
          <Card className="text-center">
            <Zap className="w-6 h-6 mx-auto text-amber-500 mb-2" />
            <p className="text-2xl font-bold text-foreground">{creditsEarned}</p>
            <p className="text-xs text-muted-foreground">Credits Earned</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
