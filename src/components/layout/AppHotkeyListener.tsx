import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { HotkeyId } from "@/lib/constants/hotkeys";
import { eventMatchesKeys } from "@/lib/overlay/hotkeyMatch";
import {
  comboToKeyArray,
  getEffectiveHotkeyCombo,
  loadHotkeyOverrides,
} from "@/lib/overlay/hotkeyOverrides";
import { useGlobalStore } from "@/store/globalStore";
import { useUIStore } from "@/store/uiStore";

const NAV_ROUTES: Partial<Record<HotkeyId, string>> = {
  GO_DASHBOARD: "/app/dashboard",
  GO_COACH: "/app/live",
  GO_ANSWERS: "/app/answers",
  OPEN_SETTINGS: "/app/settings",
  OPEN_NOTIFICATIONS: "/app/notifications",
};

const OVERLAY_IDS: HotkeyId[] = [
  "TOGGLE_OVERLAY",
  "TOGGLE_OVERLAY_ALIAS",
  "PANIC_CALM",
  "MINIMIZE_OVERLAY",
];

function isTypingTarget(e: KeyboardEvent): boolean {
  const target = e.target as HTMLElement | null;
  const tag = (target?.tagName ?? "").toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || Boolean(target?.isContentEditable);
}

/**
 * App-wide navigation shortcuts. Overlay combos are handled during a session
 * by OverlayKeyboardHandler; here we explain why they appear dead on other pages.
 */
export function AppHotkeyListener() {
  const navigate = useNavigate();

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isTypingTarget(e)) return;
      const overrides = loadHotkeyOverrides();

      for (const id of OVERLAY_IDS) {
        const keys = comboToKeyArray(getEffectiveHotkeyCombo(id, overrides));
        if (!eventMatchesKeys(e, keys)) continue;
        e.preventDefault();
        toast.info(
          "Overlay shortcuts work during an active Practice Coach or Mock Interview session. In Chrome, Ctrl+Shift+T reopens a closed tab and Ctrl+Shift+I opens DevTools — use the desktop app or remap in Settings.",
        );
        return;
      }

      for (const [id, path] of Object.entries(NAV_ROUTES) as Array<[HotkeyId, string]>) {
        const keys = comboToKeyArray(getEffectiveHotkeyCombo(id, overrides));
        if (!eventMatchesKeys(e, keys)) continue;
        e.preventDefault();
        navigate(path);
        return;
      }

      const themeKeys = comboToKeyArray(getEffectiveHotkeyCombo("TOGGLE_THEME", overrides));
      if (eventMatchesKeys(e, themeKeys)) {
        e.preventDefault();
        const { theme, setTheme } = useUIStore.getState();
        const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
        setTheme(next);
        return;
      }

      const sidebarKeys = comboToKeyArray(getEffectiveHotkeyCombo("TOGGLE_SIDEBAR", overrides));
      if (eventMatchesKeys(e, sidebarKeys)) {
        e.preventDefault();
        useUIStore.getState().toggleSidebar();
        return;
      }

      const helpKeys = comboToKeyArray(getEffectiveHotkeyCombo("HELP", overrides));
      if (eventMatchesKeys(e, helpKeys)) {
        e.preventDefault();
        navigate("/app/settings/hotkeys");
        return;
      }

      const searchKeys = comboToKeyArray(getEffectiveHotkeyCombo("SEARCH", overrides));
      if (eventMatchesKeys(e, searchKeys)) {
        e.preventDefault();
        useGlobalStore.getState().openCommandPalette();
        return;
      }
    }

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [navigate]);

  return null;
}
