// @ts-nocheck
import { useState } from "react";
import { useAuthStore } from "@/store/userStore";
import { useCredits } from "@/hooks/useCredits";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { Zap, TrendingDown, RefreshCw, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase/client";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────
// SettingsCredits
// ─────────────────────────────────────────────────────────────────

const STRIPE_CONFIGURED =
  !!import.meta.env.VITE_STRIPE_PRICE_CREDITS_10;

const CREDIT_PACKS = [
  { id: "100",  amount: 100,  price: 4.99,  bonus: 0,     stripePriceId: import.meta.env.VITE_STRIPE_PRICE_CREDITS_100  },
  { id: "500",  amount: 500,  price: 19.99, bonus: 50,    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_CREDITS_500  },
  { id: "1000", amount: 1000, price: 34.99, bonus: 150,   popular: true, stripePriceId: import.meta.env.VITE_STRIPE_PRICE_CREDITS_1000 },
  { id: "5000", amount: 5000, price: 99.99, bonus: 1000,  stripePriceId: import.meta.env.VITE_STRIPE_PRICE_CREDITS_5000 },
];

const CREDIT_COSTS = [
  { action: "AI Hint",            cost: 2,   icon: "💡" },
  { action: "Mock session",       cost: 5,   icon: "🎤" },
  { action: "Live co-pilot",      cost: 3,   icon: "🚀" },
  { action: "Prep tool",          cost: 3,   icon: "🔧" },
  { action: "STAR polish",        cost: 2,   icon: "⭐" },
  { action: "Company brief",      cost: 8,   icon: "🏢" },
  { action: "Debrief generation", cost: 10,  icon: "🧠" },
  { action: "Cover letter",       cost: 5,   icon: "✉️" },
];

export default function SettingsCredits() {
  const { profile }  = useAuthStore();
  const credits      = useCredits();
  const [buying, setBuying] = useState<string | null>(null);

  const remaining = profile?.credits_remaining ?? 0;
  const monthly   = profile?.credits_monthly   ?? 50;
  const used      = monthly - remaining;
  const usedPct   = Math.min(100, (used / monthly) * 100);

  async function handleBuy(packId: string) {
    const pack = CREDIT_PACKS.find((p) => p.id === packId);
    if (!pack) return;

    if (!pack.stripePriceId) {
      toast.error("No Stripe price configured for this credit pack.");
      return;
    }

    setBuying(packId);
    try {
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: {
          price_id: pack.stripePriceId,
          success_url: `${window.location.origin}/app/settings/credits?success=1`,
          cancel_url: `${window.location.origin}/app/settings/credits`,
          mode: "payment",
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      } else {
        toast.error("Could not create checkout session.");
      }
    } catch {
      toast.error("Failed to start checkout. The checkout service may not be deployed yet.");
    } finally {
      setBuying(null);
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-lg font-bold text-white">Credits</h2>

      {/* Balance card */}
      <Card className="bg-gradient-to-r from-violet-600/10 to-blue-600/10 border-violet-500/20">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-gray-500 uppercase tracking-widest">
              Available credits
            </p>
            <p className="text-4xl font-black text-violet-400 mt-1">
              {remaining.toLocaleString()}
            </p>
            <p className="text-xs text-gray-500 mt-1">
              {used} of {monthly} monthly credits used
            </p>
          </div>
          <div className="w-10 h-10 bg-violet-600/20 rounded-xl flex items-center justify-center">
            <Zap className="w-5 h-5 text-violet-400" />
          </div>
        </div>
        <ProgressBar
          value={used}
          max={monthly}
          color={usedPct > 80 ? "red" : usedPct > 50 ? "amber" : "violet"}
          size="sm"
          className="mt-4"
        />
        {credits.isLow && (
          <div className="flex items-center gap-2 mt-3">
            <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
            <p className="text-xs text-amber-300">
              Running low — consider topping up
            </p>
          </div>
        )}
      </Card>

      {/* Credit packs */}
      <div>
        <h3 className="text-sm font-semibold text-white mb-3">Buy credit packs</h3>
        <div className="grid grid-cols-2 gap-3">
          {CREDIT_PACKS.map((pack) => (
            <Card
              key={pack.id}
              className={cn(
                "flex flex-col gap-3 relative",
                pack.popular && "border-violet-500/40 bg-violet-600/5"
              )}
            >
              {pack.popular && (
                <div className="absolute -top-2 right-3">
                  <Badge variant="violet" size="sm">Best value</Badge>
                </div>
              )}
              <div>
                <p className="text-xl font-black text-white">
                  {pack.amount.toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">credits</p>
                {pack.bonus > 0 && (
                  <p className="text-[10px] text-emerald-400 mt-0.5">
                    +{pack.bonus} bonus credits
                  </p>
                )}
              </div>
              <div className="flex items-center justify-between">
                <p className="text-lg font-bold text-white">${pack.price}</p>
                <Button
                  variant="secondary"
                  size="xs"
                  loading={buying === pack.id}
                  onClick={() => handleBuy(pack.id)}
                >
                  Buy
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Credit costs reference */}
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Info className="w-4 h-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-white">Credit costs</h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {CREDIT_COSTS.map((c) => (
            <div
              key={c.action}
              className="flex items-center justify-between p-2 bg-white/3 rounded-lg"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{c.icon}</span>
                <span className="text-xs text-gray-400">{c.action}</span>
              </div>
              <div className="flex items-center gap-1">
                <Zap className="w-2.5 h-2.5 text-violet-400" />
                <span className="text-xs font-bold text-violet-400">{c.cost}</span>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
