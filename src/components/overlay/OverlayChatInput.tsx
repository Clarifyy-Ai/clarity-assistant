import { useState, useCallback } from "react";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils";

interface OverlayChatInputProps {
  onSubmit: (question: string) => void;
}

export function OverlayChatInput({ onSubmit }: OverlayChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
    setValue("");
  }, [value, onSubmit]);

  return (
    <div className="flex items-center gap-2 border-t border-white/8 px-3 py-2.5 shrink-0">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Type a question…"
        className="flex-1 bg-white/6 border border-white/10 text-white placeholder-muted-foreground/30 rounded-xl px-3 py-2 text-[13px] focus:outline-none focus:border-brand-400/40 transition-colors"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className={cn(
          "w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0",
          value.trim()
            ? "bg-brand-500/20 text-brand-300 hover:bg-brand-500/30"
            : "text-gray-600 cursor-not-allowed"
        )}
        title="Send message"
      >
        <Send className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
