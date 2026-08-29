-- Prevent a second published Help FAQ with the same question text.
-- TC-PUB: "Is there a free plan?" must have one canonical published article.
CREATE UNIQUE INDEX IF NOT EXISTS help_articles_published_question_uidx
  ON public.help_articles (lower(btrim(question)))
  WHERE published IS TRUE;
