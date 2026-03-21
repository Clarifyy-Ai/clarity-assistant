// @ts-nocheck
import { NavLink, Outlet, Navigate } from "react-router-dom";
import { useAuthStore } from "@/store/userStore";
import {
  LayoutDashboard, Users, BarChart2,
  Settings, Flag, Shield, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// AdminLayout — protected admin shell
// ─────────────────────────────────────────────────────────────────

const ADMIN_NAV = [
  { to: "/admin/dashboard",  icon: LayoutDashboard, label: "Dashboard"    },
  { to: "/admin/users",      icon: Users,           label: "Users"        },
  { to: "/admin/analytics",  icon: BarChart2,       label: "Analytics"    },
  { to: "/admin/flags",      icon: Flag,            label: "Feature flags"},
  { to: "/admin/settings",   icon: Settings,        label: "Settings"     },
];

export default function AdminLayout() {
  const { profile } = useAuthStore();

  if (profile?.role !== "admin" && profile?.role !== "super_admin") {
    return <Navigate to="/app/dashboard" replace />;
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex">

      {/* Sidebar */}
      <aside className="w-52 shrink-0 border-r border-white/8 flex flex-col">
        <div className="p-4 border-b border-white/8">
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

        <div className="p-3 border-t border-white/8">
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
