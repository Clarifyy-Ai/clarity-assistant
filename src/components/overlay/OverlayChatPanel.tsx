import { useRef, useEffect, useState } from "react";
import { useOverlayStore } from "@/store/overlayStore";
import type { ChatMessage } from "@/store/overlayStore";
import { OverlayChatInput } from "./OverlayChatInput";
import { cn } from "@/lib/utils";
import { ChevronDown, StickyNote } from "lucide-react";

interface OverlayChatPanelProps {
  onSubmit: (question: string) => void;
}

export function OverlayChatPanel({ onSubmit }: OverlayChatPanelProps) {
  const chatHistory = useOverlayStore((s) => s.chat_history);
  const isGenerating = useOverlayStore((s) => s.is_chat_generating);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [padOpen, setPadOpen] = useState(false);
  const [padText, setPadText] = useState("");

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatHistory.length]);

  return (
    <div className="flex flex-col h-full min-h-0">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
        {chatHistory.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="w-10 h-10 rounded-full bg-brand-500/10 flex items-center justify-center mb-3">
              <svg className="w-5 h-5 text-brand-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
            </div>
            <p className="text-[13px] font-medium text-muted-foreground/70">Ask anything</p>
            <p className="text-[12px] text-muted-foreground/40 mt-1 max-w-[200px] leading-relaxed">
              Type a question to get AI-powered guidance during your interview.
            </p>
          </div>
        )}

        {chatHistory.map((msg, i) => (
          <ChatBubble key={i} message={msg} />
        ))}

        {isGenerating && (
          <div className="flex justify-start">
            <div className="max-w-[85%] px-3.5 py-2.5 rounded-2xl rounded-bl-sm bg-white/6 text-overlay-text">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" />
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "150ms" }} />
                <span className="w-2 h-2 rounded-full bg-brand-400 animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Scratch-pad notes */}
      <div className="border-t border-white/5 shrink-0">
        <button
          onClick={() => setPadOpen((p) => !p)}
          className="flex w-full items-center gap-1.5 px-3 py-1.5 text-[11px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors"
        >
          <StickyNote className="w-3 h-3" />
          <span className="font-semibold uppercase tracking-wide">Scratch-pad</span>
          <ChevronDown className={cn("w-3 h-3 ml-auto transition-transform", padOpen && "rotate-180")} />
        </button>
        {padOpen && (
          <textarea
            value={padText}
            onChange={(e) => setPadText(e.target.value)}
            placeholder="Quick notes — not saved, not sent to AI…"
            className="w-full px-3 pb-2 bg-transparent text-[12px] text-overlay-text placeholder:text-muted-foreground/25 resize-none focus:outline-none leading-relaxed"
            rows={4}
          />
        )}
      </div>

      <OverlayChatInput onSubmit={onSubmit} />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const time = new Date(message.timestamp);
  const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;

  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] px-3.5 py-2.5 rounded-2xl text-[13px] leading-relaxed",
          isUser
            ? "bg-indigo-600/25 text-indigo-100 rounded-br-sm border border-indigo-500/20"
            : "bg-white/6 text-overlay-text rounded-bl-sm border border-white/8"
        )}
      >
        <p className="whitespace-pre-wrap break-words">{message.text}</p>
        <p className={cn(
          "text-[11px] mt-1.5",
          isUser ? "text-indigo-300/40 text-right" : "text-muted-foreground/30"
        )}>
          {timeStr}
        </p>
      </div>
    </div>
  );
}
