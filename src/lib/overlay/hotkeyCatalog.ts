import {
  DEFAULT_HOTKEYS,
  type HotkeyId,
} from "@/lib/constants/hotkeys";
import { comboToKeyArray } from "@/lib/overlay/hotkeyOverrides";

export type OverlayHotkeyGroup =
  | "visibility"
  | "hints"
  | "actions"
  | "session"
  | "layout";

export interface OverlayHotkeyCatalogEntry {
  keys: string[];
  label: string;
  description: string;
  group: OverlayHotkeyGroup;
}

type CatalogSource = {
  id: HotkeyId;
  label: string;
  group: OverlayHotkeyGroup;
};

/** Overlay help rows — keys/descriptions always mirror DEFAULT_HOTKEYS. */
const OVERLAY_HELP_SOURCES: CatalogSource[] = [
  { id: "TOGGLE_OVERLAY", label: "Toggle overlay", group: "visibility" },
  { id: "TOGGLE_OVERLAY_ALIAS", label: "Toggle overlay (alt)", group: "visibility" },
  { id: "MINIMIZE_OVERLAY", label: "Minimize overlay", group: "visibility" },
  { id: "TOGGLE_STEALTH", label: "Discrete UI", group: "visibility" },
  { id: "INCREASE_OPACITY", label: "Increase opacity", group: "visibility" },
  { id: "DECREASE_OPACITY", label: "Decrease opacity", group: "visibility" },
  { id: "REQUEST_AI_ANSWER", label: "Generate answer", group: "hints" },
  { id: "CYCLE_HINT_STYLE", label: "Cycle hint style", group: "hints" },
  { id: "SCROLL_ANSWER_UP", label: "Scroll up", group: "hints" },
  { id: "SCROLL_ANSWER_DOWN", label: "Scroll down", group: "hints" },
  { id: "CLEAR_ANSWER", label: "Clear answer", group: "hints" },
  { id: "CAPTURE_CODING", label: "Screenshot + analyse", group: "actions" },
  { id: "PANIC_CALM", label: "Calm steps", group: "actions" },
  { id: "TOGGLE_MIC", label: "Mute / unmute", group: "session" },
  { id: "SHOW_HOTKEY_REFERENCE", label: "Hotkey help", group: "session" },
  { id: "DOCK_TOP_LEFT", label: "Dock top-left", group: "layout" },
  { id: "DOCK_TOP_RIGHT", label: "Dock top-right", group: "layout" },
  { id: "DOCK_BOTTOM_LEFT", label: "Dock bottom-left", group: "layout" },
  { id: "DOCK_BOTTOM_RIGHT", label: "Dock bottom-right", group: "layout" },
  { id: "DISMISS_HINT", label: "Dismiss", group: "layout" },
  { id: "EMERGENCY_HIDE", label: "Emergency hide", group: "layout" },
];

function entryFromDefault(source: CatalogSource): OverlayHotkeyCatalogEntry {
  const def = DEFAULT_HOTKEYS[source.id];
  return {
    keys: comboToKeyArray(def.keys),
    label: source.label,
    description: def.description,
    group: source.group,
  };
}

/**
 * Canonical overlay shortcut map for help, settings, and the toolbar cheat sheet.
 * Derived from DEFAULT_HOTKEYS so authenticated settings and public /shortcuts stay aligned.
 */
export function buildOverlayHotkeyCatalog(): OverlayHotkeyCatalogEntry[] {
  return OVERLAY_HELP_SOURCES.map(entryFromDefault);
}

export const OVERLAY_HOTKEY_CATALOG: OverlayHotkeyCatalogEntry[] =
  buildOverlayHotkeyCatalog();
