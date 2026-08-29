/** 
 * Dev-only debug telemetry — PRODUCTION DISABLED.
 * This function is only available in development builds.
 * Attempting to use it in production will throw an error.
 */
export function agentDebugIngest(payload: Record<string, unknown>): void {
  // This is a no-op in production builds.
  // The Vite build process should tree-shake this entire function in production.
  // If you see this running in production, the build configuration is incorrect.
  if (typeof import.meta !== 'undefined' && import.meta.env?.DEV === true) {
    // STRICTLY DEV ONLY: fetch() with localhost removed
    // If this ever runs in production, it will fail silently
    try {
      // Development endpoint disabled - DO NOT USE
      // fetch("http://127.0.0.1:7572/...", ...)
    } catch {
      // Silently fail
    }
  }
  // Production: this function does nothing
}
