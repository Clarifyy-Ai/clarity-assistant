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
  User, Bell, Mic, Brain, Calendar, Sparkles, Lock,
} from "lucide-react";
import { usePrivateMode } from "@/hooks/usePrivateMode";

interface NavCommand {
  label: string;
  keywords?: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Navigate" | "Sessions" | "Prep" | "Account";
}

const COMMANDS: NavCommand[] = [
  { label: "Dashboard", path: "/app", icon: Home, group: "Navigate" },
  { label: "Analytics", path: "/app/analytics", icon: BarChart2, group: "Navigate" },
  { label: "Notifications", path: "/app/notifications", icon: Bell, group: "Navigate" },
  { label: "Profile", path: "/app/profile", icon: User, group: "Account" },
  { label: "Settings", path: "/app/settings", icon: Settings, group: "Account" },
  { label: "Live rehearsal", path: "/app/live", icon: Mic, group: "Sessions" },
  { label: "Mock interview", path: "/app/mock", icon: FlaskConical, group: "Sessions" },
  { label: "Mock test hub", path: "/app/mock-test", icon: Brain, group: "Sessions" },
  { label: "Sessions", path: "/app/sessions", icon: Calendar, group: "Sessions" },
  { label: "Debriefs", path: "/app/debrief", icon: Sparkles, group: "Sessions" },
  { label: "Prep lab", path: "/app/prep", icon: BookOpen, group: "Prep" },
  { label: "STAR builder", path: "/app/prep/star", icon: BookOpen, group: "Prep" },
  { label: "Project builder", path: "/app/prep/projects", icon: BookOpen, group: "Prep" },
  { label: "Rephraser", path: "/app/prep/rephraser", icon: BookOpen, group: "Prep" },
  { label: "System design", path: "/app/prep/system-design", icon: BookOpen, group: "Prep" },
  { label: "Coding hints", path: "/app/prep/coding", icon: BookOpen, group: "Prep" },
  { label: "Documents", path: "/app/documents", icon: FileText, group: "Prep" },
  { label: "Answer bank", path: "/app/answer-bank", icon: BookOpen, group: "Prep" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { enabled: privateMode, toggle: togglePrivate } = usePrivateMode();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const go = useCallback(
    (path: string) => {
      setOpen(false);
      navigate(path);
    },
    [navigate]
  );

  const grouped = COMMANDS.reduce<Record<string, NavCommand[]>>((acc, c) => {
    (acc[c.group] ??= []).push(c);
    return acc;
  }, {});

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search pages, actions, settings…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        {Object.entries(grouped).map(([group, items]) => (
          <CommandGroup key={group} heading={group}>
            {items.map((c) => {
              const Icon = c.icon;
              return (
                <CommandItem
                  key={c.path}
                  value={`${c.label} ${c.keywords ?? ""}`}
                  onSelect={() => go(c.path)}
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {c.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem
            value="private mode incognito"
            onSelect={() => {
              togglePrivate();
              setOpen(false);
            }}
          >
            <Lock className="mr-2 h-4 w-4" />
            {privateMode ? "Disable Private Mode" : "Enable Private Mode"}
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
