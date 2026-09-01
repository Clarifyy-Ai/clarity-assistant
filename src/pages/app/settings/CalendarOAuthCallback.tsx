import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { PageContent } from "@/components/layout/PageContent";
import { useCalendarSync } from "@/hooks/useCalendarSync";

/**
 * Google Calendar OAuth redirect target.
 * Exchanges ?code=&state= with the Edge Function using the existing Clarify AI session.
 * Never stores Google tokens in the browser.
 */
export default function CalendarOAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const calendar = useCalendarSync();
  const [message, setMessage] = useState("Completing Google Calendar authorization…");

  useEffect(() => {
    let cancelled = false;
    const oauthError = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");
    const code = searchParams.get("code");
    const state = searchParams.get("state");

    (async () => {
      const result = await calendar.completeOAuthCallback({
        code,
        state,
        error: oauthError,
        errorDescription,
      });
      if (cancelled) return;
      if (result.connected) {
        navigate("/app/settings/integrations?calendar=connected", { replace: true });
        return;
      }
      const q = new URLSearchParams();
      q.set("calendar", oauthError === "access_denied" ? "denied" : "error");
      if (result.code) q.set("code", result.code);
      navigate(`/app/settings/integrations?${q.toString()}`, { replace: true });
    })().catch(() => {
      if (!cancelled) {
        setMessage("Google Calendar authorization failed.");
        navigate("/app/settings/integrations?calendar=error", { replace: true });
      }
    });

    return () => {
      cancelled = true;
    };
    // Run once on mount with the callback query string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <PageContent className="max-w-lg py-16">
      <p className="text-sm text-muted-foreground" role="status">
        {message}
      </p>
    </PageContent>
  );
}
