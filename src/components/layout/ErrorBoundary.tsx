import React, { ReactNode, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: (error: Error, retry: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary Component
 *
 * Catches React component errors and displays a user-friendly error UI.
 * Prevents entire app from crashing due to component rendering errors.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <YourComponent />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('Error caught by boundary:', error);
      console.error('Error info:', errorInfo);
    }

    // Optional: Send to error tracking service (Sentry)
    if (window.__sentry__) {
      window.__sentry__.captureException(error, {
        contexts: { react: { componentStack: errorInfo.componentStack } },
      });
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.handleRetry);
      }

      // Default error UI
      return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#0a0a0f] to-[#1a1a2e] px-4">
          <Card className="w-full max-w-md p-6 bg-red-950/20 border-red-500/30">
            <div className="flex gap-3">
              <AlertTriangle className="h-5 w-5 text-red-400 mt-1 flex-shrink-0" />
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-red-300 mb-2">
                  Oops! Something went wrong
                </h2>
                <p className="text-sm text-red-200 mb-4">
                  {this.state.error.message ||
                    'An unexpected error occurred. Please try again.'}
                </p>

                {process.env.NODE_ENV === 'development' && (
                  <details className="mb-4 text-xs text-red-100">
                    <summary className="cursor-pointer font-semibold mb-2">
                      Error Details
                    </summary>
                    <pre className="bg-black/30 p-2 rounded overflow-auto max-h-40">
                      {this.state.error.stack}
                    </pre>
                  </details>
                )}

                <div className="flex gap-2">
                  <Button
                    onClick={this.handleRetry}
                    className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </Button>
                  <Button
                    onClick={() => (window.location.href = '/app/dashboard')}
                    variant="outline"
                    className="flex-1"
                  >
                    Go Home
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
