/** Shared page shell: no horizontal overflow from 360px upward. */
export const PAGE_SHELL =
  "w-full min-w-0 max-w-6xl overflow-x-hidden px-0";

export const STACK_GRID = "grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3";

export const SPLIT_STACK = "flex flex-col gap-4 lg:flex-row lg:items-start";

export const MOBILE_BREAKPOINTS = [360, 390, 412, 768, 1024, 1440] as const;
