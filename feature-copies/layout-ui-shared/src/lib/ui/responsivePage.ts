/** Shared page shell: no horizontal overflow from 360px upward. */

/**
 * Hub / list / dashboard pages — fill the AppShell content column
 * (shell already caps at max-w-7xl). Do not nest a narrower left-aligned max-width.
 */
export const PAGE_SHELL =
  "w-full min-w-0 overflow-x-hidden";

/** Forms and long-form copy — keep a readable centered measure. */
export const PAGE_SHELL_NARROW =
  "w-full min-w-0 max-w-3xl mx-auto overflow-x-hidden";

/** Mixed content pages (lists + filters) that benefit from a soft cap. */
export const PAGE_SHELL_STANDARD =
  "w-full min-w-0 max-w-5xl overflow-x-hidden";

export const STACK_GRID = "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3";

export const SPLIT_STACK = "flex flex-col gap-4 lg:flex-row lg:items-start";

/** Extra bottom padding when mobile nav + optional cookie banner are present. */
export const PAGE_SAFE_BOTTOM = "pb-24 md:pb-0";

export const MOBILE_BREAKPOINTS = [360, 390, 412, 768, 1024, 1440] as const;
