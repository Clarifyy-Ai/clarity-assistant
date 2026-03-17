import {
  useState, useRef, useEffect,
  type ReactNode,
} from "react";
import { ChevronDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Dropdown / Select
// ─────────────────────────────────────────────────────────────────

interface DropdownOption {
  value:    string;
  label:    string;
  icon?:    ReactNode;
  disabled?: boolean;
}

interface DropdownProps {
  value:       string;
  options:     DropdownOption[];
  onChange:    (value: string) => void;
  placeholder?: string;
  label?:      string;
  disabled?:   boolean;
  className?:  string;
  fullWidth?:  boolean;
}

export function Dropdown({
  value,
  options,
  onChange,
  placeholder = "Select…",
  label,
  disabled,
  className,
  fullWidth = false,
}: DropdownProps) {
  const [open,   setOpen]   = useState(false);
  const containerRef        = useRef<HTMLDivElement>(null);
  const selected            = options.find((o) => o.value === value);

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div
      ref={containerRef}
      className={cn("relative", fullWidth && "w-full", className)}
    >
      {label && (
        <p className="text-xs font-medium text-gray-300 mb-1.5">{label}</p>
      )}

      {/* Trigger */}
      <button
        type="button"
        onClick={() => !disabled && setOpen((p) => !p)}
        disabled={disabled}
        className={cn(
          "flex items-center gap-2 px-3 py-2.5 bg-black/30 border border-white/10",
          "text-sm rounded-xl hover:border-white/20 transition-all",
          "focus:outline-none focus:border-violet-500",
          fullWidth  && "w-full justify-between",
          !selected  && "text-gray-500",
          selected   && "text-white",
          disabled   && "opacity-50 cursor-not-allowed"
        )}
      >
        <span className="flex items-center gap-2 truncate">
          {selected?.icon}
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "w-3.5 h-3.5 text-gray-500 shrink-0 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>

      {/* Menu */}
      {open && (
        <div className={cn(
          "absolute z-50 mt-1 bg-[#12121a] border border-white/15 rounded-xl shadow-2xl",
          "py-1 max-h-56 overflow-y-auto",
          fullWidth ? "left-0 right-0" : "min-w-[160px] left-0"
        )}>
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              disabled={opt.disabled}
              onClick={() => {
                if (!opt.disabled) {
                  onChange(opt.value);
                  setOpen(false);
                }
              }}
              className={cn(
                "w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors",
                "hover:bg-white/5",
                opt.value === value
                  ? "text-violet-300"
                  : "text-gray-300",
                opt.disabled && "opacity-40 cursor-not-allowed"
              )}
            >
              {opt.icon && <span>{opt.icon}</span>}
              <span className="flex-1 text-left truncate">{opt.label}</span>
              {opt.value === value && (
                <Check className="w-3.5 h-3.5 text-violet-400 shrink-0" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
