import { useState, type FormEvent } from "react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PUBLIC_WEBSITE_URL, SALES_EMAIL } from "@/lib/constants/contact";
import { MARKETING_SHELL } from "@/lib/ui/responsivePage";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { cn } from "@/lib/utils";
import { Building2, Mail, Users } from "lucide-react";

const SALES_POINTS = [
  {
    icon: Users,
    title: "Team & volume pricing",
    body: "Pro, Max, and custom seat bundles for hiring teams and bootcamps.",
  },
  {
    icon: Building2,
    title: "Procurement-friendly",
    body: "Invoicing, security questionnaires, and rollout planning when you need it.",
  },
  {
    icon: Mail,
    title: "Direct reply",
    body: `Messages go to ${SALES_EMAIL} — no ticket queue.`,
  },
] as const;

export default function ContactSales() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailtoFallback, setMailtoFallback] = useState(false);

  usePageMeta({
    title: "Contact Sales · Career Pilot",
    description: "Talk to Career Pilot about Pro, Max, and team plans.",
    canonical: `${PUBLIC_WEBSITE_URL}/contact-sales`,
  });

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSending(true);
    setError(null);
    setMailtoFallback(false);
    try {
      await fetchEdgeJson("contact-sales", { name, email, company, message });
      setSent(true);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code === "NOT_CONFIGURED") {
        setMailtoFallback(true);
        setError("Email delivery is not configured on this deployment. Use the mailto link below.");
      } else {
        setError(err instanceof Error ? err.message : "Could not send your message.");
        setMailtoFallback(true);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <MarketingLayout>
      <div className={cn(MARKETING_SHELL, "px-4 py-12 sm:px-6 lg:py-16")}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 xl:gap-16 items-start">
          <div className="space-y-8 lg:sticky lg:top-24">
            <div className="space-y-3">
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground">
                Contact Sales
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
                Tell us about your team. We reply from{" "}
                <a href={`mailto:${SALES_EMAIL}`} className="text-primary font-medium hover:underline">
                  {SALES_EMAIL}
                </a>
                . Mailto is a fallback only.
              </p>
            </div>

            <ul className="space-y-4">
              {SALES_POINTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-3">
                  <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <Icon className="h-4 w-4" aria-hidden />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-foreground">{title}</p>
                    <p className="mt-1 text-sm text-muted-foreground leading-relaxed">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="w-full min-w-0">
            {sent ? (
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-4 text-sm">
                Message sent. We will reply to {email}.
              </div>
            ) : (
              <form
                onSubmit={(e) => void onSubmit(e)}
                className="rounded-2xl border border-border bg-card p-5 sm:p-6 space-y-4 shadow-sm"
              >
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Work email"
                  required
                />
                <Input
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                  placeholder="Company (optional)"
                />
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={10}
                  rows={6}
                  placeholder="What are you evaluating?"
                  className="w-full rounded-xl border border-input bg-background px-3 py-2 text-sm"
                />
                {error && (
                  <p className="text-sm text-destructive" role="alert">
                    {error}
                  </p>
                )}
                <Button type="submit" disabled={sending} className="w-full sm:w-auto">
                  {sending ? "Sending…" : "Send message"}
                </Button>
                {mailtoFallback && (
                  <p className="text-xs text-muted-foreground">
                    Or email{" "}
                    <a className="text-primary underline" href={`mailto:${SALES_EMAIL}`}>
                      {SALES_EMAIL}
                    </a>
                    .
                  </p>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </MarketingLayout>
  );
}
