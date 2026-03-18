import {
  createContext, useContext, useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

// ─────────────────────────────────────────────────────────────────
// Tabs — compound component pattern
// ─────────────────────────────────────────────────────────────────

interface TabsCtx {
  value:    string;
  setValue: (v: string) => void;
}

const TabsContext = createContext<TabsCtx>({ value: "", setValue: () => {} });

interface TabsProps {
  defaultValue: string;
  value?:       string;
  onValueChange?: (v: string) => void;
  children:     ReactNode;
  className?:   string;
}

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  children,
  className,
}: TabsProps) {
  const [internal, setInternal] = useState(defaultValue);
  const active = value ?? internal;

  function setValue(v: string) {
    setInternal(v);
    onValueChange?.(v);
  }

  return (
    <TabsContext.Provider value={{ value: active, setValue }}>
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
  return (
    <div
      className={cn(
        "flex gap-1 bg-white/5 border border-white/10 rounded-xl p-1 w-fit",
        className
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

  return (
    <button
      onClick={() => ctx.setValue(value)}
      className={cn(
        "px-4 py-2 rounded-lg text-sm font-medium transition-all",
        isActive
          ? "bg-violet-600 text-white shadow"
          : "text-gray-400 hover:text-white",
        className
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
  const { value: active } = useContext(TabsContext);
  if (active !== value) return null;
  return <div className={cn("mt-4", className)}>{children}</div>;
}
