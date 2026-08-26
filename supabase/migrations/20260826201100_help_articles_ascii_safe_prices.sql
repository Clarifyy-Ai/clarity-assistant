-- TC-PUB-004 follow-up: store ASCII-safe pricing copy so Management API / encoding
-- paths cannot strip the INR rupee glyph. Client still prefers fallback on corruption.

UPDATE public.help_articles
SET
  answer = 'Yes. The Free plan includes 50 credits per month - enough to try Practice Coach and a mock session. Pro is INR 2,499 one-time. Max is INR 6,799 one-time.',
  body_md = E'Yes. The Free plan includes:\n\n- **50 credits** per month\n- Practice sessions with the live AI coach (limited)\n- STAR builder and answer bank (limited)\n\nNo credit card required. Upgrade to **Pro** (INR 2,499 one-time, 1,400 credits) or **Max** (INR 6,799 one-time, 4,000 credits) anytime.',
  updated_at = now()
WHERE slug = 'gs-3';

UPDATE public.help_articles
SET
  answer = 'A la carte credit packs are not available at launch. Upgrade your plan to increase your monthly allowance.',
  body_md = 'A la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (INR 2,499 one-time, 1,400 credits) or **Max** (INR 6,799 one-time, 4,000 credits) from **Settings > Billing**.',
  updated_at = now()
WHERE slug = 'bi-5';
