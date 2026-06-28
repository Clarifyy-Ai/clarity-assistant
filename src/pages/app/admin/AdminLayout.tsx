import { useState } from "react";
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/authStore";
import {
  LayoutDashboard, Users, BarChart2,
  Flag, Shield, ChevronRight, DollarSign, Cpu,
  MessageSquare, FileText, Database, ScrollText, LifeBuoy,
  ExternalLink, Activity, ClipboardCheck, Upload, Menu, Tag, Settings2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppLoadingFallback } from "@/components/layout/AppLoadingFallback";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

const ADMIN_NAV: { to: string; icon: React.ElementType; label: string }[] = [
  { to: "/app/admin",               icon: LayoutDashboard, label: "Dashboard"     },
  { to: "/app/admin/users",         icon: Users,           label: "Users"         },
  { to: "/app/admin/analytics",     icon: BarChart2,       label: "Analytics"     },
  { to: "/app/admin/live-chat",     icon: MessageSquare,   label: "Live Chat"     },
  { to: "/app/admin/support",       icon: LifeBuoy,        label: "Support"       },
  { to: "/app/admin/audit-log",     icon: ScrollText,      label: "Audit Log"     },
  { to: "/app/admin/qa-checklist",  icon: ClipboardCheck,  label: "QA Checklist"  },
  { to: "/app/admin/questions",     icon: FileText,        label: "Questions"     },
  { to: "/app/admin/bulk-upload",  icon: Upload,          label: "Bulk Upload"   },
  { to: "/app/admin/seed-questions",icon: Database,        label: "Seed / Import" },
  { to: "/app/admin/feature-flags", icon: Flag,            label: "Feature Flags" },
  { to: "/app/admin/revenue",       icon: DollarSign,      label: "Revenue"       },
  { to: "/app/admin/promo-codes",   icon: Tag,             label: "Offers"        },
  { to: "/app/admin/billing-settings", icon: Settings2,   label: "Billing"       },
  { to: "/app/admin/model-costs",   icon: Cpu,             label: "Model Costs"   },
];

function AdminNavLinks({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <>
      {ADMIN_NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === "/app/admin"}
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all duration-150",
              isActive
                ? "bg-red-500/10 text-red-400"
                : "text-muted-foreground hover:text-foreground hover:bg-accent/5",
            )
          }
        >
          <item.icon className="w-4 h-4 shrink-0" aria-hidden="true" />
          {item.label}
        </NavLink>
      ))}
    </>
  );
}

export default function AdminLayout() {
  const { isAdmin, isProfileLoaded } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!isProfileLoaded) {
    return <AppLoadingFallback />;
  }

  if (!isAdmin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile header */}
      <header className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-border shrink-0">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="Open admin navigation"
              className="w-9 h-9 flex items-center justify-center rounded-lg border border-border hover:bg-secondary transition-colors duration-150"
            >
              <Menu className="w-5 h-5" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 p-0">
            <SheetHeader className="p-4 border-b border-border text-left">
              <SheetTitle className="flex items-center gap-2 text-sm">
                <Shield className="w-5 h-5 text-red-400" aria-hidden="true" />
                Admin
              </SheetTitle>
            </SheetHeader>
            <nav className="p-3 space-y-0.5" aria-label="Admin navigation">
              <AdminNavLinks onNavigate={() => setMobileOpen(false)} />
            </nav>
          </SheetContent>
        </Sheet>
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-red-400" aria-hidden="true" />
          <span className="text-sm font-semibold">Admin</span>
        </div>
      </header>

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-border flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" aria-hidden="true" />
            <span className="text-sm font-bold text-foreground">Admin</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Clarify AI control panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5" aria-label="Admin navigation">
          <AdminNavLinks />
        </nav>

        <div className="p-3 border-t border-border space-y-1">
          <NavLink
            to="/app/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ChevronRight className="w-3 h-3 rotate-180" aria-hidden="true" />
            Back to app
          </NavLink>
          <a
            href="/help"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors duration-150"
          >
            <ExternalLink className="w-3 h-3" aria-hidden="true" />
            Help docs
          </a>
        </div>
      </aside>

      <main className="flex-1 overflow-auto p-4 md:p-6">
        <Outlet />
      </main>
    </div>
  );
}
