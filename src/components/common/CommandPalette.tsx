// Sprint C: Global command palette (Ctrl+K / ⌘K)

import { useEffect, useState, useCallback, useMemo, useRef } from "react";

import { useNavigate } from "react-router-dom";

import {

  CommandDialog,

  CommandInput,

  CommandList,

  CommandEmpty,

  CommandGroup,

  CommandItem,

  CommandSeparator,

} from "@/components/ui/command";

import {

  Home, BarChart2, FlaskConical, FileText, BookOpen, Settings,

  User, Bell, Mic, Brain, Calendar, Sparkles, Lock, CreditCard,

  CalendarDays, Building2, Gift, History, Trash2, Shield, ScrollText, Tag,
  Mail,

} from "lucide-react";

import { usePrivateMode } from "@/hooks/usePrivateMode";

import { PRODUCT_NAMES } from "@/lib/constants/productNames";

import { COMMUNITY_MODULE_LABEL } from "@/lib/community/moderation";

import { useUIStore } from "@/store/uiStore";

import { useIndiaRegion } from "@/hooks/useIndiaRegion";

import { useGlobalStore } from "@/store/globalStore";

import { useAuthStore } from "@/store/authStore";

import type { FeatureFlagId } from "@/types";

import {

  addRecentSearch,

  clearRecentSearches,

  getRecentSearches,

  paletteGroupOrder,
} from "@/lib/search/commandPaletteStorage";



interface NavCommand {

  label: string;

  keywords?: string;

  path: string;

  icon: React.ComponentType<{ className?: string }>;

  group: "Navigate" | "Sessions" | "Prep" | "Account" | "Admin";

  featureFlag?: FeatureFlagId;

  /** When true, only shown to resolved admin users. */
  adminOnly?: boolean;
}

const MAX_SEARCH_LENGTH = 200;
const SAFE_SEARCH_TEXT = /^[\p{L}\p{N}\s.,:;!?&()'"/+#_-]*$/u;

const COMMANDS: NavCommand[] = [

  { label: PRODUCT_NAMES.dashboard, path: "/app/dashboard", icon: Home, group: "Navigate", keywords: "home" },

  { label: PRODUCT_NAMES.creditsUsage, path: "/app/usage", icon: CreditCard, group: "Navigate", keywords: "billing credits usage" },

  { label: PRODUCT_NAMES.analytics, path: "/app/analytics", icon: BarChart2, group: "Navigate", featureFlag: "analytics" },

  { label: "Notifications", path: "/app/notifications", icon: Bell, group: "Navigate" },

  { label: PRODUCT_NAMES.interviewDay, path: "/app/interview-day", icon: CalendarDays, group: "Navigate", keywords: "planner schedule" },

  { label: PRODUCT_NAMES.interviews, path: "/app/interviews", icon: Calendar, group: "Navigate", keywords: "scheduled", featureFlag: "calendar_sync" },

  { label: PRODUCT_NAMES.companyResearch, path: "/app/companies", icon: Building2, group: "Navigate", keywords: "research company", featureFlag: "company_research" },

  { label: PRODUCT_NAMES.referrals, path: "/app/referrals", icon: Gift, group: "Navigate", keywords: "invite reward" },

  { label: "Profile", path: "/app/settings/profile", icon: User, group: "Account" },

  { label: "Settings", path: "/app/settings", icon: Settings, group: "Account" },

  { label: "Billing", path: "/app/settings/billing", icon: CreditCard, group: "Account", keywords: "subscription plan credits payment" },

  { label: PRODUCT_NAMES.practiceCoach, path: "/app/live", icon: Mic, group: "Sessions", keywords: "sessions overlay live coach", featureFlag: "overlay" },

  { label: PRODUCT_NAMES.mockInterview, path: "/app/mock", icon: FlaskConical, group: "Sessions", keywords: "sessions mock interview", featureFlag: "mock_sessions" },

  { label: PRODUCT_NAMES.govExams, path: "/app/mock-test", icon: Brain, group: "Sessions", keywords: "sessions exam gov test" },

  { label: PRODUCT_NAMES.sessionHistory, path: "/app/sessions", icon: Calendar, group: "Sessions", keywords: "sessions history calls" },

  { label: PRODUCT_NAMES.debrief, path: "/app/debriefs", icon: Sparkles, group: "Sessions", keywords: "sessions debriefs feedback" },

  { label: "Learning Hub", path: "/app/learn", icon: BookOpen, group: "Prep", keywords: "learn courses preview" },

  { label: COMMUNITY_MODULE_LABEL, path: "/app/community", icon: BookOpen, group: "Prep", keywords: "community questions answers qa" },

  { label: "Coding lab", path: "/app/coding", icon: FlaskConical, group: "Prep", keywords: "coding assessment lab", featureFlag: "coding_hints" },

  { label: "Document library", path: "/app/library", icon: FileText, group: "Prep", keywords: "library files documents" },

  { label: "Practice workspace", path: "/app/practice-workspace", icon: BookOpen, group: "Prep", keywords: "workspace practice" },

  { label: "Assessments", path: "/app/assessments", icon: Brain, group: "Sessions", keywords: "sessions assessment" },

  { label: "Question bank", path: "/app/question-bank", icon: FileText, group: "Prep", keywords: "questions bank" },

  { label: "Practice plan", path: "/app/plan", icon: BookOpen, group: "Navigate", keywords: "plan schedule" },

  { label: PRODUCT_NAMES.prepLab, path: "/app/prep", icon: BookOpen, group: "Prep", keywords: "prep lab tools" },

  { label: "STAR builder", path: "/app/prep/star-builder", icon: BookOpen, group: "Prep", keywords: "prep star behavioral" },

  { label: "Project builder", path: "/app/prep/project-builder", icon: BookOpen, group: "Prep", keywords: "prep project" },

  { label: "Rephraser", path: "/app/prep/rephraser", icon: BookOpen, group: "Prep", keywords: "prep rephrase rewrite" },

  { label: "System design", path: "/app/prep/system-design", icon: BookOpen, group: "Prep", keywords: "prep system design" },

  { label: "Coding hints", path: "/app/prep/coding-hints", icon: BookOpen, group: "Prep", keywords: "prep coding hints", featureFlag: "coding_hints" },

  { label: "Guide", path: "/app/guide", icon: BookOpen, group: "Navigate", keywords: "guide help how to" },

  { label: "Practice Coach guide", path: "/app/guide/practice-coach", icon: BookOpen, group: "Navigate", keywords: "prep guide overlay coach" },

  { label: PRODUCT_NAMES.documents, path: "/app/documents", icon: FileText, group: "Prep" },

  { label: PRODUCT_NAMES.answerBank, path: "/app/answers", icon: BookOpen, group: "Prep", featureFlag: "answer_bank" },

  // Admin destinations (adminOnly) — align Global Search with sidebar + direct routes
  { label: "Admin dashboard", path: "/app/admin", icon: Shield, group: "Admin", keywords: "admin portal home", adminOnly: true },
  { label: "Admin users", path: "/app/admin/users", icon: User, group: "Admin", keywords: "admin users", adminOnly: true },
  { label: "Admin revenue", path: "/app/admin/revenue", icon: CreditCard, group: "Admin", keywords: "admin billing revenue mrr", adminOnly: true },
  { label: "Admin questions", path: "/app/admin/questions", icon: FileText, group: "Admin", keywords: "admin question bank editor", adminOnly: true },
  { label: "Admin audit log", path: "/app/admin/audit-log", icon: ScrollText, group: "Admin", keywords: "admin audit", adminOnly: true },
  { label: "Admin diagnostics", path: "/app/admin/diagnostics", icon: Shield, group: "Admin", keywords: "admin diagnostics health", adminOnly: true },
  { label: "Admin mail", path: "/app/admin/mail", icon: Mail, group: "Admin", keywords: "admin mail inbox hostinger hello", adminOnly: true },
  { label: "Admin blog", path: "/app/admin/blog", icon: FileText, group: "Admin", keywords: "admin blog cms", adminOnly: true },
  { label: "Admin help articles", path: "/app/admin/help-articles", icon: BookOpen, group: "Admin", keywords: "admin help cms faq", adminOnly: true },
  { label: "Admin promo codes", path: "/app/admin/promo-codes", icon: Tag, group: "Admin", keywords: "admin promo coupon credits", adminOnly: true },
  { label: "Admin gov exams", path: "/app/admin/gov/exams", icon: Brain, group: "Admin", keywords: "admin gov exam registry", adminOnly: true },
  { label: "Admin gov sources", path: "/app/admin/gov/sources", icon: FileText, group: "Admin", keywords: "admin gov sources", adminOnly: true },
  { label: "Admin PDF ingest", path: "/app/admin/gov/ingest", icon: FileText, group: "Admin", keywords: "admin gov pdf ocr ingest", adminOnly: true },
  { label: "Admin paper factory", path: "/app/admin/gov/paper-factory", icon: FileText, group: "Admin", keywords: "admin gov paper factory plan generate", adminOnly: true },

];



function resetCmdkListScroll() {
  requestAnimationFrame(() => {
    const list = document.querySelector("[cmdk-list]");
    if (list instanceof HTMLElement) list.scrollTop = 0;
  });
}

export function CommandPalette() {

  const open = useUIStore((s) => s.command_palette_open);

  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const [query, setQuery] = useState("");

  const [debouncedQuery, setDebouncedQuery] = useState("");

  const [isSearching, setIsSearching] = useState(false);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [queryError, setQueryError] = useState<string | null>(null);

  const navigate = useNavigate();

  const { enabled: privateMode, toggle: togglePrivate } = usePrivateMode();

  const { isIndia } = useIndiaRegion();

  const killSwitches = useGlobalStore((s) => s.featureKillSwitches);

  const featureFlags = useGlobalStore((s) => s.featureFlags);

  const isFeatureEnabled = useGlobalStore((s) => s.isFeatureEnabled);

  const isAdmin = useAuthStore((s) => s.isAdmin);

  const visibleCommands = useMemo(
    () => COMMANDS.filter((c) => {
      if (c.adminOnly && !isAdmin) return false;
      if (!isIndia && c.path === "/app/mock-test") return false;
      if (!c.featureFlag) return true;
      return (
        isFeatureEnabled(c.featureFlag) ||
        Boolean(featureFlags[c.featureFlag]) ||
        killSwitches[c.featureFlag] !== false
      );
    }),
    [isAdmin, isIndia, killSwitches, featureFlags, isFeatureEnabled],
  );



  const trimmedQuery = debouncedQuery.trim();

  const canFilter = trimmedQuery.length >= 2;

  const showRecent = !canFilter && recentSearches.length > 0;



  useEffect(() => {

    if (open) {

      setRecentSearches(getRecentSearches());

      resetCmdkListScroll();


    } else {

      setQuery("");
      setQueryError(null);

    }

  }, [open, isAdmin]);

  // Debounce the query so filtering/ranking doesn't run on every keystroke,
  // and cancel any in-flight debounce timer when a newer query supersedes it.
  useEffect(() => {
    if (!open) {
      setDebouncedQuery("");
      setIsSearching(false);
      return;
    }
    const raw = query.trim();
    if (raw.length < 2) {
      setDebouncedQuery(query);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query);
      setIsSearching(false);
    }, 150);
    return () => window.clearTimeout(timer);
  }, [query, open]);

  useEffect(() => {
    if (!open) return;
    resetCmdkListScroll();
  }, [debouncedQuery, open]);



  useEffect(() => {

    const handler = (e: KeyboardEvent) => {

      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {

        e.preventDefault();

        setOpen(!open);

      }

    };

    window.addEventListener("keydown", handler);

    return () => window.removeEventListener("keydown", handler);

  }, [open, setOpen]);



  const go = useCallback(

    (path: string) => {

      if (canFilter) addRecentSearch(trimmedQuery);

      setOpen(false);

      navigate(path);

    },

    [navigate, setOpen, canFilter, trimmedQuery]

  );

  const handleQueryChange = useCallback((value: string) => {
    if (value.length > MAX_SEARCH_LENGTH) {
      setQueryError(`Search is limited to ${MAX_SEARCH_LENGTH} characters.`);
      setQuery(value.slice(0, MAX_SEARCH_LENGTH));
      return;
    }
    if (!SAFE_SEARCH_TEXT.test(value) || /<\s*script|[\u0000-\u001f\u007f]/i.test(value)) {
      setQueryError("Use letters, numbers, spaces, and standard punctuation only.");
      return;
    }
    setQueryError(null);
    setQuery(value);
  }, []);



  // Relevance score: exact match first, then prefix match on label/keywords,
  // then "contains" matches, so typing "prep" surfaces Prep Lab / STAR Builder /
  // Rephraser / Project Builder / System Design / Coding Hints ahead of anything
  // that merely mentions "prep" in passing.
  const scoreCommand = useCallback((c: NavCommand, q: string): number => {
    if (!q) return 0;
    const label = c.label.toLowerCase();
    const keywords = (c.keywords ?? "").toLowerCase();
    const group = c.group.toLowerCase();
    if (label === q || group === q) return 0;
    if (label.startsWith(q) || group.startsWith(q)) return 1;
    if (keywords.split(" ").some((word) => word.startsWith(q))) return 2;
    if (label.includes(q) || group.includes(q)) return 3;
    if (keywords.includes(q)) return 4;
    return 5;
  }, []);

  const filteredCommands = useMemo(() => {
    if (!canFilter) return visibleCommands;
    const q = trimmedQuery.toLowerCase();
    return visibleCommands.filter((c) => scoreCommand(c, q) < 5);
  }, [visibleCommands, canFilter, trimmedQuery, scoreCommand]);

  const grouped = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    const acc = filteredCommands.reduce<Record<string, NavCommand[]>>((map, c) => {
      (map[c.group] ??= []).push(c);
      return map;
    }, {});
    if (canFilter) {
      for (const group of Object.keys(acc)) {
        acc[group] = [...acc[group]].sort(
          (a, b) => scoreCommand(a, q) - scoreCommand(b, q) || a.label.localeCompare(b.label),
        );
      }
    }
    const order = paletteGroupOrder(trimmedQuery);
    return order
      .filter((group) => acc[group]?.length)
      .map((group) => [group, acc[group]!] as const);
  }, [filteredCommands, trimmedQuery, canFilter, scoreCommand]);



  function handleClearRecent() {

    clearRecentSearches();

    setRecentSearches([]);

  }



  return (

    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={canFilter}>

      <CommandInput

        placeholder="Search pages, actions, settings…"

        value={query}

        onValueChange={handleQueryChange}

      />

      <CommandList aria-busy={isSearching}>

        {queryError && (
          <div className="px-4 py-2 text-sm text-red-500" role="alert">{queryError}</div>
        )}

        {!canFilter && !isSearching && (

          <div className="px-4 py-3 text-sm text-muted-foreground">

            Type at least 2 characters to search

          </div>

        )}



        {isSearching && (

          <div className="px-4 py-3 text-sm text-muted-foreground" role="status">

            Searching…

          </div>

        )}



        {canFilter && !isSearching && grouped.length === 0 && (

          <CommandEmpty>No results found for &ldquo;{trimmedQuery}&rdquo;.</CommandEmpty>

        )}



        {showRecent && (

          <CommandGroup heading="Recent searches">

            {recentSearches.map((term) => (

              <CommandItem

                key={term}

                value={`recent ${term}`}

                onSelect={() => setQuery(term)}

              >

                <History className="mr-2 h-4 w-4" />

                {term}

              </CommandItem>

            ))}

            <CommandItem

              value="clear recent search history"

              onSelect={handleClearRecent}

              className="text-muted-foreground"

            >

              <Trash2 className="mr-2 h-4 w-4" />

              Clear search history

            </CommandItem>

          </CommandGroup>

        )}



        {canFilter && grouped.map(([group, items]) => (

          <CommandGroup key={group} heading={group}>

            {items.map((c) => {

              const Icon = c.icon;

              const preview = c.keywords ?? c.path.replace(/^\/app\//, "").replace(/\//g, " › ");

              return (

                <CommandItem

                  key={c.path}

                  value={`${c.label} ${c.keywords ?? ""} ${c.group} ${c.path}`}

                  onSelect={() => go(c.path)}

                >

                  <Icon className="mr-2 h-4 w-4 shrink-0" />

                  <div className="flex min-w-0 flex-1 flex-col">

                    <span>{c.label}</span>

                    <span className="truncate text-xs text-muted-foreground">
                      {preview}
                    </span>

                  </div>

                </CommandItem>

              );

            })}

          </CommandGroup>

        ))}



        {canFilter && (

          <>

            <CommandSeparator />

            <CommandGroup heading="Actions">

              <CommandItem

                value="private mode incognito"

                onSelect={() => {

                  if (canFilter) addRecentSearch(trimmedQuery);

                  togglePrivate();

                  setOpen(false);

                }}

              >

                <Lock className="mr-2 h-4 w-4" />

                {privateMode ? "Disable Private Mode" : "Enable Private Mode"}

              </CommandItem>

            </CommandGroup>

          </>

        )}

      </CommandList>

    </CommandDialog>

  );

}

