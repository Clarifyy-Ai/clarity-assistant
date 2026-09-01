import { useState, type FormEvent } from "react";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SALES_EMAIL } from "@/lib/constants/contact";
import { MARKETING_SHELL } from "@/lib/ui/responsivePage";
import { fetchEdgeJson } from "@/lib/network/fetchEdge";
import { cn } from "@/lib/utils";

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
      <div className={cn(MARKETING_SHELL, "px-4 py-12 sm:px-6")}>
        <h1 className="text-3xl font-bold tracking-tight">Contact Sales</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xl">
          Tell us about your team. We reply from {SALES_EMAIL}. Mailto is a fallback only.
        </p>

        {sent ? (
          <p className="mt-8 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm">
            Message sent. We will reply to {email}.
          </p>
        ) : (
          <form onSubmit={(e) => void onSubmit(e)} className="mt-8 max-w-lg space-y-4">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Work email"
              required
            />
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" />
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
            <Button type="submit" disabled={sending}>
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
    </MarketingLayout>
  );
}
