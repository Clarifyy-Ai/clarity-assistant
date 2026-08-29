import { Navigate } from "react-router-dom";
import { Card } from "@/components/ui/Card";
import { ShieldCheck, ExternalLink, CheckCircle2, AlertTriangle, Database, Radio, Lock, Key } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/authStore";

const PROJECT_REF = "qzgvjrvtkwlzxpmlddkx";

type Status = "resolved" | "manual" | "review";

interface Item {
  id: string;
  title: string;
  status: Status;
  severity: "error" | "warn" | "info";
  description: string;
  steps?: string[];
  link?: { label: string; url: string };
  icon: React.ElementType;
}

const RESOLVED: Item[] = [
  {
    id: "rls-profiles",
    title: "RLS hardened on profiles, user_roles, referrals",
    status: "resolved",
    severity: "warn",
    description: "Re-scoped policies to authenticated role; self-elevation of admin/plan/credits/billing fields blocked via WITH CHECK.",
    icon: ShieldCheck,
  },
  {
    id: "edge-error-leak",
    title: "Edge function error messages sanitized",
    status: "resolved",
    severity: "warn",
    description: "analytics-dashboard, generate-hint, cancel-subscription, create-test, stripe-webhook now return generic 500s; details only in server logs.",
    icon: ShieldCheck,
  },
  {
    id: "admin-source-of-truth",
    title: "Admin check uses user_roles, not profiles flag",
    status: "resolved",
    severity: "warn",
    description: "requireAuth() in shared edge utils derives isAdmin from user_roles table.",
    icon: ShieldCheck,
  },
  {
    id: "deepgram-key",
    title: "Deepgram API key removed from client env",
    status: "resolved",
    severity: "warn",
    description: "Only server-side; tokens minted via deepgram-token edge function.",
    icon: ShieldCheck,
  },
];

const MANUAL: Item[] = [
  {
    id: "leaked-pw",
    title: "Enable Leaked Password Protection",
    status: "manual",
    severity: "warn",
    description: "Supabase Auth check against HaveIBeenPwned. Cannot be flipped via SQL.",
    steps: [
      "Open Auth → Providers → Email in the Supabase Dashboard",
      "Scroll to 'Password Settings'",
      "Toggle on 'Password HIBP Check' (Leaked Password Protection)",
      "Click Save",
    ],
    link: { label: "Auth Providers", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/providers` },
    icon: Lock,
  },
  {
    id: "pg-trgm",
    title: "Move pg_trgm extension out of public schema",
    status: "manual",
    severity: "warn",
    description: "Extensions in the public schema can clash with app objects. Move to a dedicated extensions schema.",
    steps: [
      "Open the SQL editor",
      "Run: CREATE SCHEMA IF NOT EXISTS extensions;",
      "Run: ALTER EXTENSION pg_trgm SET SCHEMA extensions;",
      "Add 'extensions' to the search_path of any function that uses trigram operators",
    ],
    link: { label: "SQL Editor", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new` },
    icon: Database,
  },
  {
    id: "realtime-auth",
    title: "Add channel authorization for Realtime",
    status: "manual",
    severity: "error",
    description: "realtime.messages has no RLS — any signed-in user could subscribe to another user's topic. Scope topic access by auth.uid().",
    steps: [
      "Open SQL editor",
      "Enable RLS: ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;",
      "Add a policy: CREATE POLICY \"users_own_topic\" ON realtime.messages FOR SELECT TO authenticated USING (topic LIKE 'user:' || auth.uid()::text || '%' OR topic LIKE 'room:%');",
      "Update client subscriptions to namespace topics by user id (e.g. user:<uid>:notifications)",
    ],
    link: { label: "SQL Editor", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new` },
    icon: Radio,
  },
  {
    id: "public-role-policies",
    title: "Re-scope remaining {public} role policies to {authenticated}",
    status: "manual",
    severity: "warn",
    description: "Many tables (sessions, documents, notifications, …) still have policies bound to the public role. auth.uid() = user_id is NULL-safe, but a single nullable user_id row would be world-readable.",
    steps: [
      "Audit each policy via Database → Policies",
      "For each user-scoped policy, re-create it with TO authenticated",
      "Ensure user_id columns are NOT NULL going forward",
    ],
    link: { label: "Database Policies", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/auth/policies` },
    icon: ShieldCheck,
  },
  {
    id: "secdef-grants",
    title: "Review SECURITY DEFINER function EXECUTE grants",
    status: "review",
    severity: "warn",
    description: "Several SECURITY DEFINER functions are executable by anon/authenticated. Confirm each is intentionally callable; otherwise REVOKE EXECUTE.",
    steps: [
      "List functions: SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.prosecdef AND n.nspname = 'public';",
      "For internal helpers, run: REVOKE EXECUTE ON FUNCTION public.<name>(<args>) FROM anon, authenticated;",
      "Keep EXECUTE only for RPCs intentionally called from the client",
    ],
    link: { label: "SQL Editor", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new` },
    icon: Key,
  },
  {
    id: "public-buckets",
    title: "Review public storage bucket listing",
    status: "review",
    severity: "warn",
    description: "Public buckets allow listing every object. If only direct URL access is intended, restrict the SELECT policy on storage.objects.",
    steps: [
      "Open Storage → Policies",
      "On each public bucket policy, scope SELECT to authenticated owners or remove the broad LIST capability",
    ],
    link: { label: "Storage", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/storage/buckets` },
    icon: Database,
  },
  {
    id: "request-metrics",
    title: "Restrict request_metrics INSERT to service role",
    status: "manual",
    severity: "warn",
    description: "Any authenticated user can insert metrics rows (WITH CHECK true) and pollute dashboards.",
    steps: [
      "Drop request_metrics_authed_insert",
      "Add a policy that only allows service_role inserts, or WITH CHECK (user_id = auth.uid())",
    ],
    link: { label: "SQL Editor", url: `https://supabase.com/dashboard/project/${PROJECT_REF}/sql/new` },
    icon: ShieldCheck,
  },
];

const sevColors = {
  error: "text-red-500 bg-red-500/10 border-red-500/20",
  warn: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  info: "text-blue-500 bg-blue-500/10 border-blue-500/20",
};

export default function SettingsSecurityConfig() {
  const isAdmin = useAuthStore((s) => s.isAdmin);

  if (!isAdmin) {
    return <Navigate to="/app/settings/security" replace />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-emerald-500" />
          Security configuration
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Read-only documentation. Checklist marks in this browser are not a
          production control and do not change server configuration.
        </p>
      </div>

      <Card>
        <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          Resolved in code ({RESOLVED.length})
        </h3>
        <div className="space-y-2">
          {RESOLVED.map((item) => (
            <div key={item.id} className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15">
              <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Manual Supabase Dashboard actions ({MANUAL.length})
          </h3>
          <span className="text-xs text-muted-foreground">
            Apply in the dashboard — this page does not mutate config
          </span>
        </div>

        <div className="space-y-3">
          {MANUAL.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-4"
              >
                <div className="flex items-start gap-3">
                  <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-semibold text-foreground">
                        {item.title}
                      </h4>
                      <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-medium uppercase tracking-wide", sevColors[item.severity])}>
                        {item.severity}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">{item.description}</p>

                    {item.steps && (
                      <ol className="mt-3 space-y-1 text-xs text-foreground/80 list-decimal list-inside">
                        {item.steps.map((step, i) => (
                          <li key={i} className="leading-relaxed">{step}</li>
                        ))}
                      </ol>
                    )}

                    {item.link && (
                      <div className="mt-3">
                        <a
                          href={item.link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:opacity-80"
                        >
                          {item.link.label}
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
