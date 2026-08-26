import { useEffect, useRef } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { buttonVariants } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { AlertTriangle, Info, Trash2 } from "lucide-react";

type ConfirmVariant = "default" | "destructive" | "info";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
  isLoading?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel?: () => void;
}

const variantConfig: Record<
  ConfirmVariant,
  {
    icon: React.ElementType;
    iconClass: string;
    wrapperClass: string;
    confirmClass: string;
  }
> = {
  default: {
    icon: Info,
    iconClass: "text-primary",
    wrapperClass: "bg-primary/10",
    confirmClass: "",
  },
  destructive: {
    icon: Trash2,
    iconClass: "text-destructive",
    wrapperClass: "bg-destructive/10",
    confirmClass: buttonVariants({ variant: "destructive" }),
  },
  info: {
    icon: AlertTriangle,
    iconClass: "text-amber-500",
    wrapperClass: "bg-amber-500/10",
    confirmClass: "",
  },
};

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { icon: Icon, iconClass, wrapperClass, confirmClass } =
    variantConfig[variant];
  const confirmLockRef = useRef(false);

  useEffect(() => {
    if (!open || !isLoading) confirmLockRef.current = false;
  }, [open, isLoading]);

  const handleConfirm = async (event?: { preventDefault?: () => void }) => {
    event?.preventDefault?.();
    if (isLoading || confirmLockRef.current) return;
    confirmLockRef.current = true;
    try {
      await onConfirm();
    } catch {
      confirmLockRef.current = false;
    }
  };

  const handleCancel = () => {
    if (isLoading || confirmLockRef.current) return;
    onCancel?.();
    onOpenChange(false);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          {/* Icon */}
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mb-2",
              wrapperClass
            )}
          >
            <Icon className={cn("w-6 h-6", iconClass)} />
          </div>

          <AlertDialogTitle className="text-center">{title}</AlertDialogTitle>

          {description && (
            <AlertDialogDescription className="text-center">
              {description}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>

        <AlertDialogFooter className="flex-col-reverse sm:flex-row sm:justify-center gap-2 mt-2">
          <AlertDialogCancel
            onClick={handleCancel}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            {cancelLabel}
          </AlertDialogCancel>

          <AlertDialogAction
            onClick={handleConfirm}
            disabled={isLoading}
            className={cn("w-full sm:w-auto", confirmClass)}
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-primary/40 border-t-primary rounded-full animate-spin" />
                Processing...
              </span>
            ) : (
              confirmLabel
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
