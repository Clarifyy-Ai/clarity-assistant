// src/components/overlay/OverlayChatInput.tsx
import { useState, useCallback } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayChatInputProps {
  onSubmit: (question: string) => void | Promise<void>;
}

export function OverlayChatInput({ onSubmit }: OverlayChatInputProps) {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSubmitting) return;

    try {
      setIsSubmitting(true);
      await onSubmit(trimmed);
      setValue("");
    } finally {
      setIsSubmitting(false);
    }
  }, [value, onSubmit, isSubmitting]);

  const canSubmit = !!value.trim() && !isSubmitting;

  return (
    <div
      className={cn(
        "shrink-0 z-10", // ✅ ensure it stays above scroll container edge overlays
        "flex items-center gap-2 border-t px-3 py-2.5 transition-colors duration-200",
        focused ? "border-indigo-500/20" : "border-white/[0.06]"
      )}
    >
      <div
        className={cn(
          "flex-1 flex items-center rounded-xl px-3 py-1.5 transition-all duration-200",
          "bg-white/[0.06] border", // slightly stronger than before to avoid “invisible input”
          focused
            ? "border-indigo-500/30 shadow-[0_0_0_1px_rgba(99,102,241,0.15)]"
            : "border-white/[0.10]"
        )}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={isSubmitting}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Ask a question…"
          className="flex-1 bg-transparent text-white/85 placeholder:text-white/25 text-[13px] focus:outline-none"
          aria-label="Chat message"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
        />
      </div>

      <button
        onClick={() => void handleSubmit()}
        disabled={!canSubmit}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0",
          canSubmit
            ? "bg-indigo-600/30 border border-indigo-500/30 text-indigo-300 hover:bg-indigo-600/45 hover:text-indigo-200"
            : "text-white/15 cursor-not-allowed bg-transparent"
        )}
        title="Send message"
        aria-label="Send message"
        type="button"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
