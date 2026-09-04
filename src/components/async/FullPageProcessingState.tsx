import { ProcessingStatus } from "@/components/async/ProcessingStatus";
import { cn } from "@/lib/utils";

type FullPageProcessingStateProps = {
  title: string;
  message: string;
  stage?: string;
  elapsedMs?: number;
  children?: React.ReactNode;
  className?: string;
};

export function FullPageProcessingState({
  title,
  message,
  stage,
  elapsedMs,
  children,
  className,
}: FullPageProcessingStateProps) {
  return (
    <div
      className={cn(
        "flex min-h-[40vh] items-center justify-center px-4 py-10",
        className,
      )}
      data-testid="full-page-processing"
      aria-busy="true"
    >
      <div className="w-full max-w-md space-y-4 text-center">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <div className="flex justify-center">
          <ProcessingStatus
            message={message}
            stage={stage}
            elapsedMs={elapsedMs}
            className="text-left"
          />
        </div>
        {children}
      </div>
    </div>
  );
}
