// Static FAQ content used when help_articles DB is empty or unreachable.
// Slug pattern matches migration 20260531174228: {prefix}-{n} (gs-, li-, mt-, bi-).

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

export const HELP_ARTICLES_FALLBACK: HelpArticleItem[] = [
  {
    slug: "gs-1",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: "What is Clarify AI?",
    answer:
      "Clarify AI is an AI-powered interview preparation platform that provides real-time coaching during practice sessions, full mock simulations with analytics, and prep tools to help you land your dream job.",
    body_md: `Clarify AI is an AI-powered interview **preparation** platform. It provides a live practice coach, full mock simulations with analytics, and a suite of prep tools to help you land your dream job.

The platform combines three core capabilities:

1. **Live Practice Coach** — Real-time AI suggestions during rehearsal sessions, shown in an on-screen prep overlay
2. **Mock Interview** — Full simulation interviews with AI scoring, filler-word tracking, and detailed performance analytics
3. **Prep Lab** — Tools including STAR builder, answer rephraser, gap analysis, company research, and coding hints

Clarify AI is for practice only. Using AI assistance covertly during a real interview violates most employer and assessment policies.`,
    sort_order: 10,
  },
  {
    slug: "gs-2",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: "How do I create an account?",
    answer:
      "Click 'Get started free' on the homepage. You can sign up with your email or use Google OAuth. No credit card required for the free plan.",
    body_md: `Creating an account takes less than a minute:

1. Visit the Clarify AI homepage and click **Get started free**
2. Enter your email and create a password, or sign in with Google
3. Verify your email address
4. Complete the quick onboarding flow (role, experience, target companies)

No credit card is required. You'll start on the Free plan with 50 credits per month.`,
    sort_order: 20,
  },
  {
    slug: "gs-3",
    category_slug: "getting-started",
    category_title: "Getting Started",
    question: "Is there a free plan?",
    answer:
      "Yes. The Free plan includes 50 credits per month — enough to try Practice Coach and a mock session. No credit card required.",
    body_md: `Yes. The Free plan includes:

- **50 credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** ($29/mo, 1,400 credits) or **Max** ($79/mo, 4,000 credits) anytime.`,
    sort_order: 30,
  },
  {
    slug: "li-1",
    category_slug: "live-interview",
    category_title: "Live Interview",
    question: "How does the live practice coach work?",
    answer:
      "During a practice session, Clarify AI listens to your spoken answers and provides real-time suggested talking points, structure hints, and follow-up prompts in an on-screen prep overlay.",
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

The Clarify AI overlay is a normal on-screen window and is visible to screen-sharing tools by design.`,
    sort_order: 20,
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
    question: "Can I practice with others?",
    answer:
      "Group Practice is coming soon. Collaborative rooms with shared scorecards are not available yet.",
    body_md: `**Group Practice is coming soon.**

We're building collaborative mock interviews where you and peers can:

- Create a room and share a link
- Practice together with shared scorecards
- Get real-time AI coaching for every participant

Until then, use solo mock interviews and practice sessions. Check Help again when Group Practice launches.`,
    sort_order: 30,
  },
  {
    slug: "bi-1",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: "How do credits work?",
    answer:
      "Credits are the currency for AI-powered features. Free includes 50 credits/month, Pro includes 1,400/month, and Max includes 4,000/month.",
    body_md: `Credits are the currency for AI features. Each action has a set cost:

- Live hint: 2 credits
- Full answer: 8 credits
- Mock session debrief: 15 credits
- STAR builder: 10 credits
- Company research: 20 credits

Credits refresh monthly based on your plan tier. Credit packs cost more per credit than a subscription — upgrading is the best value.`,
    sort_order: 10,
  },
  {
    slug: "bi-2",
    category_slug: "billing",
    category_title: "Billing & Credits",
    question: "How much do paid plans cost?",
    answer:
      "Pro is $29/month for 1,400 credits. Max is $79/month for 4,000 credits with priority support.",
    body_md: `Pro is **$29 / month** for 1,400 credits and unlocks the full feature set. Max is **$79 / month** for 4,000 credits, priority model access, and priority email support. Yearly billing saves roughly two months. Upgrade anytime from **Settings → Billing**.`,
    sort_order: 20,
  },
];

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

export function getFallbackArticleBySlug(slug: string): HelpArticleItem | null {
  return HELP_ARTICLES_FALLBACK.find((a) => a.slug === slug) ?? null;
}

export function getFallbackArticlesByCategory(categorySlug: string): HelpArticleItem[] {
  return HELP_ARTICLES_FALLBACK.filter((a) => a.category_slug === categorySlug);
}

export const HELP_FAQ_CATEGORIES_FALLBACK =
  groupHelpArticlesIntoCategories(HELP_ARTICLES_FALLBACK);
