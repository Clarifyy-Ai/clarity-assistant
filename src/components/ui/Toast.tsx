import { useEffect } from "react";
import { CheckCircle, AlertCircle, Info, X } from "lucide-react";
import { useUIStore } from "@/store/uiStore";
import { cn } from "@/lib/utils";
import type { Toast as ToastType } from "@/types/user.types";

// ─────────────────────────────────────────────────────────────────
// ToastContainer
// Renders all active toasts from uiStore. Auto-dismisses.
// ─────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const { toasts, removeToast } = useUIStore();

  return (
    <div className="fixed bottom-6 right-4 z-[200] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <ToastItem
          key={toast.id}
          toast={toast}
          onDismiss={() => removeToast(toast.id)}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
}: {
  toast:     ToastType;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (toast.duration === 0) return;
    const t = setTimeout(onDismiss, toast.duration ?? 4000);
    return () => clearTimeout(t);
  }, [toast.id]);

  const config = {
    success: { icon: CheckCircle, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    error:   { icon: AlertCircle, color: "text-red-400",     bg: "bg-red-500/10 border-red-500/20"         },
    info:    { icon: Info,        color: "text-blue-400",    bg: "bg-blue-500/10 border-blue-500/20"       },
    warning: { icon: AlertCircle, color: "text-amber-400",   bg: "bg-amber-500/10 border-amber-500/20"     },
  }[toast.type];

  const Icon = config.icon;

  return (
    <div className={cn(
      "pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-xl border shadow-2xl text-sm",
      "backdrop-blur min-w-[280px] max-w-sm",
      "animate-in slide-in-from-right-5 fade-in duration-200",
      config.bg
    )}>
      <Icon className={cn("w-4 h-4 mt-0.5 shrink-0", config.color)} />
      <div className="flex-1">
        {toast.title && (
          <p className="font-semibold text-white text-xs mb-0.5">{toast.title}</p>
        )}
        <p className="text-gray-300 text-xs leading-relaxed">{toast.message}</p>
      </div>
      <button
        onClick={onDismiss}
        className="text-gray-500 hover:text-white transition-colors shrink-0"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
