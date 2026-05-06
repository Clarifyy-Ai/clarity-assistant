import { useState } from "react";
import { Link } from "react-router-dom";
import {
  BookOpen, HelpCircle, Keyboard, LayoutGrid,
  Search, ChevronDown, ChevronUp,
  Mic, ClipboardList, FlaskConical, Star, BarChart2,
  BookMarked, Building2, Users, GraduationCap,
  CheckCircle2, FileText, Upload, Play, BarChart,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { formatHotkeyLabel } from "@/lib/overlay/hotkeys";
import { OVERLAY_HOTKEYS } from "@/components/overlay/OverlayHotkeyHelp";
import { APP_VERSION, APP_LAST_UPDATED } from "@/lib/constants/version";

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "getting-started" | "faq" | "shortcuts" | "features";

// ─── Getting Started steps ───────────────────────────────────────────────────

const STEPS = [
  {
    number: 1,
    title: "Create your account",
    description:
      "Sign up with email or Google / GitHub. No credit card required on the free plan — you get 20 credits per month to explore everything.",
    icon: CheckCircle2,
    link: "/signup",
    linkLabel: "Sign up",
  },
  {
    number: 2,
    title: "Complete onboarding",
    description:
      "Tell us your role, experience level, and target companies. This personalises AI coaching specifically for your job search.",
    icon: FileText,
    link: "/onboarding",
    linkLabel: "Go to onboarding",
  },
  {
    number: 3,
    title: "Upload your resume",
    description:
      "Head to Documents and upload your CV. The AI uses it to tailor answers to your actual experience during live and mock sessions.",
    icon: Upload,
    link: "/app/documents",
    linkLabel: "Go to Documents",
  },
  {
    number: 4,
    title: "Run a live session",
    description:
      "Start a Live Co-Pilot session before your next interview. The invisible overlay will listen and surface real-time hints and suggested answers.",
    icon: Mic,
    link: "/app/live",
    linkLabel: "Start Live Co-Pilot",
  },
  {
    number: 5,
    title: "Practice with a mock interview",
    description:
      "Use Mock Interview to simulate a full interview loop with AI-generated questions, real-time feedback, and a detailed scorecard at the end.",
    icon: Play,
    link: "/app/mock",
    linkLabel: "Start Mock Interview",
  },
  {
    number: 6,
    title: "Review your scorecard",
    description:
      "After each session, open your scorecard in Sessions to see scores for clarity, STAR structure, specificity, and confidence — plus coaching notes.",
    icon: BarChart,
    link: "/app/sessions",
    linkLabel: "View Sessions",
  },
];

// ─── FAQ data ────────────────────────────────────────────────────────────────

interface FaqItem {
  id: string;
  q: string;
  a: string;
}

interface FaqCategory {
  title: string;
  slug: string;
  items: FaqItem[];
}

const FAQ_DATA: FaqCategory[] = [
  {
    title: "Getting Started",
    slug: "getting-started",
    items: [
      { id: "gs-1", q: "What is Clarify AI?", a: "Clarify AI is an AI-powered interview preparation platform that provides real-time coaching during live interviews, full mock simulations with analytics, and a suite of prep tools to help you land your dream job." },
      { id: "gs-2", q: "How do I create an account?", a: "Click 'Get started free' on the homepage. You can sign up with your email or use Google/GitHub OAuth. No credit card required for the free plan." },
      { id: "gs-3", q: "What happens after I sign up?", a: "You'll go through a quick onboarding flow where you set your role, experience level, and target companies. This helps personalize your AI coaching experience." },
      { id: "gs-4", q: "Is there a free plan?", a: "Yes! The free plan includes 20 credits per month, 3 live sessions, 5 mock sessions, and access to the STAR builder and answer bank." },
      { id: "gs-5", q: "How do I upload my resume?", a: "Go to Documents in the sidebar, then click 'Upload'. We accept PDF and DOCX files. Your resume is used by the AI to tailor answers to your actual experience." },
      { id: "gs-6", q: "What AI models are supported?", a: "We support GPT-4o, Claude 3.5 Sonnet, and Gemini 1.5 Pro. You can set a preferred model in Settings > Models, or enable smart routing to automatically pick the best model per question type." },
    ],
  },
  {
    title: "Live Co-Pilot",
    slug: "live-copilot",
    items: [
      { id: "lc-1", q: "How does the live interview assistant work?", a: "During a live interview, Clarify AI listens to the conversation and provides real-time suggested answers, talking points, and hints through an invisible overlay that's undetectable by screen sharing software." },
      { id: "lc-2", q: "Is the overlay really invisible to screen sharing?", a: "Yes. The stealth overlay uses compositor-layer separation, which means it sits above your screen content but is invisible to Zoom, Teams, Google Meet, and all screen capture tools." },
      { id: "lc-3", q: "How many credits does a live session use?", a: "Each AI hint during a live session costs 1 credit. The number of credits used depends on how many hints you request during the interview." },
      { id: "lc-4", q: "Can I customise what the overlay shows?", a: "Yes! Use Ctrl+Shift+Y to cycle between Full Answer, Short Hints, and Keywords-only modes. You can also dock the overlay to different corners using Ctrl+Shift+1-4." },
      { id: "lc-5", q: "What is Stealth Mode?", a: "Stealth Mode (Ctrl+Shift+S) switches the overlay to a minimal view and renames all UI labels to neutral terms, making the app look like a generic productivity tool on your screen." },
    ],
  },
  {
    title: "Mock Interviews",
    slug: "mock-interviews",
    items: [
      { id: "mi-1", q: "What types of mock interviews are available?", a: "We offer behavioral, technical, system design, and role-specific mock sessions. Each session includes AI-generated questions, real-time feedback, and a detailed scorecard." },
      { id: "mi-2", q: "How does scoring work?", a: "After each mock session, you receive a scorecard covering clarity, structure (STAR method usage), specificity, relevance, and confidence. Each area is scored and compared against your historical performance." },
      { id: "mi-3", q: "Can I practice with others?", a: "Yes! Practice Rooms allow you to create collaborative sessions where you and peers can practice together with shared scorecards and real-time coaching." },
      { id: "mi-4", q: "What are Mock Tests?", a: "Mock Tests are timed exam-style sessions using question banks. You can upload your own questions or pick from curated sets. Results include per-question analysis and revision lists." },
      { id: "mi-5", q: "Can I import my own questions?", a: "Yes. In Mock Tests, go to Import Questions to upload a CSV or paste questions directly. Your question bank is private and only visible to you." },
    ],
  },
  {
    title: "Credits & Billing",
    slug: "credits-billing",
    items: [
      { id: "cb-1", q: "How do credits work?", a: "Credits are the currency for AI-powered features. Each action (live hint, mock question, STAR polish, etc.) costs a specific number of credits. Credits refresh monthly based on your plan." },
      { id: "cb-2", q: "Can I buy extra credits?", a: "Yes! Credit packs are available for purchase anytime without changing your subscription plan. Packs come in 50, 150, and 500 credit bundles." },
      { id: "cb-3", q: "Do unused credits roll over?", a: "Monthly plan credits reset at the start of each billing cycle. However, credits purchased through credit packs do not expire." },
      { id: "cb-4", q: "How do I cancel my subscription?", a: "Go to Settings > Billing and click 'Cancel subscription'. Your plan will remain active until the end of the current billing period. You won't be charged again." },
      { id: "cb-5", q: "How do I view my credit usage?", a: "Go to Settings > Credits to see a breakdown of credit usage by feature, your remaining balance, and your monthly refresh date." },
    ],
  },
  {
    title: "Settings & Security",
    slug: "settings-security",
    items: [
      { id: "ss-1", q: "How do I change my password?", a: "Go to Settings > Security and use the change password form. You'll need to enter your current password and then your new password (minimum 8 characters)." },
      { id: "ss-2", q: "Can I use my own API keys?", a: "Yes! On Starter plans and above, you can bring your own API keys for OpenAI, Anthropic, or Google AI. When using your own keys, AI calls are billed directly to your provider account." },
      { id: "ss-3", q: "How do I delete my account?", a: "Go to Settings > Danger Zone and click 'Delete Account'. This will permanently remove all your data, sessions, and answers. This action cannot be undone." },
      { id: "ss-4", q: "How do I change my notification preferences?", a: "Go to Settings > Notifications to choose which email and in-app notifications you receive for session reminders, scorecard summaries, and platform updates." },
      { id: "ss-5", q: "Is my data private?", a: "Yes. Your sessions, answers, and documents are private by default and never shared. Review our privacy settings at Settings > Privacy." },
    ],
  },
];

// ─── Keyboard shortcuts ────────────────────────────────────────────────────────
// Sourced from OVERLAY_HOTKEYS (the canonical list used by OverlayHotkeyHelp)
// plus the app-level sidebar toggle shortcut.

interface ShortcutGroup {
  label: string;
  shortcuts: Array<{ keys: string[]; label: string; description: string }>;
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    label: "Overlay",
    shortcuts: OVERLAY_HOTKEYS,
  },
  {
    label: "App",
    shortcuts: [
      { keys: ["ctrl", "b"], label: "Toggle sidebar", description: "Expand or collapse the navigation sidebar" },
    ],
  },
];

// ─── Feature overview cards ───────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Mic,
    name: "Live Co-Pilot",
    description: "Real-time AI hints and suggested answers delivered through an invisible overlay during live interviews.",
    link: "/app/live",
  },
  {
    icon: ClipboardList,
    name: "Mock Interviews",
    description: "Full interview simulations with behavioral, technical, and system design questions — scored by AI.",
    link: "/app/mock",
  },
  {
    icon: FlaskConical,
    name: "Prep Lab",
    description: "STAR answer builder, response rephraser, coding hints, and system design coach all in one place.",
    link: "/app/prep",
  },
  {
    icon: BookMarked,
    name: "Answer Bank",
    description: "Save and organise your best answers so you can quickly load proven responses during live sessions.",
    link: "/app/answers",
  },
  {
    icon: GraduationCap,
    name: "Mock Tests",
    description: "Timed, exam-style tests with your own or curated question banks, revision lists, and analytics.",
    link: "/app/mock-test",
  },
  {
    icon: Users,
    name: "Practice Rooms",
    description: "Collaborative peer practice sessions with shared scorecards and real-time AI coaching.",
    link: "/app/rooms",
  },
  {
    icon: Building2,
    name: "Company Research",
    description: "AI-generated company profiles, culture notes, and likely interview questions for your target firms.",
    link: "/app/companies",
  },
  {
    icon: BarChart2,
    name: "Analytics",
    description: "Track score trends, credit usage, session frequency, and skill improvement over time.",
    link: "/app/analytics",
  },
];

// ─── Tab config ───────────────────────────────────────────────────────────────

const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "getting-started", label: "Getting Started", icon: BookOpen },
  { id: "faq",             label: "FAQ",             icon: HelpCircle },
  { id: "shortcuts",       label: "Shortcuts",       icon: Keyboard },
  { id: "features",        label: "Features",        icon: LayoutGrid },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function Guide() {
  const [activeTab, setActiveTab] = useState<Tab>("getting-started");
  const [faqSearch, setFaqSearch] = useState("");
  const [openFaqItems, setOpenFaqItems] = useState<Set<string>>(new Set());

  function toggleFaq(id: string) {
    setOpenFaqItems((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  const filteredFaq = faqSearch.trim()
    ? FAQ_DATA.map((cat) => ({
        ...cat,
        items: cat.items.filter(
          (item) =>
            item.q.toLowerCase().includes(faqSearch.toLowerCase()) ||
            item.a.toLowerCase().includes(faqSearch.toLowerCase())
        ),
      })).filter((cat) => cat.items.length > 0)
    : FAQ_DATA;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-2xl font-bold tracking-tight">Guide Hub</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-secondary/40 px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            v{APP_VERSION} · Updated {APP_LAST_UPDATED}
          </span>
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything you need to get the most out of Clarify AI — in one place.
        </p>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap gap-1 rounded-xl border border-border bg-secondary/30 p-1">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all",
                isActive
                  ? "bg-background text-foreground shadow-sm border border-border"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/10"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Getting Started ───────────────────────────────────────────────── */}
      {activeTab === "getting-started" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Follow these six steps to go from sign-up to reviewing your first scorecard.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {STEPS.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-sm font-bold">
                      {step.number}
                    </div>
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                      <Icon className="h-4 w-4" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{step.title}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{step.description}</p>
                  </div>
                  <Link
                    to={step.link}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    {step.linkLabel} <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── FAQ ──────────────────────────────────────────────────────────── */}
      {activeTab === "faq" && (
        <div className="space-y-6">
          {/* Search */}
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
            <input
              type="text"
              value={faqSearch}
              onChange={(e) => setFaqSearch(e.target.value)}
              placeholder="Search questions..."
              className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-secondary/50 border border-border text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:border-primary/40"
            />
          </div>

          {filteredFaq.length === 0 && (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-sm">No questions found for "{faqSearch}"</p>
            </div>
          )}

          {filteredFaq.map((category) => (
            <div key={category.slug}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {category.title}
              </h2>
              <div className="space-y-2">
                {category.items.map((item) => {
                  const isOpen = openFaqItems.has(item.id);
                  return (
                    <div key={item.id} className="rounded-xl border border-border bg-card overflow-hidden">
                      <button
                        onClick={() => toggleFaq(item.id)}
                        className="w-full flex items-center justify-between p-4 text-left hover:bg-secondary/40 transition-all"
                      >
                        <span className="text-sm font-medium pr-4">{item.q}</span>
                        {isOpen
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4">
                          <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Keyboard Shortcuts ────────────────────────────────────────────── */}
      {activeTab === "shortcuts" && (
        <div className="space-y-6">
          <p className="text-sm text-muted-foreground">
            All keyboard shortcuts available in Clarify AI, grouped by context.
            On macOS, <kbd className="rounded bg-secondary px-1.5 py-0.5 text-xs font-mono">⌃</kbd> is Cmd.
          </p>
          {SHORTCUT_GROUPS.map((group) => (
            <div key={group.label}>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-muted-foreground">
                {group.label}
              </h2>
              <div className="rounded-xl border border-border bg-card overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-secondary/30">
                      <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground w-2/5">Shortcut</th>
                      <th className="py-2.5 px-4 text-left text-xs font-medium text-muted-foreground">Action / Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.shortcuts.map((shortcut, i) => (
                      <tr
                        key={shortcut.label}
                        className={cn(
                          "transition-colors hover:bg-secondary/20",
                          i !== group.shortcuts.length - 1 && "border-b border-border"
                        )}
                      >
                        <td className="py-3 px-4">
                          <kbd className="rounded bg-secondary px-2 py-1 text-xs font-mono text-foreground">
                            {shortcut.keys.includes("1-4")
                              ? "⌃ ⇧ 1–4"
                              : formatHotkeyLabel(shortcut.keys)}
                          </kbd>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-medium">{shortcut.label}</span>
                          {shortcut.description && (
                            <span className="block text-xs text-muted-foreground mt-0.5">{shortcut.description}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Feature Overview ──────────────────────────────────────────────── */}
      {activeTab === "features" && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            A quick overview of every major feature in Clarify AI.
          </p>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div
                  key={feature.name}
                  className="rounded-xl border border-border bg-card p-5 flex flex-col gap-3 hover:border-primary/30 transition-colors"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-sm">{feature.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{feature.description}</p>
                  </div>
                  <Link
                    to={feature.link}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Try it <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
