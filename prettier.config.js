// ─────────────────────────────────────────────────────────────────────────────
// prettier.config.js — Prettier formatting rules.
// Aligned with the ESLint config and Tailwind class sorting.
// ─────────────────────────────────────────────────────────────────────────────

/** @type {import("prettier").Config} */
const config = {
  // ── Core style ─────────────────────────────────────────────────────────────
  semi:             true,
  singleQuote:      false,        // use double quotes (aligns with JSX default)
  jsxSingleQuote:   false,
  quoteProps:       "as-needed",
  trailingComma:    "es5",        // trailing commas where valid in ES5
  bracketSpacing:   true,         // { foo: bar }
  bracketSameLine:  false,        // JSX closing > on its own line
  arrowParens:      "always",     // (x) => x
  endOfLine:        "lf",

  // ── Width ──────────────────────────────────────────────────────────────────
  printWidth:       100,
  tabWidth:         2,
  useTabs:          false,

  // ── Prose (markdown) ───────────────────────────────────────────────────────
  proseWrap:        "preserve",

  // ── Embedded languages ─────────────────────────────────────────────────────
  embeddedLanguageFormatting: "auto",

  // ── Plugins ────────────────────────────────────────────────────────────────
  plugins: [
    "prettier-plugin-tailwindcss",   // must be last — sorts Tailwind classes
  ],

  // Tailwind config path for class sorting
  tailwindConfig: "./tailwind.config.ts",

  // ── Per-language overrides ─────────────────────────────────────────────────
  overrides: [
    {
      // JSON — tighter width so nested objects stay readable
      files:   ["*.json", "*.jsonc"],
      options: { printWidth: 80 },
    },
    {
      // Markdown — no trailing commas concern, preserve wrapping
      files:   ["*.md", "*.mdx"],
      options: { proseWrap: "always", printWidth: 80 },
    },
    {
      // YAML (Supabase / GitHub Actions configs)
      files:   ["*.yml", "*.yaml"],
      options: { singleQuote: true, tabWidth: 2 },
    },
    {
      // TypeScript / TSX — explicit semi for clarity
      files:   ["*.ts", "*.tsx"],
      options: { semi: true, singleQuote: false },
    },
    {
      // CSS / PostCSS
      files:   ["*.css", "*.pcss"],
      options: { singleQuote: false },
    },
  ],
};

export default config;
