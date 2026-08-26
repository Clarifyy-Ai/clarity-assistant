import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface PageContentProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  className?: string;
}

export function PageContent({ children, className, ...rest }: PageContentProps) {
  return (
    <div
      className={cn(
        "animate-in fade-in slide-in-from-bottom-2 duration-200",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}
