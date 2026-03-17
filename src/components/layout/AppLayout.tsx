import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { MobileNav } from "./MobileNav";
import { NetworkBanner } from "./NetworkBanner";
import { ToastContainer } from "@/components/ui/Toast";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// AppLayout
// Shell used by all authenticated app pages.
// Sidebar + top bar + main content area + global modals.
// ─────────────────────────────────────────────────────────────────

export function AppLayout() {
  const { sidebarCollapsed } = useUIStore();

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-white">
      <AppSidebar />
      <AppTopBar />
      <NetworkBanner />

      <main
        className={cn(
          "transition-all duration-200 pt-14 pb-20 md:pb-0 min-h-screen",
          sidebarCollapsed ? "md:ml-16" : "md:ml-56"
        )}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <Outlet />
        </div>
      </main>

      <MobileNav />
      <ToastContainer />
      <UpgradeModal />
    </div>
  );
}
