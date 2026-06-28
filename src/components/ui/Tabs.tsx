import {
  createContext,
  useContext,
  useState,
  useCallback,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Tabs — compound component with keyboard navigation
// ─────────────────────────────────────────────────────────────────

interface TabsCtx {
  value:    string;
  setValue: (v: string) => void;
  baseId:   string;
}

const TabsContext = createContext<TabsCtx>({ value: "", setValue: () => {}, baseId: "tabs" });

interface TabsProps {
  defaultValue: string;
  value?:       string;
  onValueChange?: (v: string) => void;
  children:     ReactNode;
  className?:   string;
  id?:          string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
  id = "tabs",
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;

  function setValue(v: string) {
    setInternal(v);
    onValueChange?.(v);
  }

  return (
    <TabsContext.Provider value={{ value: active, setValue, baseId: id }}>
      <div className={cn("w-full", className)}>{children}</div>
    </TabsContext.Provider>
  );
}

export function TabsList({
  children,
  className,
}: {
  children:  ReactNode;
  className?: string;
}) {
  const { baseId } = useContext(TabsContext);

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      id={`${baseId}-list`}
      className={cn(
        "flex gap-1 bg-secondary border border-border rounded-xl p-1 w-fit",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
}: {
  value:     string;
  children:  ReactNode;
  className?: string;
}) {
  const ctx = useContext(TabsContext);
  const isActive = ctx.value === value;
  const tabId = `${ctx.baseId}-tab-${value}`;
  const panelId = `${ctx.baseId}-panel-${value}`;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>) => {
      const list = e.currentTarget.parentElement;
      if (!list) return;

      const tabs = Array.from(
        list.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
      );
      const index = tabs.indexOf(e.currentTarget);
      if (index === -1) return;

      let next = index;
      if (e.key === "ArrowRight") next = (index + 1) % tabs.length;
      else if (e.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
      else if (e.key === "Home") next = 0;
      else if (e.key === "End") next = tabs.length - 1;
      else return;

      e.preventDefault();
      const nextTab = tabs[next];
      const nextValue = nextTab?.getAttribute("data-value");
      if (nextValue) ctx.setValue(nextValue);
      nextTab?.focus();
    },
    [ctx],
  );

  return (
    <button
      type="button"
      role="tab"
      id={tabId}
      data-value={value}
      aria-selected={isActive}
      aria-controls={panelId}
      tabIndex={isActive ? 0 : -1}
      onClick={() => ctx.setValue(value)}
      onKeyDown={handleKeyDown}
      className={cn(
        "px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        isActive
          ? "bg-primary text-primary-foreground shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-background/60",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TabsContent({
  value,
  children,
  className,
}: {
  value:     string;
  children:  ReactNode;
  className?: string;
}) {
  const { value: active, baseId } = useContext(TabsContext);
  if (active !== value) return null;

  const tabId = `${baseId}-tab-${value}`;
  const panelId = `${baseId}-panel-${value}`;

  return (
    <div
      role="tabpanel"
      id={panelId}
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn("mt-4 animate-in fade-in duration-150", className)}
    >
      {children}
    </div>
  );
}
