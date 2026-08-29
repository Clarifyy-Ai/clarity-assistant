// Re-export the canonical toast state machine from components/ui/use-toast
// so both import paths share a single store (prevents duplicate toasts /
// split state). New code should prefer `sonner` directly.
export { useToast, toast } from "@/components/ui/use-toast";
export type { Toast, ToasterToast } from "@/components/ui/use-toast";
