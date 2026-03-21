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
    <div className="flex items-center gap-1.5 border-t border-white/5 px-3 py-2">
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
          }
        }}
        placeholder="Type a question manually…"
        className="flex-1 bg-white/5 border border-white/5 text-white placeholder-muted-foreground/30 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-brand-400/30"
      />
      <button
        onClick={handleSubmit}
        disabled={!value.trim()}
        className={cn(
          "p-1.5 rounded-lg transition-all",
          value.trim()
            ? "text-brand-300 hover:bg-white/5"
            : "text-gray-600 cursor-not-allowed"
        )}
      >
        <Send className="w-3 h-3" />
      </button>
    </div>
  );
}
