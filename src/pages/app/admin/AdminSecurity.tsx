import SettingsSecurityConfig from "@/pages/app/settings/SettingsSecurityConfig";
import { AdminSectionDashboard } from "@/components/admin/AdminSectionDashboard";
import { SECURITY_QUICK_LINKS } from "@/lib/admin/adminSectionNav";
import { ShieldCheck, CheckCircle2, AlertTriangle, Wrench } from "lucide-react";

/** Admin shell wrapper for the security configuration checklist. */
export default function AdminSecurityPage() {
  const stats = [
    { id: "resolved", label: "Resolved fixes", value: "5", variant: "success" as const, icon: CheckCircle2, description: "Shipped in codebase" },
    { id: "manual", label: "Manual actions", value: "4", variant: "warning" as const, icon: Wrench, description: "Supabase Dashboard only" },
    { id: "review", label: "Review items", value: "2", variant: "default" as const, icon: AlertTriangle, description: "Needs periodic review" },
    { id: "panel", label: "Control type", value: "Checklist", icon: ShieldCheck, description: "Not live runtime diagnostics" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-foreground">Security</h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          Resolved fixes, manual Supabase actions, and review items — not live runtime diagnostics.
        </p>
      </div>

      <AdminSectionDashboard
        stats={stats}
        columns={4}
        quickLinks={SECURITY_QUICK_LINKS}
      />

      <SettingsSecurityConfig />
    </div>
  );
}
