import * as React from "react";
import type { ToastActionElement, ToastProps } from "@/components/ui/toast";

// ─── Constants ────────────────────────────────────────────────────────────────
const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 4000; // ms before toast is cleared from state

// ─── Types ────────────────────────────────────────────────────────────────────
type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

type Toast = Omit<ToasterToast, "id">;

type ActionType = {
  ADD_TOAST: "ADD_TOAST";
  UPDATE_TOAST: "UPDATE_TOAST";
  DISMISS_TOAST: "DISMISS_TOAST";
  REMOVE_TOAST: "REMOVE_TOAST";
};

type Action =
  | { type: ActionType["ADD_TOAST"]; toast: ToasterToast }
  | { type: ActionType["UPDATE_TOAST"]; toast: Partial<ToasterToast> }
  | { type: ActionType["DISMISS_TOAST"]; toastId?: string }
  | { type: ActionType["REMOVE_TOAST"]; toastId?: string };

interface State {
  toasts: ToasterToast[];
}

// ─── ID Generator ─────────────────────────────────────────────────────────────
let count = 0;
function genId(): string {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

// ─── Timeout Tracking ─────────────────────────────────────────────────────────
const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function addToRemoveQueue(toastId: string, dispatch: React.Dispatch<Action>) {
  if (toastTimeouts.has(toastId)) return;

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({ type: "REMOVE_TOAST", toastId });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
}

// ─── Reducer ──────────────────────────────────────────────────────────────────
function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case "DISMISS_TOAST": {
      const { toastId } = action;
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? { ...t, open: false }
            : t
        ),
      };
    }

    case "REMOVE_TOAST":
      return {
        ...state,
        toasts: action.toastId === undefined
          ? []
          : state.toasts.filter((t) => t.id !== action.toastId),
      };

    default:
      return state;
  }
}

// ─── Global State (single shared instance across the app) ─────────────────────
const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

// ─── Public toast() API ───────────────────────────────────────────────────────
function toast(props: Toast) {
  const id = genId();

  const update = (updateProps: Partial<ToasterToast>) =>
    dispatch({ type: "UPDATE_TOAST", toast: { ...updateProps, id } });

  const dismiss = () =>
    dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  return { id, update, dismiss };
}

// Convenience variants
toast.success = (title: string, opts?: Partial<Toast>) =>
  toast({ ...opts, title, variant: "default" });

toast.error = (title: string, opts?: Partial<Toast>) =>
  toast({ ...opts, title, variant: "destructive" });

toast.warning = (title: string, opts?: Partial<Toast>) =>
  toast({ ...opts, title, variant: "default" });

toast.info = (title: string, opts?: Partial<Toast>) =>
  toast({ ...opts, title, variant: "default" });

// ─── Hook ─────────────────────────────────────────────────────────────────────
function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, []);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => {
      dispatch({ type: "DISMISS_TOAST", toastId });
      if (toastId) {
        addToRemoveQueue(toastId, dispatch);
      }
    },
    dismissAll: () => dispatch({ type: "DISMISS_TOAST" }),
  };
}

export { useToast, toast };
export type { Toast, ToasterToast };
