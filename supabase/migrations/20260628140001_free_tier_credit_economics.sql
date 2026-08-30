ALTER TABLE public.profiles ALTER COLUMN credits SET DEFAULT 50;
ALTER TABLE public.subscriptions ALTER COLUMN monthly_credits SET DEFAULT 50;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (
    id, email, full_name, avatar_url, credits, created_at, updated_at
  ) VALUES (
    NEW.id, NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email,'@',1)),
    NEW.raw_user_meta_data->>'avatar_url',
    50, NOW(), NOW()
  ) ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.subscriptions (user_id, plan_id, status, monthly_credits)
  VALUES (NEW.id, 'free', 'active', 50)
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$function$;

-- Help center billing copy (matches src/lib/constants/helpArticlesFallback.ts)
UPDATE public.help_articles
SET
  answer = 'Yes. The Free plan includes 50 credits per month — enough to try Practice Coach and a mock session. Upgrade to Pro for 1,400 credits/month.',
  body_md = 'Yes. The Free plan includes:

- **50 credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** ($29/mo, 1,400 credits) or **Enterprise** ($79/mo, 4,000 credits) anytime.'
WHERE slug = 'gs-3';

UPDATE public.help_articles
SET
  answer = 'Credits are the currency for AI-powered features. Free includes 50 credits/month, Pro includes 1,400/month, and Enterprise includes 4,000/month.',
  body_md = 'Credits are the currency for AI features. Each action has a set cost:

- Live hint: 2 credits
- Full answer: 8 credits
- Mock session debrief: 15 credits
- STAR builder: 10 credits
- Company research: 20 credits

Credits refresh monthly based on your plan tier. Credit packs are available at a premium vs subscription — upgrading is the best value.'
WHERE slug = 'bi-1';

UPDATE public.help_articles
SET
  answer = 'Pro is $29/month for 1,400 credits. Enterprise is $79/month per seat with 4,000 credits and team controls.',
  body_md = 'Pro is **$29 / month** for 1,400 credits and unlocks the full feature set. Enterprise is **$79 / month** per seat with 4,000 credits and team controls. Yearly billing saves roughly two months. Upgrade anytime from **Settings → Billing**.'
WHERE slug = 'bi-2';

UPDATE public.help_articles
SET body_md = replace(body_md, '200 credits per month', '50 credits per month')
WHERE body_md LIKE '%200 credits per month%';
