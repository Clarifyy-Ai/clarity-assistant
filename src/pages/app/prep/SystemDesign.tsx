// @ts-nocheck
import { useState } from "react";
import { useCredits } from "@/hooks/useCredits";
import { useAuthStore } from "@/store/userStore";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import {
  Server, ChevronRight, Sparkles, Copy, Save, CheckCircle,
  AlertCircle, Network, Database, Globe, Shield,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase/client";

interface DesignTopic {
  id: string;
  title: string;
  category: string;
  difficulty: "medium" | "hard";
  prompt: string;
  keyAreas: string[];
}

const DESIGN_TOPICS: DesignTopic[] = [
  { id: "1",  title: "URL Shortener",           category: "Web",       difficulty: "medium", prompt: "Design a URL shortening service like bit.ly that can handle millions of URLs.", keyAreas: ["Hashing", "Database", "Caching", "Analytics"] },
  { id: "2",  title: "Chat System",             category: "Real-time", difficulty: "hard",   prompt: "Design a real-time chat system like Slack or WhatsApp supporting 1-on-1 and group messages.", keyAreas: ["WebSocket", "Message Queue", "Presence", "Storage"] },
  { id: "3",  title: "News Feed",               category: "Social",    difficulty: "hard",   prompt: "Design a social media news feed like Facebook or Twitter's home timeline.", keyAreas: ["Fan-out", "Ranking", "Caching", "Real-time updates"] },
  { id: "4",  title: "Rate Limiter",            category: "Infra",     difficulty: "medium", prompt: "Design a distributed rate limiter that can handle millions of requests per second.", keyAreas: ["Token bucket", "Sliding window", "Redis", "Distributed sync"] },
  { id: "5",  title: "File Storage Service",    category: "Storage",   difficulty: "hard",   prompt: "Design a file storage and sharing service like Google Drive or Dropbox.", keyAreas: ["Chunking", "Deduplication", "Sync", "Metadata DB"] },
  { id: "6",  title: "Search Autocomplete",     category: "Search",    difficulty: "medium", prompt: "Design a typeahead/autocomplete system for a search engine.", keyAreas: ["Trie", "Ranking", "Caching", "Data collection"] },
  { id: "7",  title: "Video Streaming Platform", category: "Media",    difficulty: "hard",   prompt: "Design a video streaming platform like YouTube or Netflix.", keyAreas: ["CDN", "Transcoding", "Adaptive bitrate", "Storage"] },
  { id: "8",  title: "Notification System",     category: "Infra",     difficulty: "medium", prompt: "Design a notification system that supports push, email, SMS, and in-app notifications.", keyAreas: ["Message queue", "Priority", "Rate limiting", "Templates"] },
  { id: "9",  title: "E-commerce Platform",     category: "Web",       difficulty: "hard",   prompt: "Design an e-commerce platform like Amazon with product catalog, cart, checkout, and order tracking.", keyAreas: ["Inventory", "Payment", "Search", "Recommendations"] },
  { id: "10", title: "Distributed Cache",       category: "Infra",     difficulty: "hard",   prompt: "Design a distributed caching system like Memcached or Redis cluster.", keyAreas: ["Consistent hashing", "Eviction", "Replication", "Partitioning"] },
  { id: "11", title: "Ride-Sharing Service",    category: "Real-time", difficulty: "hard",   prompt: "Design a ride-sharing service like Uber that matches drivers with riders in real-time.", keyAreas: ["Geo-indexing", "Matching", "ETA", "Pricing"] },
  { id: "12", title: "Web Crawler",             category: "Infra",     difficulty: "medium", prompt: "Design a web crawler that can crawl billions of web pages efficiently.", keyAreas: ["BFS/DFS", "Politeness", "Deduplication", "Distributed workers"] },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  Web: <Globe className="w-3.5 h-3.5" />,
  "Real-time": <Network className="w-3.5 h-3.5" />,
  Social: <Server className="w-3.5 h-3.5" />,
  Infra: <Shield className="w-3.5 h-3.5" />,
  Storage: <Database className="w-3.5 h-3.5" />,
  Search: <Globe className="w-3.5 h-3.5" />,
  Media: <Server className="w-3.5 h-3.5" />,
};

export default function SystemDesign() {
  const credits = useCredits();
  const { user } = useAuthStore();

  const [selected, setSelected]     = useState<string | null>(null);
  const [notes, setNotes]           = useState("");
  const [breakdown, setBreakdown]   = useState("");
  const [loading, setLoading]       = useState(false);
  const [saved, setSaved]           = useState(false);
  const [error, setError]           = useState<string | null>(null);

  const activeTopic = DESIGN_TOPICS.find((t) => t.id === selected);

  async function getAIBreakdown() {
    if (!activeTopic || !credits.canAfford("system_design")) return;
    setLoading(true);
    setError(null);
    setBreakdown("");

    const { success, error: deductErr } = await credits.deduct("system_design");
    if (!success) {
      setError(deductErr ?? "Failed to deduct credits");
      setLoading(false);
      return;
    }

    try {
      const EDGE_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;
      const input = `Topic: ${activeTopic.title}\n\nPrompt: ${activeTopic.prompt}\n\nKey areas: ${activeTopic.keyAreas.join(", ")}${notes ? `\n\nCandidate notes:\n${notes}` : ""}`;
      const res = await fetch(`${EDGE_BASE}/prep-tool`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({
          tool_id: "system_design",
          input,
        }),
      });

      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data = await res.json();
      setBreakdown(data.result ?? "Breakdown unavailable.");
    } catch (err) {
      await credits.refund("system_design");
      setBreakdown(getOfflineBreakdown(activeTopic));
      toast.info("Using offline breakdown — AI unavailable. Credit refunded.");
    }
    setLoading(false);
  }

  async function saveDesignNotes() {
    if (!user || !activeTopic || !notes.trim()) return;
    const { error: insertErr } = await supabase.from("answer_bank").insert({
      user_id: user.id,
      question_text: `System Design: ${activeTopic.title}`,
      answer_text: `${notes}\n\n--- AI Breakdown ---\n${breakdown}`,
      category: "System Design",
      source: "prep_lab",
    });
    if (insertErr) {
      toast.error("Failed to save — please try again");
      return;
    }
    setSaved(true);
    toast.success("Design notes saved to Answer Bank");
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="space-y-5 max-w-5xl">
      <PageHeader
        title="System Design"
        description="Practice system design interviews with AI-guided breakdowns"
      />

      <div className="flex flex-col lg:flex-row gap-5">
        <div className="lg:w-[320px] space-y-2 flex-shrink-0 max-h-[600px] overflow-y-auto pr-1">
          {DESIGN_TOPICS.map((topic) => (
            <button
              key={topic.id}
              onClick={() => { setSelected(topic.id); setBreakdown(""); setNotes(""); setError(null); setSaved(false); }}
              className={cn(
                "w-full text-left px-4 py-3 rounded-xl border transition-all",
                selected === topic.id
                  ? "bg-violet-600/10 border-violet-500/30"
                  : "bg-secondary/50 border-border hover:bg-secondary"
              )}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">{CATEGORY_ICONS[topic.category]}</span>
                  <span className="text-sm font-medium text-foreground">{topic.title}</span>
                </div>
                <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
              </div>
              <div className="flex items-center gap-2 mt-1.5 ml-6">
                <Badge variant="default" size="sm">{topic.category}</Badge>
                <Badge variant={topic.difficulty === "medium" ? "amber" : "red"} size="sm">
                  {topic.difficulty}
                </Badge>
              </div>
            </button>
          ))}
        </div>

        <div className="flex-1 space-y-4">
          {activeTopic ? (
            <>
              <Card>
                <h2 className="text-lg font-semibold text-foreground mb-2">{activeTopic.title}</h2>
                <p className="text-sm text-foreground leading-relaxed mb-4">{activeTopic.prompt}</p>
                <div className="flex flex-wrap gap-2">
                  {activeTopic.keyAreas.map((area) => (
                    <Badge key={area} variant="default" size="sm">{area}</Badge>
                  ))}
                </div>
              </Card>

              <Card>
                <p className="text-xs font-medium text-foreground mb-2">Your design notes</p>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Sketch your approach here — components, data flow, scaling strategy…"
                  rows={5}
                  className="w-full bg-background border border-input text-foreground placeholder:text-muted-foreground rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:border-ring focus:ring-1 focus:ring-ring transition-colors"
                />
              </Card>

              {error && (
                <Card className="border-red-500/20 bg-red-500/5">
                  <div className="flex items-center gap-2 text-red-400 text-sm">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                </Card>
              )}

              <div className="flex gap-3">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={getAIBreakdown}
                  disabled={loading || !credits.canAfford("system_design")}
                  loading={loading}
                  leftIcon={<Sparkles className="w-3.5 h-3.5" />}
                  fullWidth
                >
                  Get AI breakdown ({credits.costs.system_design} credits)
                </Button>
                {(notes.trim() || breakdown) && (
                  <Button
                    variant={saved ? "success" : "secondary"}
                    size="sm"
                    onClick={saveDesignNotes}
                    leftIcon={saved ? <CheckCircle className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
                  >
                    {saved ? "Saved!" : "Save"}
                  </Button>
                )}
              </div>

              {breakdown && (
                <Card className="border-violet-500/20 bg-violet-500/5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> AI Design Breakdown
                    </p>
                    <button
                      onClick={() => { navigator.clipboard.writeText(breakdown); toast.success("Copied!"); }}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{breakdown}</div>
                </Card>
              )}
            </>
          ) : (
            <Card className="text-center py-20">
              <Server className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
              <p className="text-muted-foreground text-sm">Select a system design topic</p>
              <p className="text-muted-foreground text-xs mt-1">Get AI-powered component breakdowns and scaling strategies</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function getOfflineBreakdown(topic: DesignTopic): string {
  return `## ${topic.title} — Design Breakdown (Offline)\n\n### 1. Requirements\n- Functional: Core features implied by the prompt\n- Non-functional: Scalability, availability, latency, consistency\n- Capacity estimation: Estimate reads/writes per second, storage needs\n\n### 2. High-Level Architecture\nKey components to consider: ${topic.keyAreas.join(", ")}\n\n### 3. Component Deep-Dive\nFor each component, discuss:\n- What technology/service would you use?\n- How does data flow between components?\n- What are the scaling strategies?\n\n### 4. Data Model\n- What tables/collections do you need?\n- What are the access patterns?\n- SQL vs NoSQL tradeoffs for this use case\n\n### 5. Scaling & Tradeoffs\n- Horizontal vs vertical scaling\n- Caching strategies (CDN, application cache, database cache)\n- CAP theorem tradeoffs for this system\n- What would you sacrifice and why?\n\n### 6. Monitoring & Reliability\n- Key metrics to monitor\n- Failure scenarios and mitigation\n- Data backup and recovery strategy`;
}
