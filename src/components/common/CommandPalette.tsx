// Sprint C: Global command palette (Ctrl+K / ⌘K)

import { useEffect, useState, useCallback } from "react";

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

  CalendarDays, Building2, Gift, History, Trash2,

} from "lucide-react";

import { usePrivateMode } from "@/hooks/usePrivateMode";

import { PRODUCT_NAMES } from "@/lib/constants/productNames";

import { useUIStore } from "@/store/uiStore";

import {

  addRecentSearch,

  clearRecentSearches,

  getRecentSearches,

} from "@/lib/search/commandPaletteStorage";



interface NavCommand {

  label: string;

  keywords?: string;

  path: string;

  icon: React.ComponentType<{ className?: string }>;

  group: "Navigate" | "Sessions" | "Prep" | "Account";

}

const COMMANDS: NavCommand[] = [

  { label: PRODUCT_NAMES.dashboard, path: "/app/dashboard", icon: Home, group: "Navigate", keywords: "home" },

  { label: PRODUCT_NAMES.creditsUsage, path: "/app/usage", icon: CreditCard, group: "Navigate", keywords: "billing credits usage" },

  { label: PRODUCT_NAMES.analytics, path: "/app/analytics", icon: BarChart2, group: "Navigate" },

  { label: "Notifications", path: "/app/notifications", icon: Bell, group: "Navigate" },

  { label: PRODUCT_NAMES.interviewDay, path: "/app/interview-day", icon: CalendarDays, group: "Navigate", keywords: "planner schedule" },

  { label: PRODUCT_NAMES.interviews, path: "/app/interviews", icon: Calendar, group: "Navigate", keywords: "scheduled" },

  { label: PRODUCT_NAMES.companyResearch, path: "/app/companies", icon: Building2, group: "Navigate", keywords: "research company" },

  { label: PRODUCT_NAMES.referrals, path: "/app/referrals", icon: Gift, group: "Navigate", keywords: "invite reward" },

  { label: "Profile", path: "/app/settings/profile", icon: User, group: "Account" },

  { label: "Settings", path: "/app/settings", icon: Settings, group: "Account" },

  { label: "Billing", path: "/app/settings/billing", icon: CreditCard, group: "Account", keywords: "subscription plan credits payment" },

  { label: PRODUCT_NAMES.practiceCoach, path: "/app/live", icon: Mic, group: "Sessions" },

  { label: PRODUCT_NAMES.mockInterview, path: "/app/mock", icon: FlaskConical, group: "Sessions" },

  { label: PRODUCT_NAMES.govExams, path: "/app/mock-test", icon: Brain, group: "Sessions", keywords: "exam gov test" },

  { label: PRODUCT_NAMES.sessionHistory, path: "/app/sessions", icon: Calendar, group: "Sessions", keywords: "history calls" },

  { label: PRODUCT_NAMES.debrief, path: "/app/debrief", icon: Sparkles, group: "Sessions", keywords: "debriefs feedback" },

  { label: PRODUCT_NAMES.prepLab, path: "/app/prep", icon: BookOpen, group: "Prep" },

  { label: "STAR builder", path: "/app/prep/star-builder", icon: BookOpen, group: "Prep" },

  { label: "Project builder", path: "/app/prep/project-builder", icon: BookOpen, group: "Prep" },

  { label: "Rephraser", path: "/app/prep/rephraser", icon: BookOpen, group: "Prep" },

  { label: "System design", path: "/app/prep/system-design", icon: BookOpen, group: "Prep" },

  { label: "Coding hints", path: "/app/prep/coding-hints", icon: BookOpen, group: "Prep" },

  { label: PRODUCT_NAMES.documents, path: "/app/documents", icon: FileText, group: "Prep" },

  { label: PRODUCT_NAMES.answerBank, path: "/app/answers", icon: BookOpen, group: "Prep" },

];



export function CommandPalette() {

  const open = useUIStore((s) => s.command_palette_open);

  const setOpen = useUIStore((s) => s.setCommandPaletteOpen);

  const [query, setQuery] = useState("");

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  const navigate = useNavigate();

  const { enabled: privateMode, toggle: togglePrivate } = usePrivateMode();

  const visibleCommands = COMMANDS;



  const trimmedQuery = query.trim();

  const canFilter = trimmedQuery.length >= 2;

  const showRecent = !canFilter && recentSearches.length > 0;



  useEffect(() => {

    if (open) {

      setRecentSearches(getRecentSearches());

    } else {

      setQuery("");

    }

  }, [open]);



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



  const grouped = visibleCommands.reduce<Record<string, NavCommand[]>>((acc, c) => {

    (acc[c.group] ??= []).push(c);

    return acc;

  }, {});



  function handleClearRecent() {

    clearRecentSearches();

    setRecentSearches([]);

  }



  return (

    <CommandDialog open={open} onOpenChange={setOpen} shouldFilter={canFilter}>

      <CommandInput

        placeholder="Search pages, actions, settings…"

        value={query}

        onValueChange={setQuery}

      />

      <CommandList>

        {!canFilter && (

          <div className="px-4 py-3 text-sm text-muted-foreground">

            Type at least 2 characters to search

          </div>

        )}



        {canFilter && <CommandEmpty>No results found.</CommandEmpty>}



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



        {canFilter && Object.entries(grouped).map(([group, items]) => (

          <CommandGroup key={group} heading={group}>

            {items.map((c) => {

              const Icon = c.icon;

              const preview = c.keywords ?? c.path.replace(/^\/app\//, "").replace(/\//g, " › ");

              return (

                <CommandItem

                  key={c.path}

                  value={`${c.label} ${c.keywords ?? ""} ${c.path}`}

                  onSelect={() => go(c.path)}

                >

                  <Icon className="mr-2 h-4 w-4 shrink-0" />

                  <div className="flex min-w-0 flex-1 flex-col">

                    <span>{c.label}</span>

                    <span className="truncate text-xs text-muted-foreground">{preview}</span>

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

