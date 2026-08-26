-- Fix corrupted / outdated billing FAQ copy (TC-PUB-004 / TC-PUB-009).
-- Seed row bi-5 used "À la carte" and Enterprise wording; INR migration never rewrote it.
-- Keep ASCII-safe "A la carte" and Max plan pricing aligned with helpArticlesFallback.

UPDATE public.help_articles
SET
  answer = 'A la carte credit packs are not available at launch. Upgrade your plan to increase your monthly allowance.',
  body_md = 'A la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (₹2,499 one-time, 1,400 credits) or **Max** (₹6,799 one-time, 4,000 credits) from **Settings → Billing**.',
  updated_at = now()
WHERE slug = 'bi-5';

-- Normalize any remaining mojibake / legacy Enterprise wording on billing articles.
UPDATE public.help_articles
SET
  answer = replace(replace(answer, 'À la carte', 'A la carte'), 'Ã€ la carte', 'A la carte'),
  body_md = replace(replace(body_md, 'À la carte', 'A la carte'), 'Ã€ la carte', 'A la carte'),
  updated_at = now()
WHERE category_slug = 'billing'
  AND (
    coalesce(answer, '') LIKE '%À la carte%'
    OR coalesce(body_md, '') LIKE '%À la carte%'
    OR coalesce(answer, '') LIKE '%Ã€ la carte%'
    OR coalesce(body_md, '') LIKE '%Ã€ la carte%'
  );

UPDATE public.help_articles
SET
  answer = replace(answer, 'or **Enterprise** (unlimited credits)', 'or **Max** (₹6,799 one-time, 4,000 credits)'),
  body_md = replace(body_md, 'or **Enterprise** (unlimited credits)', 'or **Max** (₹6,799 one-time, 4,000 credits)'),
  updated_at = now()
WHERE category_slug = 'billing'
  AND (
    coalesce(answer, '') LIKE '%Enterprise%unlimited%'
    OR coalesce(body_md, '') LIKE '%Enterprise%unlimited%'
  );
