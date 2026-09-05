import type { AdminQuickLink } from "@/components/admin/AdminQuickLinks";
import {
  Activity,
  BarChart2,
  Flag,
  LifeBuoy,
  Mail,
  MessageSquare,
  ScrollText,
  Shield,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";

export const AUDIT_QUICK_LINKS: AdminQuickLink[] = [
  { id: "compliance", to: "/app/admin/compliance-logs", label: "Compliance Logs", description: "Auth & privacy events", icon: Shield },
  { id: "users", to: "/app/admin/users", label: "Users", description: "Account management", icon: Users },
  { id: "diagnostics", to: "/app/admin/diagnostics", label: "Diagnostics", description: "Runtime health checks", icon: Activity },
  { id: "security", to: "/app/admin/security", label: "Security", description: "Checklist & fixes", icon: ShieldCheck },
];

export const COMPLIANCE_QUICK_LINKS: AdminQuickLink[] = [
  { id: "audit", to: "/app/admin/audit-log", label: "Admin Audit Log", description: "Privileged admin actions", icon: ScrollText },
  { id: "security", to: "/app/admin/security", label: "Security", description: "Configuration checklist", icon: ShieldCheck },
  { id: "diagnostics", to: "/app/admin/diagnostics", label: "Diagnostics", description: "Platform health", icon: Activity },
  { id: "analytics", to: "/app/admin/analytics", label: "Analytics", description: "Usage & performance", icon: BarChart2 },
];

export const SUPPORT_QUICK_LINKS: AdminQuickLink[] = [
  { id: "live", to: "/app/admin/live-chat", label: "Live Support", description: "Reply to users", icon: MessageSquare },
  { id: "mail", to: "/app/admin/mail", label: "Mail", description: "hello@trycareerpilot.com", icon: Mail },
  { id: "users", to: "/app/admin/users", label: "Users", description: "Look up accounts", icon: Users },
  { id: "audit", to: "/app/admin/audit-log", label: "Audit Log", description: "Admin actions", icon: ScrollText },
];

export const MAIL_QUICK_LINKS: AdminQuickLink[] = [
  { id: "support", to: "/app/admin/support", label: "Support Threads", description: "Ticket queue", icon: LifeBuoy },
  { id: "live", to: "/app/admin/live-chat", label: "Live Support", description: "In-app chat", icon: MessageSquare },
  { id: "users", to: "/app/admin/users", label: "Users", description: "User lookup", icon: Users },
];

export const USERS_QUICK_LINKS: AdminQuickLink[] = [
  { id: "audit", to: "/app/admin/audit-log", label: "Audit Log", description: "Admin mutations", icon: ScrollText },
  { id: "support", to: "/app/admin/support", label: "Support", description: "Open threads", icon: LifeBuoy },
  { id: "finance", to: "/app/admin/finance", label: "Finance", description: "Billing overview", icon: Wallet },
  { id: "flags", to: "/app/admin/feature-flags", label: "Feature Flags", description: "Kill switches", icon: Flag },
];

export const SECURITY_QUICK_LINKS: AdminQuickLink[] = [
  { id: "compliance", to: "/app/admin/compliance-logs", label: "Compliance Logs", description: "Event trail", icon: Shield },
  { id: "audit", to: "/app/admin/audit-log", label: "Audit Log", description: "Admin actions", icon: ScrollText },
  { id: "diagnostics", to: "/app/admin/diagnostics", label: "Diagnostics", description: "Live checks", icon: Activity },
  { id: "analytics", to: "/app/admin/analytics", label: "Analytics", description: "Usage metrics", icon: BarChart2 },
];

export const FEATURE_FLAGS_QUICK_LINKS: AdminQuickLink[] = [
  { id: "diagnostics", to: "/app/admin/diagnostics", label: "Diagnostics", description: "Platform health", icon: Activity },
  { id: "analytics", to: "/app/admin/analytics", label: "Analytics", description: "Feature usage", icon: BarChart2 },
  { id: "users", to: "/app/admin/users", label: "Users", description: "Plans & access", icon: Users },
  { id: "security", to: "/app/admin/security", label: "Security", description: "Hardening checklist", icon: ShieldCheck },
];

export const COMMUNITY_QUICK_LINKS: AdminQuickLink[] = [
  { id: "audit", to: "/app/admin/audit-log", label: "Audit Log", description: "Moderation actions", icon: ScrollText },
  { id: "users", to: "/app/admin/users", label: "Users", description: "Member lookup", icon: Users },
  { id: "support", to: "/app/admin/support", label: "Support", description: "User reports", icon: LifeBuoy },
  { id: "analytics", to: "/app/admin/analytics", label: "Analytics", description: "Engagement", icon: BarChart2 },
];
