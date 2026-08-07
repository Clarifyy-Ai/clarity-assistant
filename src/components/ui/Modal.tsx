import { type ReactNode } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "./dialog";

// ─────────────────────────────────────────────────────────────────
// Modal
// Accessible modal dialog — Radix Dialog with app styling.
// ─────────────────────────────────────────────────────────────────

interface ModalProps {
  open:       boolean;
  onClose:    () => void;
  title?:     string;
  children:   ReactNode;
  size?:      "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export function Modal({
  open, onClose, title, children, size = "md", className,
}: ModalProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent
        showClose={false}
        overlayClassName="z-[100] bg-black/60 backdrop-blur-sm"
        className={cn(
          "z-[100] w-full max-h-[min(90vh,720px)] p-0 gap-0 overflow-y-auto overflow-x-hidden",
          SIZES[size],
          className,
        )}
      >
        {title ? (
          <div className="flex items-center justify-between gap-3 px-6 pt-5 pb-4 border-b border-border shrink-0">
            <DialogTitle className="text-base font-semibold leading-snug text-foreground pr-2">
              {title}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close dialog"
              className="w-8 h-8 shrink-0 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="absolute right-4 top-4 z-10 w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors duration-150"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}

        <div className="p-6">{children}</div>
      </DialogContent>
    </Dialog>
  );
}
