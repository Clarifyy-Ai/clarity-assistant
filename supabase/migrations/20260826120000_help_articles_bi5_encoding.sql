-- Rewrite billing FAQ bi-5: remove mojibake (À la carte) and outdated Enterprise copy.
-- Align with INR Max/Pro pricing already used by gs-3 / bi-2 and client fallbacks.

UPDATE public.help_articles
SET
  answer = 'A la carte credit packs are not available at launch. Upgrade your plan to increase your monthly allowance.',
  body_md = 'A la carte credit packs are not available at launch. To increase your monthly allowance, upgrade to **Pro** (₹2,499 one-time, 1,400 credits) or **Max** (₹6,799 one-time, 4,000 credits) from **Settings → Billing**.',
  updated_at = now()
WHERE slug = 'bi-5';

-- Normalize remaining "À la carte" spellings to ASCII across help articles.
UPDATE public.help_articles
SET
  answer = replace(coalesce(answer, ''), 'À la carte', 'A la carte'),
  body_md = replace(coalesce(body_md, ''), 'À la carte', 'A la carte'),
  updated_at = now()
WHERE coalesce(answer, '') LIKE '%À la carte%'
   OR coalesce(body_md, '') LIKE '%À la carte%';
