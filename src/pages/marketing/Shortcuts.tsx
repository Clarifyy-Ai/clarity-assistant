import { Keyboard } from "lucide-react";
import { motion } from "framer-motion";
import { MarketingLayout } from "@/components/layout/MarketingLayout";
import { usePageMeta } from "@/hooks/usePageMeta";
import { getOrderedHotkeyCatalog, isMac } from "@/lib/constants/hotkeys";

function KeyBadge({ children }: { children: string }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-secondary border border-border text-[11px] font-mono font-medium text-muted-foreground">
      {children}
    </kbd>
  );
}

export default function Shortcuts() {
  const categories = getOrderedHotkeyCatalog();

  usePageMeta({
    title: "Keyboard Shortcuts — Career Pilot",
    description: "Keyboard shortcuts for navigation, live sessions, mock practice, and settings in Career Pilot.",
  });

  return (
    <MarketingLayout>
      <section className="pt-4 sm:pt-10 pb-14 sm:pb-16 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="text-center mb-8 sm:mb-10"
          >
            <Keyboard className="w-9 h-9 text-primary mx-auto mb-3" />
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Keyboard Shortcuts</h1>
            <p className="mt-3 text-base text-muted-foreground">Navigate and control Career Pilot like a pro</p>
            <p className="mt-1.5 text-sm text-muted-foreground/70">
              Showing shortcuts for {isMac() ? "macOS" : "Windows/Linux"}
            </p>
          </motion.div>

          <div className="space-y-8">
            {categories.map((category, ci) => (
              <motion.div
                key={category.category}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: ci * 0.05 }}
              >
                <h2 className="text-lg font-bold mb-3">{category.title}</h2>
                <div className="rounded-xl border border-border bg-card divide-y divide-border overflow-hidden">
                  {category.shortcuts.map((shortcut) => (
                    <div
                      key={shortcut.id}
                      className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40 transition-colors"
                    >
                      <span className="text-sm text-muted-foreground">{shortcut.description}</span>
                      <div className="flex items-center gap-1.5">
                        {shortcut.keys.map((key, ki) => (
                          <span key={`${shortcut.id}-${key}-${ki}`} className="flex items-center gap-1">
                            <KeyBadge>{key}</KeyBadge>
                            {ki < shortcut.keys.length - 1 && (
                              <span className="text-muted-foreground text-xs">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
    </MarketingLayout>
  );
}
