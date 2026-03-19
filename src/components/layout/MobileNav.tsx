import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Mic,
  ClipboardList,
  FlaskConical,
  BarChart2,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// MobileNav
// Bottom tab bar for <768px only
// ─────────────────────────────────────────────────────────────────

const TABS = [
  { to: "/app", icon: LayoutDashboard, label: "Home", exact: true },
  { to: "/app/live", icon: Mic, label: "Live" },
  { to: "/app/mock", icon: ClipboardList, label: "Mock" },
  { to: "/app/prep", icon: FlaskConical, label: "Prep" },
  { to: "/app/analytics", icon: BarChart2, label: "Stats" },
];

export function MobileNav() {
  return (
    <nav className="fixed bottom-0 left-0 right-0 h-16 bg-[#0d0d14]/95 backdrop-blur border-t border-white/[0.08] z-40 flex items-center md:hidden">
      {TABS.map((tab) => {
        const Icon = tab.icon;

        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.exact}
            className={({ isActive }) =>
              cn(
                "flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium transition-all",
                isActive ? "text-violet-400" : "text-gray-600"
              )
            }
          >
            <Icon className="w-5 h-5" />
            {tab.label}
          </NavLink>
        );
      })}
    </nav>
  );
}
