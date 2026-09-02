// Static FAQ content used when help_articles DB is empty or unreachable.
// Slug pattern matches migration 20260531174228: {prefix}-{n} (gs-, li-, mt-, bi-).
// Billing/credit numbers come from helpCatalogCopy — do not hardcode a second catalog.

import {
  HELP_CATALOG_SNIPPETS,
  HELP_CREDIT_COSTS,
  HELP_PACK_LIST,
  HELP_PLAN_CREDITS,
  HELP_PLAN_PRICES,
  helpCopyLooksStale,
} from "@/lib/help/helpCatalogCopy";

export type HelpArticleItem = {
  slug: string;
  question: string;
  answer: string;
  body_md: string | null;
  category_slug: string;
  category_title: string;
  sort_order: number;
};

export type HelpFaqCategory = {
  title: string;
  slug: string;
  items: HelpArticleItem[];
};

const gs3 = HELP_CATALOG_SNIPPETS["gs-3"];
const gs2 = HELP_CATALOG_SNIPPETS["gs-2"];
const li4 = HELP_CATALOG_SNIPPETS["li-4"];
const mp2 = HELP_CATALOG_SNIPPETS["mp-2"];
const bi1 = HELP_CATALOG_SNIPPETS["bi-1"];
const bi2 = HELP_CATALOG_SNIPPETS["bi-2"];
const bi3 = HELP_CATALOG_SNIPPETS["bi-3"];
const bi4 = HELP_CATALOG_SNIPPETS["bi-4"];
const bi5 = HELP_CATALOG_SNIPPETS["bi-5"];

export const HELP_ARTICLES_FALLBACK: HelpArticleItem[] = [
  {
    slug: "gs-1",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: "What is Career Pilot?",
    answer:
      "Career Pilot is an AI-powered interview preparation platform that provides real-time coaching during practice sessions, full mock simulations with analytics, and prep tools to help you land your dream job.",
    body_md: `Career Pilot is an AI-powered interview **preparation** platform. It provides a live practice coach, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.

The platform combines three core capabilities:

1. **Practice Coach** — Real-time AI suggestions during rehearsal sessions, shown in an on-screen prep overlay
2. **Mock Interview** — Full simulation interviews with AI scoring, filler-word tracking, and detailed performance analytics
3. **Prep Lab** — Tools including STAR builder, answer rephraser, gap analysis, company research, and coding hints

Career Pilot is for practice only. Using AI assistance covertly during a real interview violates most employer and assessment policies.`,
    sort_order: 10,
  },
  {
    slug: "gs-2",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: gs2.question,
    answer: gs2.answer,
    body_md: gs2.body_md,
    sort_order: 20,
  },
  {
    slug: "gs-3",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: gs3.question,
    answer: gs3.answer,
    body_md: gs3.body_md,
    sort_order: 30,
  },
  {
    slug: "li-1",
    category_slug: "live-interview",
    category_title: "Live Interview",
    question: "How does the live practice coach work?",
    answer:
      "During a practice session, Career Pilot listens to your spoken answers and provides real-time suggested talking points, structure hints, and follow-up prompts in an on-screen prep overlay.",
    body_md: `The live practice coach works in three steps:

1. **Audio capture** — Your microphone (and optionally system audio in Chromium browsers) picks up the question
2. **AI processing** — The question is sent to Google Gemini 2.0 Flash for analysis
3. **Overlay display** — Suggested talking points, structure hints, and follow-ups appear in your on-screen prep overlay

The whole loop takes under a second. The overlay is a normal on-screen window and is visible to screen-sharing tools — it is not designed to be hidden during real interviews.`,
    sort_order: 10,
  },
  {
    slug: "li-2",
    category_slug: "live-interview",
    category_title: "Live Interview",
    question: "Can I use this during a real interview?",
    answer:
      "No. Practice Coach is built strictly for interview practice. Using AI assistance covertly during a real interview violates most employer and assessment policies.",
    body_md: `**No.** Practice Coach is built strictly for interview rehearsal with an AI coach.

Using AI assistance covertly during a live interview:

- Violates most employer and assessment policies
- May breach the terms of platforms like Zoom, Teams, Google Meet, HackerRank, and CoderPad
- Can result in offer rescissions or disciplinary action

The Career Pilot overlay is a normal on-screen window and is visible to screen-sharing tools by design.`,
    sort_order: 20,
  },
  {
    slug: "li-4",
    category_slug: "live-interview",
    category_title: "Live Interview",
    question: li4.question,
    answer: li4.answer,
    body_md: li4.body_md,
    sort_order: 40,
  },
  {
    slug: "mt-1",
    category_slug: "mock-tests",
    category_title: "Mock Tests",
    question: "What types of mock interviews are available?",
    answer:
      "We offer behavioral, technical, system design, and role-specific mock sessions. Each session includes AI-generated questions, real-time feedback, and a detailed scorecard.",
    body_md: `We offer four types of mock interview sessions:

1. **Behavioral** — STAR-method questions about leadership, teamwork, conflict resolution
2. **Technical** — Coding and algorithm questions with hints and solution breakdowns
3. **System Design** — Architecture and scalability discussion questions
4. **Role-Specific** — Questions tailored to your specific target role and industry

Each session can be configured with Easy, Medium, or Hard difficulty and 15–60 minute durations.`,
    sort_order: 10,
  },
  {
    slug: "mt-2",
    category_slug: "mock-tests",
    category_title: "Mock Tests",
    question: "How does mock test scoring work?",
    answer:
      "After each mock session, you receive a scorecard covering clarity, structure, specificity, relevance, and confidence compared against your historical performance.",
    body_md: `After each mock session, you receive a detailed scorecard covering:

- **Clarity** — How clear and concise your answers were
- **Structure** — STAR method usage and logical flow
- **Specificity** — Use of concrete examples and data
- **Relevance** — How well answers addressed the question
- **Confidence** — Speaking pace, filler words, and delivery

Scores are tracked over time in your Analytics dashboard for trend analysis.`,
    sort_order: 20,
  },
  {
    slug: "mt-3",
    category_slug: "mock-tests",
    category_title: "Mock Tests",
    question: mp2.question,
    answer: mp2.answer,
    body_md: mp2.body_md,
    sort_order: 30,
  },
  {
    slug: "mp-2",
    category_slug: "mock-practice",
    category_title: "Mock Practice",
    question: mp2.question,
    answer: mp2.answer,
    body_md: mp2.body_md,
    sort_order: 20,
  },
  {
    slug: "bi-1",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: bi1.question,
    answer: bi1.answer,
    body_md: bi1.body_md,
    sort_order: 10,
  },
  {
    slug: "bi-2",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: bi2.question,
    answer: bi2.answer,
    body_md: bi2.body_md,
    sort_order: 20,
  },
  {
    slug: "bi-3",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: bi3.question,
    answer: bi3.answer,
    body_md: bi3.body_md,
    sort_order: 30,
  },
  {
    slug: "bi-4",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: bi4.question,
    answer: bi4.answer,
    body_md: bi4.body_md,
    sort_order: 40,
  },
  {
    slug: "bi-5",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: bi5.question,
    answer: bi5.answer,
    body_md: bi5.body_md,
    sort_order: 50,
  },
];

const FALLBACK_SLUG_ALIASES: Record<string, string> = {
  "gs-4": "gs-3",
  "mp-1": "mt-1",
  "mp-3": "mt-2",
};

/** Fix common UTF-8 mojibake (e.g. Ã / Â sequences, corrupted À la carte). */
export function sanitizeHelpText(text: string): string {
  if (!text) return text;
  return text
    .replace(/\u00C0\s*la carte/gi, "A la carte")
    .replace(/Ã\u0080\s*la carte/gi, "A la carte")
    .replace(/Ã€\s*la carte/gi, "A la carte")
    .replace(/Ã¡/g, "á")
    .replace(/Ã©/g, "é")
    .replace(/Ã­/g, "í")
    .replace(/Ã³/g, "ó")
    .replace(/Ãº/g, "ú")
    .replace(/Ã±/g, "ñ")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    .replace(/â€“/g, "–")
    .replace(/â€”/g, "—")
    .replace(/Â₹/g, "₹")
    .replace(/Â·/g, "·")
    .replace(/Â /g, " ")
    .replace(/Â/g, "")
    // Replacement-char / stripped rupee before INR prices (TC-PUB-004)
    .replace(/\?(?=\s*[\d,]{3,})/g, "₹")
    .replace(/Settings\s*[\u0000-\u001f\u007f]\s*Billing/gi, "Settings → Billing");
}

/** Prefer clean fallback copy when a published row looks corrupted or stale. */
export function resolveHelpArticleDisplay(row: HelpArticleItem): HelpArticleItem {
  const fallback = getFallbackArticleBySlug(row.slug);
  const answer = sanitizeHelpText(row.answer ?? "");
  const body = sanitizeHelpText(row.body_md ?? "");
  const rawCombined = `${row.question ?? ""}\n${row.answer ?? ""}\n${row.body_md ?? ""}`;
  const looksCorrupt =
    /Ã.|â€|Â[₹· ]|Ã\u0080/.test(rawCombined) ||
    /\?(?=\s*[\d,]{3,})|Settings\s*[\u0000-\u001f\u007f]\s*Billing/i.test(rawCombined) ||
    (row.slug === "gs-3" &&
      /what happens after i sign up/i.test(row.question) &&
      /free plan/i.test(answer)) ||
    (row.slug === "bi-5" &&
      (/À\s*la carte|Ã€\s*la carte|Enterprise.*unlimited|unlimited credits/i.test(rawCombined)));

  if ((looksCorrupt || helpCopyLooksStale(rawCombined)) && fallback) {
    return fallback;
  }

  return {
    ...row,
    answer,
    body_md: body || null,
    question: sanitizeHelpText(row.question),
  };
}

export function groupHelpArticlesIntoCategories(
  rows: HelpArticleItem[],
): HelpFaqCategory[] {
  const byCat = new Map<string, HelpFaqCategory>();
  for (const row of rows) {
    if (!byCat.has(row.category_slug)) {
      byCat.set(row.category_slug, {
        slug: row.category_slug,
        title: row.category_title,
        items: [],
      });
    }
    byCat.get(row.category_slug)!.items.push(row);
  }
  return Array.from(byCat.values());
}

/** Collapse duplicate FAQ questions (e.g. gs-3 remapped + leftover gs-4). */
export function dedupeHelpArticlesByQuestion(
  rows: HelpArticleItem[],
): HelpArticleItem[] {
  const seen = new Map<string, HelpArticleItem>();
  const sorted = [...rows].sort((a, b) => a.sort_order - b.sort_order);
  for (const row of sorted) {
    const key = `${row.category_slug}::${row.question.trim().toLowerCase()}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, row);
      continue;
    }
    // Prefer canonical free-plan slug gs-3 over stale gs-4 duplicate.
    if (row.slug === "gs-3" || (existing.slug === "gs-4" && row.slug !== "gs-4")) {
      seen.set(key, row);
    }
  }
  return Array.from(seen.values()).sort((a, b) => a.sort_order - b.sort_order);
}

const CRITICAL_FALLBACK_SLUGS = [
  "gs-2",
  "gs-3",
  "li-4",
  "mp-2",
  "bi-1",
  "bi-2",
  "bi-3",
  "bi-4",
  "bi-5",
] as const;

/** Sanitize CMS rows and fill any missing India billing/credit articles. */
export function mergePublishedHelpRows(rows: HelpArticleItem[]): HelpArticleItem[] {
  const cleaned = rows.map(resolveHelpArticleDisplay);
  const have = new Set(cleaned.map((a) => a.slug));
  for (const slug of CRITICAL_FALLBACK_SLUGS) {
    if (!have.has(slug)) {
      const fb = HELP_ARTICLES_FALLBACK.find((a) => a.slug === slug);
      if (fb) cleaned.push(fb);
    }
  }
  return dedupeHelpArticlesByQuestion(cleaned);
}

export function getFallbackArticleBySlug(slug: string): HelpArticleItem | null {
  const aliased = FALLBACK_SLUG_ALIASES[slug] ?? slug;
  return HELP_ARTICLES_FALLBACK.find((a) => a.slug === aliased) ?? null;
}

export function getFallbackArticlesByCategory(categorySlug: string): HelpArticleItem[] {
  return HELP_ARTICLES_FALLBACK.filter((a) => a.category_slug === categorySlug);
}

export const HELP_FAQ_CATEGORIES_FALLBACK =
  groupHelpArticlesIntoCategories(
    HELP_ARTICLES_FALLBACK.filter((a) => a.slug !== "mp-2"),
  );

// Re-export catalog tokens so marketing pages can import from one Help module.
export {
  HELP_CREDIT_COSTS,
  HELP_PACK_LIST,
  HELP_PLAN_CREDITS,
  HELP_PLAN_PRICES,
};
