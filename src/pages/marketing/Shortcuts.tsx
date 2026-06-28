import { Link } from "react-router-dom";
import { Keyboard } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";

interface Shortcut {
  keys: string[];
  description: string;
}

interface ShortcutCategory {
  title: string;
  shortcuts: Shortcut[];
}

const isMac = typeof navigator !== "undefined" && /Mac/.test(navigator.userAgent);
const mod = isMac ? "\u2318" : "Ctrl";

const SHORTCUT_CATEGORIES: ShortcutCategory[] = [
  {
    title: "Navigation",
    shortcuts: [
      { keys: [mod, "K"], description: "Open command palette" },
      { keys: [mod, ","], description: "Open Settings" },
      { keys: [mod, "B"], description: "Toggle sidebar" },
    ],
  },
  {
    title: "Overlay Controls",
    shortcuts: [
      { keys: [mod, "Shift", "H"], description: "Toggle overlay minimize / restore (in-app)" },
      { keys: [mod, "Shift", "J"], description: "Minimize / restore overlay" },
      { keys: [mod, "Shift", "P"], description: "Show calm coaching steps" },
      { keys: [mod, "1"], description: "Dock overlay to top-left corner" },
      { keys: [mod, "2"], description: "Dock overlay to top-right corner" },
      { keys: [mod, "3"], description: "Dock overlay to bottom-left corner" },
      { keys: [mod, "4"], description: "Dock overlay to bottom-right corner" },
      { keys: [mod, "Shift", "/"], description: "Show hotkey reference" },
    ],
  },
  {
    title: "Practice Session",
    shortcuts: [
      { keys: [mod, "Shift", "M"], description: "Toggle microphone mute" },
      { keys: [mod, "Shift", "E"], description: "End session" },
      { keys: ["Esc"], description: "Dismiss hint or close panel" },
      { keys: [mod, "Shift", "Esc"], description: "End session and close overlay panels" },
    ],
  },
  {
    title: "AI Actions",
    shortcuts: [
      { keys: [mod, "Enter"], description: "Generate AI answer" },
      { keys: [mod, "Shift", "A"], description: "Request AI answer (global in desktop)" },
      { keys: [mod, "Shift", "C"], description: "Capture coding problem for AI analysis" },
      { keys: [mod, "Shift", "Y"], description: "Cycle hint style (Full → Short → Keywords)" },
      { keys: [mod, "Shift", "I"], description: "Get a quick AI hint" },
      { keys: [mod, "Shift", "R"], description: "Rephrase the current answer" },
      { keys: [mod, "Shift", "."], description: "Cycle through AI models" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: [mod, "Shift", "T"], description: "Toggle dark / light theme" },
      { keys: [mod, "Shift", "N"], description: "Open notifications" },
      { keys: ["?"], description: "Show contextual help" },
    ],
  },
];

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-secondary border border-border text-[11px] font-mono font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export default function Shortcuts() {
  usePageMeta({
    title: "Keyboard Shortcuts — Clarify AI",
    description: "Keyboard shortcuts for navigation, live sessions, mock practice, and settings in Clarify AI.",
  });

  return (
    <MarketingLayout>
      <section className="pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Keyboard className="w-10 h-10 text-primary mx-auto mb-4" />
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Keyboard Shortcuts</h1>
            <p className="mt-4 text-lg text-muted-foreground">Navigate and control Clarify AI like a pro</p>
            <p className="mt-2 text-sm text-muted-foreground/70">
              Showing shortcuts for {isMac ? "macOS" : "Windows/Linux"}
            </p>
          </motion.div>
        </div>
      </section>

      <section className="pb-24 px-6">
        <div className="max-w-2xl mx-auto space-y-10">
          {SHORTCUT_CATEGORIES.map((category, ci) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: ci * 0.05 }}
            >
              <h2 className="text-lg font-bold mb-4">{category.title}</h2>
              <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                {category.shortcuts.map((shortcut, si) => (
                  <div key={si} className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors">
                    <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <KeyBadge>{key}</KeyBadge>
                          {ki < shortcut.keys.length - 1 && <span className="text-muted-foreground/50 text-xs">+</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </section>
    </MarketingLayout>
  );
}
