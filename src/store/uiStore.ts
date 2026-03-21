import { create } from "zustand";
import { persist, subscribeWithSelector } from "zustand/middleware";

export type Theme = "dark" | "light" | "system";

interface UIStore {
  // Theme
  theme: Theme;
  resolved_theme: "dark" | "light";
  setTheme: (theme: Theme) => void;

  // Stealth mode (app-wide)
  stealth_mode: boolean;
  setStealthMode: (enabled: boolean) => void;
  toggleStealthMode: () => void;

  // Sidebar
  sidebar_collapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;

  // Mobile nav
  mobile_nav_open: boolean;
  setMobileNavOpen: (open: boolean) => void;

  // Global modals
  upgrade_modal_open: boolean;
  setUpgradeModalOpen: (open: boolean) => void;
  upgrade_modal_trigger: string | null;
  openUpgradeModal: (trigger?: string) => void;

  // Command palette
  command_palette_open: boolean;
  setCommandPaletteOpen: (open: boolean) => void;

  // Onboarding
  onboarding_checklist_dismissed: boolean;
  setOnboardingChecklistDismissed: (dismissed: boolean) => void;

  // Feature tour
  active_tour_step: string | null;
  setActiveTourStep: (step: string | null) => void;

  // Network banner
  show_network_banner: boolean;
  setShowNetworkBanner: (show: boolean) => void;
}

export const useUIStore = create<UIStore>()(
  persist(
    subscribeWithSelector((set) => ({
      // ── Theme ─────────────────────────────────────────────
      theme: "light",
      resolved_theme: "light",

      setTheme: (theme) => {
        const resolved =
          theme === "system"
            ? window.matchMedia("(prefers-color-scheme: dark)").matches
              ? "dark"
              : "light"
            : theme;
        set({ theme, resolved_theme: resolved });
      },

      // ── Stealth mode ────────────────────────────────────────
      stealth_mode: false,
      setStealthMode: (stealth_mode) => set({ stealth_mode }),
      toggleStealthMode: () => set((s) => ({ stealth_mode: !s.stealth_mode })),

      // ── Sidebar ───────────────────────────────────────────
      sidebar_collapsed: false,
      setSidebarCollapsed: (sidebar_collapsed) => set({ sidebar_collapsed }),
      toggleSidebar: () =>
        set((s) => ({ sidebar_collapsed: !s.sidebar_collapsed })),

      // ── Mobile nav ────────────────────────────────────────
      mobile_nav_open: false,
      setMobileNavOpen: (mobile_nav_open) => set({ mobile_nav_open }),

      // ── Upgrade modal ─────────────────────────────────────
      upgrade_modal_open: false,
      upgrade_modal_trigger: null,
      setUpgradeModalOpen: (open) =>
        set({ upgrade_modal_open: open, upgrade_modal_trigger: open ? null : null }),
      openUpgradeModal: (trigger = "generic") =>
        set({ upgrade_modal_open: true, upgrade_modal_trigger: trigger }),

      // ── Command palette ───────────────────────────────────
      command_palette_open: false,
      setCommandPaletteOpen: (command_palette_open) =>
        set({ command_palette_open }),

      // ── Onboarding ────────────────────────────────────────
      onboarding_checklist_dismissed: false,
      setOnboardingChecklistDismissed: (dismissed) =>
        set({ onboarding_checklist_dismissed: dismissed }),

      // ── Feature tour ──────────────────────────────────────
      active_tour_step: null,
      setActiveTourStep: (active_tour_step) => set({ active_tour_step }),

      // ── Network banner ────────────────────────────────────
      show_network_banner: false,
      setShowNetworkBanner: (show_network_banner) =>
        set({ show_network_banner }),
    })),
    {
      name: "confideq-ui",
      partialize: (s) => ({
        theme: s.theme,
        resolved_theme: s.resolved_theme,
        sidebar_collapsed: s.sidebar_collapsed,
        onboarding_checklist_dismissed: s.onboarding_checklist_dismissed,
        stealth_mode: s.stealth_mode,
      }),
    }
  )
);
