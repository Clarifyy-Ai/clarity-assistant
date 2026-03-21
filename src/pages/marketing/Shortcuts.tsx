import { Link } from "react-router-dom";
import { Keyboard } from "lucide-react";
import { motion } from "framer-motion";

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
      { keys: [mod, "/"], description: "Toggle sidebar" },
      { keys: [mod, "1"], description: "Go to Dashboard" },
      { keys: [mod, "2"], description: "Go to Live Session" },
      { keys: [mod, "3"], description: "Go to Mock Practice" },
      { keys: [mod, "4"], description: "Go to Prep Lab" },
      { keys: [mod, "5"], description: "Go to Answer Bank" },
      { keys: [mod, ","], description: "Open Settings" },
    ],
  },
  {
    title: "Live Session",
    shortcuts: [
      { keys: ["Space"], description: "Request AI hint" },
      { keys: ["Esc"], description: "Dismiss current hint" },
      { keys: [mod, "M"], description: "Toggle microphone" },
      { keys: [mod, "Shift", "O"], description: "Toggle overlay visibility" },
      { keys: [mod, "Shift", "S"], description: "Take session snapshot" },
      { keys: [mod, "E"], description: "End session" },
    ],
  },
  {
    title: "Mock Practice",
    shortcuts: [
      { keys: ["Enter"], description: "Submit answer / Next question" },
      { keys: [mod, "R"], description: "Restart session" },
      { keys: [mod, "P"], description: "Pause / Resume timer" },
      { keys: [mod, "Shift", "F"], description: "Toggle fullscreen mode" },
      { keys: ["Tab"], description: "Switch between question and notes" },
    ],
  },
  {
    title: "Prep Lab",
    shortcuts: [
      { keys: [mod, "Enter"], description: "Run AI action (polish, analyze, etc.)" },
      { keys: [mod, "S"], description: "Save current work" },
      { keys: [mod, "Shift", "C"], description: "Copy output to clipboard" },
      { keys: [mod, "Z"], description: "Undo last edit" },
      { keys: [mod, "Shift", "Z"], description: "Redo last edit" },
    ],
  },
  {
    title: "General",
    shortcuts: [
      { keys: [mod, "Shift", "T"], description: "Toggle dark / light theme" },
      { keys: [mod, "Shift", "N"], description: "Open notifications" },
      { keys: [mod, "."], description: "Open keyboard shortcuts" },
      { keys: ["?"], description: "Show contextual help" },
    ],
  },
];

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-white/[0.08] border border-white/[0.12] text-[11px] font-mono font-medium text-gray-300">
      {children}
    </kbd>
  );
}

export default function Shortcuts() {
  return (
    <div className="min-h-screen bg-[#07070d] text-white overflow-x-hidden">
      <nav className="fixed top-0 inset-x-0 z-50 border-b border-white/[0.06] bg-[#07070d]/80 backdrop-blur-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-16">
          <Link to="/" className="flex items-center gap-2.5">
            <img src="/images/clarify-logo.png" alt="Clarify AI" className="h-8 w-auto" />
          </Link>
          <div className="hidden md:flex items-center gap-8 text-sm text-gray-400">
            <Link to="/pricing" className="hover:text-white transition-colors">Pricing</Link>
            <Link to="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link to="/help" className="hover:text-white transition-colors">Help</Link>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm text-gray-300 hover:text-white transition-colors hidden sm:inline-block">Log in</Link>
            <Link to="/signup" className="text-sm font-semibold px-5 py-2 rounded-xl bg-primary text-primary-foreground hover:opacity-90 transition-opacity">Get started free</Link>
          </div>
        </div>
      </nav>

      <section className="pt-36 pb-16 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Keyboard className="w-10 h-10 text-primary mx-auto mb-4" />
            <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight">Keyboard Shortcuts</h1>
            <p className="mt-4 text-lg text-gray-400">Navigate and control Clarify AI like a pro</p>
            <p className="mt-2 text-sm text-gray-500">
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
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] divide-y divide-white/[0.06] overflow-hidden">
                {category.shortcuts.map((shortcut, si) => (
                  <div key={si} className="flex items-center justify-between px-4 py-3 hover:bg-white/[0.02] transition-colors">
                    <span className="text-sm text-gray-300">{shortcut.description}</span>
                    <div className="flex items-center gap-1.5">
                      {shortcut.keys.map((key, ki) => (
                        <span key={ki} className="flex items-center gap-1">
                          <KeyBadge>{key}</KeyBadge>
                          {ki < shortcut.keys.length - 1 && <span className="text-gray-600 text-xs">+</span>}
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

      <footer className="border-t border-white/[0.06] py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-gray-600">
          <span>&copy; {new Date().getFullYear()} Clarify AI. All rights reserved.</span>
          <div className="flex gap-6">
            <Link to="/pricing" className="hover:text-gray-400 transition-colors">Pricing</Link>
            <Link to="/help" className="hover:text-gray-400 transition-colors">Help</Link>
            <Link to="/shortcuts" className="hover:text-gray-400 transition-colors">Shortcuts</Link>
            <Link to="/blog" className="hover:text-gray-400 transition-colors">Blog</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
