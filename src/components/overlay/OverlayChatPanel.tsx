// src/components/overlay/OverlayChatPanel.tsx
import { useRef, useEffect, useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import type { ChatMessage } from "@/store/overlayStore";
import { OverlayChatInput } from "./OverlayChatInput";
import { cn } from "@/lib/utils";
import { hybridSourceLabel } from "@/lib/hybrid/hybridSourceMeta";
import { ChevronDown, StickyNote, MessageSquare } from "lucide-react";

interface OverlayChatPanelProps {
  onSubmit: (question: string) => void;
}

export function OverlayChatPanel({ onSubmit }: OverlayChatPanelProps) {
  const chatHistory = useOverlayStore((s) => s.chat_history);
  const isGenerating = useOverlayStore((s) => s.is_chat_generating);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padText, setPadText] = useState("");

  // Always stay scrolled to bottom when messages change
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [chatHistory.length, isGenerating]);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages */}
      <div
        ref={scrollRef}
        className={cn(
          "flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5",
          "scroll-container"
        )}
      >
        {chatHistory.length === 0 && !isGenerating && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 border border-indigo-500/15 flex items-center justify-center mb-3 shadow-lg shadow-indigo-500/10">
              <MessageSquare className="w-5 h-5 text-indigo-400" />
            </div>
            <p className="text-[13px] font-semibold text-white/60">Ask your coach</p>
            <p className="text-[12px] text-white/25 mt-1 max-w-[200px] leading-relaxed">
              Get guidance about the current question, strategy, structure, or response.
            </p>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <ChatBubble key={`${msg.timestamp}-${i}`} message={msg} />
        ))}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="max-w-[80%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white/[0.05] border border-white/[0.07]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scratch-pad */}
      <div className="border-t border-white/[0.05] shrink-0">
        <button
          onClick={() => setPadOpen((p) => !p)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-[11px] text-white/25 hover:text-white/45 transition-colors"
          type="button"
        >
          <StickyNote className="w-3 h-3" />
          <span className="font-bold uppercase tracking-widest">Scratch‑pad</span>
          <ChevronDown
            className={cn(
              "w-3 h-3 ml-auto transition-transform duration-200",
              padOpen && "rotate-180"
            )}
          />
        </button>

        {padOpen && (
          <textarea
            value={padText}
            onChange={(e) => setPadText(e.target.value)}
            placeholder="Quick notes — not saved, not sent to AI…"
            className="w-full px-3 pb-2 bg-transparent text-[12px] text-white/65 placeholder:text-white/20 resize-none focus:outline-none leading-relaxed"
            rows={4}
          />
        )}
      </div>

      {/* Input (always visible) */}
      <OverlayChatInput onSubmit={onSubmit} />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const safeText = String(message.text ?? "");
  const time = new Date(message.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time
    .getMinutes()
    .toString()
    .padStart(2, "0")}`;

  return (
    <div className={cn("flex animate-fade-in", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isUser
            ? "bg-gradient-to-br from-indigo-600/30 to-primary/20 text-indigo-100 rounded-br-sm border border-indigo-500/20 shadow-sm shadow-indigo-500/10"
            : "bg-white/[0.05] text-white/80 rounded-bl-sm border border-white/[0.08]"
        )}
      >
        <p className="whitespace-pre-wrap break-words">
          {safeText || (message.pending ? "…" : "…")}
        </p>
        <p className={cn("text-[10px] mt-1.5", isUser ? "text-indigo-300/35 text-right" : "text-white/20")}>
          {timeStr}
          {!isUser && !message.pending && hybridSourceLabel(message.source) ? (
            <span className="ml-1.5 opacity-80">· {hybridSourceLabel(message.source)}</span>
          ) : null}
        </p>
      </div>
    </div>
  );
}
