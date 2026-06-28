/** Shared copy for Practice Coach overlay install, OS settings, and troubleshooting. */

export const OVERLAY_VISIBILITY_WARNING =
  "The Practice Coach overlay is a normal on-screen window. It stays visible on screen share, recordings, and proctoring tools — not hidden from interviewers or viewers.";

export const OVERLAY_MOBILE_TOAST_TITLE = "Overlay stays visible";
export const OVERLAY_MOBILE_TOAST_BODY =
  "Anyone viewing your screen share or recording can see the assistant. Practice and mock sessions only.";

export type SetupChecklistItem = {
  id: string;
  title: string;
  detail: string;
  platforms?: ("web" | "desktop" | "mac" | "win" | "linux")[];
};

export const OVERLAY_SYSTEM_CHECKLIST: SetupChecklistItem[] = [
  {
    id: "browser",
    title: "Use a supported browser (web)",
    detail:
      "Chrome or Edge (recommended) on desktop. Safari and Firefox work for microphone-only sessions; system/tab audio capture requires Chromium.",
    platforms: ["web"],
  },
  {
    id: "mic-permission",
    title: "Allow microphone access",
    detail:
      "When prompted, choose Allow. If blocked: click the lock icon in the address bar → Site settings → Microphone → Allow, then reload.",
    platforms: ["web", "desktop"],
  },
  {
    id: "mic-os",
    title: "Select the correct input device (OS)",
    detail:
      "Windows: Settings → System → Sound → Input. macOS: System Settings → Sound → Input. Pick your headset or USB mic — not a disconnected virtual device.",
    platforms: ["mac", "win", "linux", "desktop"],
  },
  {
    id: "system-audio",
    title: "Enable system / tab audio (optional)",
    detail:
      "Open your meeting in a browser tab. When Clarify AI asks to share, select that tab and tick Share tab audio (Chrome/Edge). Without it, only your microphone is captured.",
    platforms: ["web"],
  },
  {
    id: "desktop-install",
    title: "Install the desktop app (optional)",
    detail:
      "Download the signed Clarify AI installer (.exe on Windows, .dmg on macOS, AppImage on Linux). Run the installer, allow microphone when prompted, and sign in with the same account.",
    platforms: ["desktop", "mac", "win", "linux"],
  },
  {
    id: "desktop-tray",
    title: "Desktop tray and window",
    detail:
      "The overlay runs as a floating always-on-top window (visible in screen share by design). Use the system tray icon to show or hide it. Closing the window hides to tray — use Quit from the tray menu to exit fully.",
    platforms: ["desktop"],
  },
  {
    id: "notifications",
    title: "Do not rely on Do Not Disturb for privacy",
    detail:
      "Focus modes and DND do not hide the overlay from others. If you share your screen, assume viewers can see coaching hints.",
    platforms: ["web", "desktop"],
  },
  {
    id: "hotkeys",
    title: "Learn overlay hotkeys",
    detail:
      "Ctrl+Shift+H toggles overlay minimize/restore in-app. See Settings → Keyboard shortcuts or /shortcuts for the full list.",
    platforms: ["web", "desktop"],
  },
];

export type TroubleshootingItem = {
  id: string;
  problem: string;
  fixes: string[];
};

export const OVERLAY_TROUBLESHOOTING: TroubleshootingItem[] = [
  {
    id: "no-mic",
    problem: "Microphone access denied or no audio detected",
    fixes: [
      "Reload the page and click Allow when the browser prompts.",
      "Check OS privacy settings: Windows Privacy → Microphone; macOS Privacy & Security → Microphone → enable your browser or Clarify AI.",
      "Unplug/replug USB headsets; close other apps that may hold the mic exclusively.",
      "Run the mic test under Settings → Audio & speech.",
    ],
  },
  {
    id: "no-tab-audio",
    problem: "Interviewer audio not transcribed (mic-only mode)",
    fixes: [
      "Enable System Audio in session setup before starting.",
      "When the share picker opens, select the meeting browser tab — not Entire screen.",
      "Tick Share tab audio (Chrome/Edge). The checkbox is easy to miss.",
      "Keep the meeting in a browser tab, not the desktop Zoom/Teams app, for tab-audio capture.",
    ],
  },
  {
    id: "overlay-hidden",
    problem: "Overlay disappeared during a session",
    fixes: [
      "Press Ctrl+Shift+H or click Show Overlay / Restore Overlay at the bottom-right.",
      "Desktop app: click the tray icon → Show Clarify AI.",
      "Check you did not minimize the browser window on web — the overlay lives inside the tab.",
    ],
  },
  {
    id: "overlay-lag",
    problem: "Slow hints or laggy transcript",
    fixes: [
      "Use a stable connection; Practice Coach needs low latency to Deepgram and AI APIs.",
      "Close heavy browser tabs and disable VPNs that add latency.",
      "Switch to Gemini Flash in session setup for faster responses.",
    ],
  },
  {
    id: "desktop-hotkey",
    problem: "Global hotkey Ctrl+Shift+A does nothing (desktop)",
    fixes: [
      "Another app may have registered the same shortcut — quit conflicting tools or change their bindings.",
      "Restart Clarify AI after install so global shortcuts register cleanly.",
    ],
  },
  {
    id: "mobile-limit",
    problem: "Practice Coach on phone or tablet",
    fixes: [
      "The full floating overlay is designed for desktop. Mobile browsers can start a session but screen space and tab-audio capture are limited.",
      "For mock practice on mobile, use Mock Interview instead of the live overlay.",
      "Remember: if you mirror or share your phone screen, the overlay remains visible to viewers.",
    ],
  },
];

export const DESKTOP_INSTALL_STEPS = [
  "Download the installer for your OS from the Clarify AI website or release page.",
  "Windows: run the .exe, choose install location if prompted, finish the NSIS wizard.",
  "macOS: open the .dmg, drag Clarify AI to Applications, first launch → Open anyway if Gatekeeper warns (signed builds only).",
  "Linux: mark the AppImage executable (chmod +x) and run it, or integrate via your distro's AppImage launcher.",
  "Sign in with your Clarify AI account; allow microphone access when the app requests it.",
  "Open Practice Coach from the app menu or navigate to the live session route after login.",
];
