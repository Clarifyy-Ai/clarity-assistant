-- User-visible help and blog copy: Clarify AI → Career Pilot.
-- Does not rename tables, slugs, or internal identifiers.

UPDATE public.help_articles
SET
  question = replace(question, 'Clarify AI', 'Career Pilot'),
  answer = replace(answer, 'Clarify AI', 'Career Pilot'),
  body_md = replace(body_md, 'Clarify AI', 'Career Pilot'),
  updated_at = now()
WHERE coalesce(question, '') LIKE '%Clarify AI%'
   OR coalesce(answer, '') LIKE '%Clarify AI%'
   OR coalesce(body_md, '') LIKE '%Clarify AI%';

UPDATE public.blog_posts
SET
  title = replace(title, 'Clarify AI', 'Career Pilot'),
  excerpt = replace(excerpt, 'Clarify AI', 'Career Pilot'),
  content = replace(content, 'Clarify AI', 'Career Pilot'),
  author = replace(author, 'Clarify AI', 'Career Pilot'),
  updated_at = now()
WHERE coalesce(title, '') LIKE '%Clarify AI%'
   OR coalesce(excerpt, '') LIKE '%Clarify AI%'
   OR coalesce(content, '') LIKE '%Clarify AI%'
   OR coalesce(author, '') LIKE '%Clarify AI%';
