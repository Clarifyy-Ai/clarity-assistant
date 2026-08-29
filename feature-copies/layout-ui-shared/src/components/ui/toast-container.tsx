import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";
import { useToast } from "@/components/ui/use-toast";

/**
 * ToastContainer — renders all active toasts from the global toast() queue.
 * Mount this once at the root (AppLayout) alongside <Sonner />.
 * Use for Radix-based toasts; use sonner's toast() for fire-and-forget toasts.
 */
export function ToastContainer() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, ...props }) => (
        <Toast key={id} {...props}>
          <div className="grid gap-1">
            {title && <ToastTitle>{title}</ToastTitle>}
            {description && (
              <ToastDescription>{description}</ToastDescription>
            )}
          </div>

          {/* Optional action button (e.g. "Undo") */}
          {action}

          <ToastClose />
        </Toast>
      ))}

      {/* Portal target — renders toasts at bottom-right of screen */}
      <ToastViewport />
    </ToastProvider>
  );
}
