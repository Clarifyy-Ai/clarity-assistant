import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Tag, Copy, Check, ArrowRight } from "lucide-react";
import { LazyMotion, domAnimation, m } from "framer-motion";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import { toast } from "sonner";
import {
  formatPublicPromoExpiry,
  formatPublicPromoHeadline,
  loadPublicPromoOffers,
  type PublicPromoOffer,
} from "@/lib/billing/publicPromos";

type PublicOffersSectionProps = {
  className?: string;
  /** Compact layout for pricing page side-by-side with plans */
  compact?: boolean;
};

export function PublicOffersSection({ className, compact = false }: PublicOffersSectionProps) {
  const [offers, setOffers] = useState<PublicPromoOffer[] | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadPublicPromoOffers({ force: true }).then((rows) => {
      if (!cancelled) setOffers(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (offers === null) {
    return (
      <section
        id="offers"
        data-testid="public-offers-section"
        className={cn("px-4 sm:px-6", className)}
        aria-busy="true"
        aria-label="Loading offers"
      >
        <div className="max-w-4xl mx-auto rounded-2xl border border-border bg-card/40 h-28 animate-pulse" />
      </section>
    );
  }

  if (offers.length === 0) return null;

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      toast.success(`Copied ${code}`);
      window.setTimeout(() => setCopiedCode((prev) => (prev === code ? null : prev)), 2000);
    } catch {
      toast.error("Could not copy code — select and copy manually.");
    }
  }

  return (
    <section
      id="offers"
      data-testid="public-offers-section"
      className={cn("px-4 sm:px-6", className)}
    >
      <LazyMotion features={domAnimation} strict>
        <div className="max-w-4xl mx-auto">
          <m.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.45 }}
            className="text-center mb-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary mb-3">
              <Tag className="w-3.5 h-3.5" aria-hidden />
              Limited-time offers
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold">Save on Pro and Max</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-lg mx-auto leading-relaxed">
              Apply a promo code at checkout in Billing. Active admin offers are listed here — no sign-in required.
            </p>
          </m.div>

          <div
            className={cn(
              "grid gap-4",
              compact ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1 sm:grid-cols-2",
            )}
          >
            {offers.map((offer, i) => {
              const expiry = formatPublicPromoExpiry(offer.valid_until);
              return (
                <m.article
                  key={offer.code}
                  data-testid={`public-offer-${offer.code}`}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.4, delay: i * 0.06 }}
                  className="rounded-2xl border border-primary/25 bg-gradient-to-br from-primary/[0.06] to-card p-5 flex flex-col gap-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 text-left">
                      <p className="font-mono text-lg font-bold tracking-wide text-foreground">
                        {offer.code}
                      </p>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatPublicPromoHeadline(offer)}
                      </p>
                      {offer.description && (
                        <p className="text-xs text-muted-foreground/80 mt-1 leading-relaxed">
                          {offer.description}
                        </p>
                      )}
                      {expiry && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 mt-2">
                          {expiry}
                        </p>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="shrink-0 min-h-11"
                      data-testid={`public-offer-copy-${offer.code}`}
                      onClick={() => void copyCode(offer.code)}
                      leftIcon={
                        copiedCode === offer.code ? (
                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )
                      }
                    >
                      {copiedCode === offer.code ? "Copied" : "Copy"}
                    </Button>
                  </div>
                  <Link
                    to="/signup"
                    className="inline-flex items-center justify-center gap-2 text-sm font-semibold py-2.5 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity min-h-11"
                  >
                    Get started
                    <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </m.article>
              );
            })}
          </div>
        </div>
      </LazyMotion>
    </section>
  );
}
