import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import {
  LayoutDashboard, Users, BarChart2,
  Flag, Shield, ChevronRight, DollarSign, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileRow } from "@/types";

const ADMIN_NAV: { to: string; icon: React.ElementType; label: string }[] = [
  { to: "/app/admin",              icon: LayoutDashboard, label: "Dashboard"     },
  { to: "/app/admin/users",        icon: Users,           label: "Users"         },
  { to: "/app/admin/analytics",    icon: BarChart2,       label: "Analytics"     },
  { to: "/app/admin/feature-flags",icon: Flag,            label: "Feature Flags" },
  { to: "/app/admin/revenue",      icon: DollarSign,      label: "Revenue"       },
  { to: "/app/admin/model-costs",  icon: Cpu,             label: "Model Costs"   },
];

export default function AdminLayout() {
  const { profile } = useAuthStore();
  const p = profile as ProfileRow | null;

  if (!p?.is_admin) {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-background flex">

      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-400" />
            <span className="text-sm font-bold text-foreground">Admin</span>
          </div>
          <p className="text-[10px] text-muted-foreground mt-0.5">Clarify AI control panel</p>
        </div>

        <nav className="flex-1 p-3 space-y-0.5">
          {ADMIN_NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/app/admin"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm transition-all",
                  isActive
                    ? "bg-red-500/10 text-red-400"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
                )
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-border">
          <NavLink
            to="/app/dashboard"
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronRight className="w-3 h-3 rotate-180" />
            Back to app
          </NavLink>
        </div>
      </aside>

      {/* Content */}
      <main className="flex-1 overflow-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
