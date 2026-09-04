import { useCallback, useRef, useState, type ReactNode } from "react";
import { Upload, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { ProcessingStatus } from "@/components/async/ProcessingStatus";

interface UploadZoneProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  onFileSelect: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  loading?: boolean;
  loadingContent?: ReactNode;
  className?: string;
}

/** Reusable drag-drop upload zone with EmptyState-style presentation. */
export function UploadZone({
  icon: Icon = Upload,
  title,
  description,
  onFileSelect,
  accept,
  multiple = false,
  disabled = false,
  loading = false,
  loadingContent,
  className,
}: UploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const isInteractive = !disabled && !loading;

  const openPicker = useCallback(() => {
    if (isInteractive) inputRef.current?.click();
  }, [isInteractive]);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length) onFileSelect(list);
      if (inputRef.current) inputRef.current.value = "";
    },
    [onFileSelect],
  );

  return (
    <>
      <div
        role="button"
        tabIndex={isInteractive ? 0 : -1}
        aria-disabled={disabled || loading || undefined}
        aria-busy={loading || undefined}
        onClick={openPicker}
        onKeyDown={(e) => {
          if (!isInteractive) return;
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            openPicker();
          }
        }}
        onDragOver={(e) => {
          if (!isInteractive) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (!isInteractive) return;
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
        }}
        className={cn(
          "border-2 border-dashed rounded-2xl p-5 sm:p-8 text-center transition-all",
          isInteractive ? "cursor-pointer" : "cursor-not-allowed opacity-60",
          dragOver
            ? "border-primary/60 bg-primary/5"
            : "border-border hover:border-primary/30 bg-card",
          className,
        )}
      >
        {loading ? (
          loadingContent ?? (
            <div className="flex flex-col items-center gap-2 px-2">
              <ProcessingStatus message="Uploading…" stage="upload" className="justify-center" />
              <p className="text-[10px] text-muted-foreground text-center max-w-xs">
                Percent shown only when the browser reports real upload progress.
              </p>
            </div>
          )
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
              <Icon className="w-7 h-7 text-muted-foreground" aria-hidden="true" />
            </div>
            <div className="flex flex-col gap-1.5 max-w-sm">
              <p className="text-sm font-semibold text-foreground">{title}</p>
              {description && (
                <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
              )}
            </div>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled || loading}
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) handleFiles(e.target.files);
        }}
      />
    </>
  );
}
