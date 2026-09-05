-- Align help article copy with product rule: Free = 50 credits at signup (one-time), not monthly refresh.

BEGIN;

UPDATE public.help_articles
SET
  answer = replace(
    replace(
      replace(answer, 'refresh each calendar month', 'are granted once at signup'),
      'per month', 'at signup (one-time)'
    ),
    '200 credits', '50 credits'
  ),
  body_md = replace(
    replace(
      replace(
        replace(body_md, 'refresh each calendar month', 'are granted once at signup'),
        'do not roll over', 'do not replenish automatically'
      ),
      'per month', 'at signup (one-time)'
    ),
    '200 credits', '50 credits'
  )
WHERE category_slug IN ('billing', 'getting-started')
  AND (
    body_md ILIKE '%refresh each calendar month%'
    OR body_md ILIKE '%200 credits%'
    OR answer ILIKE '%refresh each calendar month%'
  );

COMMIT;
