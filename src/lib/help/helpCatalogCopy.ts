/**
 * Public Help / FAQ billing tokens — single source of truth for India launch copy.
 * Prices come from the Razorpay INR catalog fallback; credit amounts and tool
 * costs come from creditEconomics. Do not hard-code ₹ / $ strings in articles.
 */

import { CATALOG_PAISE_FALLBACK } from "@/lib/billing/liveCatalog";
import {
  AI_CREDIT_COSTS,
  CREDIT_PACK_DEFINITIONS,
  PLAN_MONTHLY_CREDITS,
} from "@/lib/constants/creditEconomics";

function formatHelpInr(paise: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(paise / 100);
}

/** Current India catalog (Razorpay one-time). */
export const HELP_PLAN_CREDITS = {
  free: PLAN_MONTHLY_CREDITS.free,
  pro: PLAN_MONTHLY_CREDITS.pro,
  max: PLAN_MONTHLY_CREDITS.enterprise,
} as const;

export const HELP_PLAN_PRICES = {
  pro: formatHelpInr(CATALOG_PAISE_FALLBACK.pro_monthly),
  max: formatHelpInr(CATALOG_PAISE_FALLBACK.enterprise_monthly),
} as const;

export const HELP_PACK_CREDITS = CREDIT_PACK_DEFINITIONS.map((p) => p.credits);
export const HELP_PACK_LIST = HELP_PACK_CREDITS.join(", ");

export const HELP_PACK_PRICES = {
  credits_50: formatHelpInr(CATALOG_PAISE_FALLBACK.credits_50),
  credits_150: formatHelpInr(CATALOG_PAISE_FALLBACK.credits_150),
  credits_500: formatHelpInr(CATALOG_PAISE_FALLBACK.credits_500),
} as const;

export const HELP_CREDIT_COSTS = {
  liveHint: AI_CREDIT_COSTS.live_hint,
  liveAnswer: AI_CREDIT_COSTS.live_answer,
  sessionDebrief: AI_CREDIT_COSTS.session_debrief,
  starBuilder: AI_CREDIT_COSTS.star_builder,
  companyResearch: AI_CREDIT_COSTS.company_research,
} as const;

/** Labels so readers can tell current product facts from policy vs examples. */
export const HELP_COPY_KIND = {
  current: "Current (India product)",
  policy: "Policy",
  example: "Example only",
} as const;

export const HELP_CREDIT_COST_LINES = [
  `- Live hint: ${HELP_CREDIT_COSTS.liveHint} credits`,
  `- Full answer: ${HELP_CREDIT_COSTS.liveAnswer} credits`,
  `- Mock session debrief: ${HELP_CREDIT_COSTS.sessionDebrief} credits`,
  `- STAR builder: ${HELP_CREDIT_COSTS.starBuilder} credits`,
  `- Company research: ${HELP_CREDIT_COSTS.companyResearch} credits`,
].join("\n");

export const HELP_PACK_PRICE_LINES = [
  `- ${HELP_PACK_CREDITS[0]} credits — ${HELP_PACK_PRICES.credits_50}`,
  `- ${HELP_PACK_CREDITS[1]} credits — ${HELP_PACK_PRICES.credits_150}`,
  `- ${HELP_PACK_CREDITS[2]} credits — ${HELP_PACK_PRICES.credits_500}`,
].join("\n");

export const HELP_PAID_PLANS_ANSWER =
  `Pro is ${HELP_PLAN_PRICES.pro} one-time (${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits). Max is ${HELP_PLAN_PRICES.max} one-time (${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits). Pay in INR with Razorpay — checkout does not auto-renew.`;

export const HELP_CREDITS_OVERVIEW_ANSWER =
  `Credits are the currency for AI-powered features. Free includes ${HELP_PLAN_CREDITS.free} credits per month. Pro includes ${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits (one-time). Max includes ${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits (one-time). Extra packs (${HELP_PACK_LIST} credits) are sold from Settings → Billing.`;

export const HELP_EXTRA_CREDITS_ANSWER =
  `Yes. Buy extra credit packs (${HELP_PACK_LIST} credits) from Settings → Billing, or upgrade to Pro (${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits) or Max (${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits).`;

export const HELP_FREE_PLAN_ANSWER =
  `Yes. The Free plan includes ${HELP_PLAN_CREDITS.free} credits per month — enough to try Practice Coach and a mock session. Pro is ${HELP_PLAN_PRICES.pro} one-time. Max is ${HELP_PLAN_PRICES.max} one-time.`;

export const HELP_PUBLIC_PATHS = {
  pricing: "/pricing",
  help: "/help",
  faq: "/faq",
  billing: "/app/settings/billing",
} as const;

/**
 * Detects USD-subscription / pre-India credit copy that must not be shown.
 * Free-plan "credits per month" is current and is not matched here.
 */
const STALE_HELP_PATTERNS: RegExp[] = [
  /\$\s*\d/,
  /\bUSD\b/i,
  /\$29/,
  /\$79/,
  /unlimited credits/i,
  /Enterprise is \*?\$?\s*\d/i,
  /yearly billing/i,
  /\$\d+\s*\/\s*month/i,
  /2,000 credits/i,
  /\b200 credits\b/i,
  /packs are not available/i,
  /À\s*la carte/i,
  /A la carte credit packs are not available/i,
  /hint costs \*\*1 credit/i,
  /Each requested hint costs \*\*1/i,
  /STAR-format answer costs \*\*2 credits/i,
  /debrief is \*\*5 credits/i,
  /Live hint: 1 credit/i,
  /Company brief: 3 credits/i,
  /Practice Rooms are available on all plans/i,
  /\*\*Cancel subscription\*\*/i,
  /click\s+['']?Cancel subscription/i,
  /current billing period/i,
  /monthly plan credits reset at the start of each billing cycle/i,
  /credits refresh monthly based on your plan/i,
];

export function helpCopyLooksStale(text: string): boolean {
  if (!text) return false;
  return STALE_HELP_PATTERNS.some((re) => re.test(text));
}

export type HelpCatalogSnippet = {
  question: string;
  answer: string;
  body_md: string;
};

export const HELP_CATALOG_SNIPPETS: Record<string, HelpCatalogSnippet> = {
  "gs-2": {
    question: "How do I create an account?",
    answer:
      "Click 'Get started free' on the homepage. You can sign up with your email or use Google OAuth. No credit card required for the free plan.",
    body_md: `Creating an account takes less than a minute:

1. Visit the Career Pilot homepage and click **Get started free**
2. Enter your email and create a password, or sign in with Google
3. Verify your email address
4. Complete the quick onboarding flow (role, experience, target companies)

No credit card is required. You'll start on the Free plan with ${HELP_PLAN_CREDITS.free} credits per month.`,
  },
  "gs-3": {
    question: "Is there a free plan?",
    answer: HELP_FREE_PLAN_ANSWER,
    body_md: `Yes. The Free plan includes:

- **${HELP_PLAN_CREDITS.free} credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** (${HELP_PLAN_PRICES.pro} one-time, ${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits) or **Max** (${HELP_PLAN_PRICES.max} one-time, ${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits) anytime. See ${HELP_PUBLIC_PATHS.pricing} for the live catalog.`,
  },
  "li-4": {
    question: "How many credits does a practice session cost?",
    answer: `Each requested hint costs ${HELP_CREDIT_COSTS.liveHint} credits and each generated answer costs ${HELP_CREDIT_COSTS.liveAnswer} credits. The end-of-session debrief costs ${HELP_CREDIT_COSTS.sessionDebrief} credits.`,
    body_md: `**${HELP_COPY_KIND.current}** — practice-session deductions:

- Live hint: **${HELP_CREDIT_COSTS.liveHint} credits**
- Generated answer: **${HELP_CREDIT_COSTS.liveAnswer} credits**
- End-of-session debrief: **${HELP_CREDIT_COSTS.sessionDebrief} credits**

**${HELP_COPY_KIND.example}:** a typical 30-minute practice session uses about 10–30 credits depending on how often you request hints.`,
  },
  "mp-2": {
    question: "Can I practice with others?",
    answer:
      "Group Practice is coming soon. Collaborative rooms with shared scorecards are not available yet.",
    body_md: `**Group Practice is coming soon.**

We're building collaborative mock interviews where you and peers can:

- Create a room and share a link
- Practice together with shared scorecards
- Get real-time AI coaching for every participant

Until then, use solo mock interviews and practice sessions. Check Help again when Group Practice launches.`,
  },
  "bi-1": {
    question: "How do credits work?",
    answer: HELP_CREDITS_OVERVIEW_ANSWER,
    body_md: `Credits pay for AI-powered actions. **${HELP_COPY_KIND.current}** costs:

${HELP_CREDIT_COST_LINES}

Free credits refresh each calendar month and do not roll over. Pro and Max credits are a one-time balance. Extra packs (${HELP_PACK_LIST} credits) are available from **Settings → Billing**.`,
  },
  "bi-2": {
    question: "How much do paid plans cost?",
    answer: HELP_PAID_PLANS_ANSWER,
    body_md: `**${HELP_COPY_KIND.current}** — India launch, Razorpay INR, one-time (no auto-renew):

- **Pro** is **${HELP_PLAN_PRICES.pro} one-time** for ${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits
- **Max** is **${HELP_PLAN_PRICES.max} one-time** for ${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits

Checkout is INR only. Upgrade anytime from **Settings → Billing** or see ${HELP_PUBLIC_PATHS.pricing}.`,
  },
  "bi-3": {
    question: "How do I cancel my subscription?",
    answer:
      "Paid Pro and Max access is a one-time Razorpay purchase — there is no auto-renewing subscription to cancel. You keep remaining credits. Refunds follow the Terms of Service.",
    body_md: `Paid **Pro** and **Max** access is a **one-time** Razorpay purchase. There is no auto-renewing subscription and nothing to cancel in **Settings → Billing**.

You keep any remaining credits until you use them. If you were charged in error, email support. Refunds follow the Terms of Service (${HELP_PUBLIC_PATHS.pricing} is the live price list; legal terms are on /terms).`,
  },
  "bi-4": {
    question: "Do unused credits roll over?",
    answer:
      "Free-plan credits refresh each calendar month and do not roll over. Pro and Max credits are a one-time balance and stay until used. Extra packs add to the same balance.",
    body_md: `**${HELP_COPY_KIND.current}:**

- **Free** credits refresh each calendar month and do **not** roll over
- **Pro** and **Max** credits are a one-time balance — they stay until you use them
- Extra packs add to the same balance and do not expire on a billing cycle (there is no subscription cycle)`,
  },
  "bi-5": {
    question: "Can I buy extra credits?",
    answer: HELP_EXTRA_CREDITS_ANSWER,
    body_md: `Yes. Extra credit packs are available from **Settings → Billing**. **${HELP_COPY_KIND.current}** pack sizes and catalog prices:

${HELP_PACK_PRICE_LINES}

You can also upgrade to **Pro** (${HELP_PLAN_PRICES.pro} one-time, ${HELP_PLAN_CREDITS.pro.toLocaleString("en-IN")} credits) or **Max** (${HELP_PLAN_PRICES.max} one-time, ${HELP_PLAN_CREDITS.max.toLocaleString("en-IN")} credits).`,
  },
};
