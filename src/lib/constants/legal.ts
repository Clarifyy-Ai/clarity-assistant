/**
 * Shared typography for legal pages (Terms, Privacy) so heading hierarchy,
 * font sizes, weights, spacing and line-height stay identical across them.
 * Body copy is left-aligned; strong text stays sentence case (never all-caps).
 */
export const LEGAL_PROSE_CLASS = [
  "prose prose-sm dark:prose-invert max-w-none text-left",
  "prose-headings:font-bold prose-headings:text-foreground prose-headings:tracking-tight prose-headings:normal-case",
  "prose-h1:text-2xl sm:prose-h1:text-3xl prose-h1:mb-2",
  "prose-h2:text-lg sm:prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-2 prose-h2:normal-case",
  "prose-h3:text-base sm:prose-h3:text-lg prose-h3:font-semibold prose-h3:mt-6 prose-h3:mb-2 prose-h3:normal-case",
  "prose-p:text-sm prose-p:leading-relaxed prose-p:text-muted-foreground prose-p:text-left",
  "prose-li:text-sm prose-li:leading-relaxed prose-li:text-muted-foreground",
  "prose-ul:my-3 prose-ol:my-3",
  "prose-strong:text-foreground prose-strong:font-semibold prose-strong:normal-case",
  "prose-a:text-primary",
].join(" ");
