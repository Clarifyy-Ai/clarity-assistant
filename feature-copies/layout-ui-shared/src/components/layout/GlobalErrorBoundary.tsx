// ✅ FIX P7-A: Catches unhandled React render errors outside Suspense boundaries.

import { Component, type ErrorInfo, type ReactNode } from "react";
import * as Sentry from "@sentry/react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class GlobalErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || "An unexpected error occurred.",
    };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[GlobalErrorBoundary]", error, info.componentStack);
    if (import.meta.env.PROD && import.meta.env.VITE_SENTRY_DSN) {
      Sentry.captureException(error, { extra: { componentStack: info.componentStack } });
    }
  }

  handleReload = (): void => {
    window.location.reload();
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-8 text-foreground">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="max-w-md text-center text-sm text-muted-foreground">
          {this.state.message}
        </p>
        <p className="text-xs text-muted-foreground">Reload the app to continue.</p>
        <button
          type="button"
          onClick={this.handleReload}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Reload app
        </button>
      </div>
    );
  }
}

export default GlobalErrorBoundary;
