-- TC-PUB-009: gs-3 body was migrated to free-plan copy while gs-4 kept the
-- same question title, producing duplicate "Is there a free plan?" rows.
-- Align gs-3 question and unpublish the stale gs-4 duplicate.

UPDATE public.help_articles
SET
  question = 'Is there a free plan?',
  updated_at = now()
WHERE slug = 'gs-3'
  AND question IS DISTINCT FROM 'Is there a free plan?';

UPDATE public.help_articles
SET
  published = false,
  updated_at = now()
WHERE slug = 'gs-4'
  AND published IS DISTINCT FROM false;
