import { cn } from "@/lib/utils";
import { AlertCircle, CheckCircle2, Info, AlertTriangle } from "lucide-react";

interface AlertProps {
  variant?: "info" | "success" | "warning" | "error" | "destructive" | "default";
  className?: string;
  children?: React.ReactNode;
  title?: string;
}

const ICONS = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
  destructive: AlertCircle,
  default: Info,
};

const STYLES = {
  info: "bg-blue-500/10 border-blue-500/30 text-blue-300",
  success: "bg-emerald-500/10 border-emerald-500/30 text-emerald-300",
  warning: "bg-amber-500/10 border-amber-500/30 text-amber-300",
  error: "bg-red-500/10 border-red-500/30 text-red-300",
  destructive: "bg-red-500/10 border-red-500/30 text-red-300",
  default: "bg-muted border-border text-foreground",
};

export function Alert({ variant = "default", className, children, title }: AlertProps) {
  const Icon = ICONS[variant];

  return (
    <div className={cn("flex gap-3 rounded-xl border p-4", STYLES[variant], className)}>
      <Icon className="h-5 w-5 mt-0.5 shrink-0" />
      <div className="space-y-1">
        {title && <p className="font-medium text-sm">{title}</p>}
        <div className="text-sm opacity-90">{children}</div>
      </div>
    </div>
  );
}

export function AlertTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("font-medium text-sm", className)}>{children}</p>;
}

export function AlertDescription({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("text-sm opacity-90", className)}>{children}</div>;
}
