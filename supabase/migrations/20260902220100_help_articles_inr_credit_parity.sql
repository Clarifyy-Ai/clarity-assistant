-- BUG-012: Align published help_articles with India INR one-time catalog
-- and live credit costs. Use ASCII "INR" so encoding paths cannot strip
-- the rupee glyph. Client fallback still prefers ₹ via helpCatalogCopy.

UPDATE public.help_articles
SET
  answer = 'Click ''Get started free'' on the homepage. You can sign up with your email or use Google OAuth. No credit card required for the free plan.',
  body_md = $md$Creating an account takes less than a minute:

1. Visit the Career Pilot homepage and click **Get started free**
2. Enter your email and create a password, or sign in with Google
3. Verify your email address
4. Complete the quick onboarding flow (role, experience, target companies)

No credit card is required. You'll start on the Free plan with 50 credits per month.$md$,
  updated_at = now()
WHERE slug = 'gs-2';

UPDATE public.help_articles
SET
  question = 'Is there a free plan?',
  answer = 'Yes. The Free plan includes 50 credits per month - enough to try Practice Coach and a mock session. Pro is INR 2,499 one-time. Max is INR 6,799 one-time.',
  body_md = $md$Yes. The Free plan includes:

- **50 credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** (INR 2,499 one-time, 1,400 credits) or **Max** (INR 6,799 one-time, 4,000 credits) anytime. See /pricing for the live catalog.$md$,
  updated_at = now()
WHERE slug = 'gs-3';

UPDATE public.help_articles
SET
  published = false,
  updated_at = now()
WHERE slug = 'gs-4'
  AND published IS DISTINCT FROM false;

UPDATE public.help_articles
SET
  answer = 'Each requested hint costs 2 credits and each generated answer costs 8 credits. The end-of-session debrief costs 15 credits.',
  body_md = $md$**Current (India product)** - practice-session deductions:

- Live hint: **2 credits**
- Generated answer: **8 credits**
- End-of-session debrief: **15 credits**

**Example only:** a typical 30-minute practice session uses about 10-30 credits depending on how often you request hints.$md$,
  updated_at = now()
WHERE slug = 'li-4';

UPDATE public.help_articles
SET
  answer = 'Group Practice is coming soon. Collaborative rooms with shared scorecards are not available yet.',
  body_md = $md$**Group Practice is coming soon.**

We're building collaborative mock interviews where you and peers can:

- Create a room and share a link
- Practice together with shared scorecards
- Get real-time AI coaching for every participant

Until then, use solo mock interviews and practice sessions. Check Help again when Group Practice launches.$md$,
  updated_at = now()
WHERE slug = 'mp-2';

UPDATE public.help_articles
SET
  answer = 'Credits are the currency for AI-powered features. Free includes 50 credits per month. Pro includes 1,400 credits (one-time). Max includes 4,000 credits (one-time). Extra packs (50, 150, 500 credits) are sold from Settings -> Billing.',
  body_md = $md$Credits pay for AI-powered actions. **Current (India product)** costs:

- Live hint: 2 credits
- Full answer: 8 credits
- Mock session debrief: 15 credits
- STAR builder: 10 credits
- Company research: 20 credits

Free credits refresh each calendar month and do not roll over. Pro and Max credits are a one-time balance. Extra packs (50, 150, 500 credits) are available from **Settings -> Billing**.$md$,
  updated_at = now()
WHERE slug = 'bi-1';

UPDATE public.help_articles
SET
  answer = 'Pro is INR 2,499 one-time (1,400 credits). Max is INR 6,799 one-time (4,000 credits). Pay in INR with Razorpay - checkout does not auto-renew.',
  body_md = $md$**Current (India product)** - India launch, Razorpay INR, one-time (no auto-renew):

- **Pro** is **INR 2,499 one-time** for 1,400 credits
- **Max** is **INR 6,799 one-time** for 4,000 credits

Checkout is INR only. Upgrade anytime from **Settings -> Billing** or see /pricing.$md$,
  updated_at = now()
WHERE slug = 'bi-2';

UPDATE public.help_articles
SET
  answer = 'Paid Pro and Max access is a one-time Razorpay purchase - there is no auto-renewing subscription. You keep remaining credits. Refunds follow the Terms of Service.',
  body_md = $md$Paid **Pro** and **Max** access is a **one-time** Razorpay purchase. There is no auto-renewing subscription in **Settings -> Billing**.

You keep any remaining credits until you use them. If you were charged in error, email support. Refunds follow the Terms of Service. Live prices are on /pricing.$md$,
  updated_at = now()
WHERE slug = 'bi-3';

UPDATE public.help_articles
SET
  answer = 'Free-plan credits refresh each calendar month and do not roll over. Pro and Max credits are a one-time balance and stay until used. Extra packs add to the same balance.',
  body_md = $md$**Current (India product):**

- **Free** credits refresh each calendar month and do **not** roll over
- **Pro** and **Max** credits are a one-time balance - they stay until you use them
- Extra packs add to the same balance and do not expire on a billing cycle (there is no subscription cycle)$md$,
  updated_at = now()
WHERE slug = 'bi-4';

UPDATE public.help_articles
SET
  answer = 'Yes. Buy extra credit packs (50, 150, 500 credits) from Settings -> Billing, or upgrade to Pro (1,400 credits) or Max (4,000 credits).',
  body_md = $md$Yes. Extra credit packs are available from **Settings -> Billing**. **Current (India product)** pack sizes and catalog prices:

- 50 credits - INR 699
- 150 credits - INR 1,899
- 500 credits - INR 5,999

You can also upgrade to **Pro** (INR 2,499 one-time, 1,400 credits) or **Max** (INR 6,799 one-time, 4,000 credits).$md$,
  updated_at = now()
WHERE slug = 'bi-5';
