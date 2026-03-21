import { Link } from "react-router-dom";
import { Bell, Zap, AlertTriangle } from "lucide-react";
import { useAuthStore } from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

export function AppTopBar() {
  const { profile } = useAuthStore();
  const notifStore  = useNotificationStore();
  const uiStore     = useUIStore();

  const credits = profile?.credits ?? 0;
  const isLow   = credits <= 2;
  const isEmpty = credits === 0;

  const initial = (
    profile?.full_name?.trim()?.[0] ??
    profile?.email?.trim()?.[0] ??
    "U"
  ).toUpperCase();

  return (
    <header className="sticky top-0 z-40 h-14 w-full flex-shrink-0 bg-[#0a0a0f]/95 backdrop-blur border-b border-white/[0.08] flex items-center justify-between px-4">

      {/* Left: breadcrumb portal target */}
      <div
        className="flex items-center gap-2"
        id="topbar-breadcrumb"
      />

      {/* Right */}
      <div className="flex items-center gap-3 ml-auto">

        {/* Credit meter */}
        <button
          type="button"
          onClick={() => uiStore.openUpgradeModal("pro")}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-semibold transition-all",
            isEmpty
              ? "bg-red-500/10 border-red-500/30 text-red-400 animate-pulse"
              : isLow
              ? "bg-amber-500/10 border-amber-500/30 text-amber-400"
              : "bg-white/[0.05] border-white/[0.10] text-gray-300 hover:bg-white/[0.10]"
          )}
        >
          {(isEmpty || isLow) ? (
            <AlertTriangle className="w-3.5 h-3.5" />
          ) : (
            <Zap className="w-3.5 h-3.5" />
          )}
          {credits} {credits === 1 ? "credit" : "credits"}
          {isEmpty && <span className="ml-1">· Upgrade</span>}
        </button>

        {/* Notification bell */}
        <Link
          to="/app/notifications"
          className="relative w-9 h-9 flex items-center justify-center rounded-xl hover:bg-white/[0.05] text-gray-400 hover:text-white transition-all"
        >
          <Bell className="w-4 h-4" />
          {notifStore.unread_count > 0 && (
            <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-violet-500 rounded-full ring-2 ring-[#0a0a0f]" />
          )}
        </Link>

        {/* Avatar */}
        <Link
          to="/app/profile"
          className="w-8 h-8 rounded-full bg-violet-700 flex items-center justify-center text-xs font-bold text-white hover:ring-2 hover:ring-violet-500 transition-all"
        >
          {initial}
        </Link>
      </div>
    </header>
  );
}
