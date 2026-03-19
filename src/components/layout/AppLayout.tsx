import { Outlet } from "react-router-dom";
import { AppSidebar } from "./AppSidebar";
import { AppTopBar } from "./AppTopBar";
import { MobileNav } from "./MobileNav";
import { NetworkBanner } from "./NetworkBanner";
import { UpgradeModal } from "@/components/billing/UpgradeModal";
import { SetupChecklist } from "./SetupChecklist";
import { useUIStore } from "@/store/uiStore";
import { useAuthStore } from "@/store/userStore";
import { cn } from "@/lib/utils";
import { useEffect } from "react";

/**
 * Main authenticated layout shell
 * Combines:
 * - Fixed sidebar (collapsible)
 * - Fixed top bar with credits/notifications
 * - Network status banner
 * - Main content area with responsive padding
 * - Mobile bottom navigation
 * - Billing modal
 */
export function AppLayout() {
  const { sidebar_collapsed: sidebarCollapsed } = useUIStore();
  const { profile } = useAuthStore();

  // Show setup checklist if onboarding incomplete
  const showSetupChecklist = profile && !profile.onboarding_completed;

  // Set up keyboard shortcuts for sidebar toggle
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd + B to toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === "b") {
        e.preventDefault();
        const uiStore = useUIStore();
        uiStore.toggleSidebar();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0a0a0f] to-[#1a1a2e] text-white">
      {/* Fixed Components */}
      <AppSidebar />
      <AppTopBar />
      <NetworkBanner />

      {/* Main Content Area */}
      <main
        className={cn(
          "transition-all duration-200 ease-in-out",
          "pt-16 pb-20 md:pb-0 min-h-screen", // pt-16 accounts for AppTopBar (h-14) + NetworkBanner
          sidebarCollapsed ? "md:ml-16" : "md:ml-56"
        )}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-4 md:px-6 lg:px-8 py-4 md:py-6">
          {/* Setup Checklist Banner */}
          {showSetupChecklist && (
            <div className="mb-6">
              <SetupChecklist />
            </div>
          )}

          {/* Page Content */}
          <div className="space-y-6">
            <Outlet />
          </div>
        </div>
      </main>

      {/* Mobile Navigation */}
      <MobileNav />

      {/* Billing Modal */}
      <UpgradeModal />
    </div>
  );
}

export default AppLayout;
