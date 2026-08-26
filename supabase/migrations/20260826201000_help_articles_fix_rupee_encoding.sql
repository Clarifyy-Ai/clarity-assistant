-- TC-PUB-004 / PUB-009: restore INR rupee and Settings → Billing after encoding damage.
-- Client also falls back to HELP_ARTICLES_FALLBACK when corruption is detected.

UPDATE public.help_articles
SET
  answer = 'Yes. The Free plan includes 50 credits per month — enough to try Practice Coach and a mock session. Pro is ₹2,499 one-time. Max is ₹6,799 one-time.',
  body_md = $md$Yes. The Free plan includes:

- **50 credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** (₹2,499 one-time, 1,400 credits) or **Max** (₹6,799 one-time, 4,000 credits) anytime.$md$,
  updated_at = now()
WHERE slug = 'gs-3';

UPDATE public.help_articles
SET
  answer = 'A la carte credit packs are not available at launch. Upgrade your plan to increase your monthly allowance.',
  body_md = $md$A la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (₹2,499 one-time, 1,400 credits) or **Max** (₹6,799 one-time, 4,000 credits) from **Settings → Billing**.$md$,
  updated_at = now()
WHERE slug = 'bi-5';
