-- User-facing help copy: Razorpay INR one-time prices (not USD subscriptions).

UPDATE public.help_articles
SET
  answer = 'Yes. The Free plan includes 50 credits per month — enough to try Practice Coach and a mock session. Pro is ₹2,499 one-time. Max is ₹6,799 one-time.',
  body_md = 'Yes. The Free plan includes:

- **50 credits** per month
- Practice sessions with the live AI coach (limited)
- STAR builder and answer bank (limited)

No credit card required. Upgrade to **Pro** (₹2,499 one-time, 1,400 credits) or **Max** (₹6,799 one-time, 4,000 credits) anytime.'
WHERE slug = 'gs-3';

UPDATE public.help_articles
SET
  answer = 'Pro is ₹2,499 one-time (1,400 credits). Max is ₹6,799 one-time (4,000 credits). Pay in INR with Razorpay — no auto-renew.',
  body_md = 'Pro is **₹2,499 one-time** for 1,400 credits and unlocks the full feature set. Max is **₹6,799 one-time** for 4,000 credits and priority model access. Pay in INR with Razorpay — checkout does not auto-renew. Upgrade anytime from **Settings → Billing**.'
WHERE slug = 'bi-2';

UPDATE public.help_articles
SET
  answer = replace(replace(replace(answer, '$29/mo', '₹2,499 one-time'), '$29/month', '₹2,499 one-time'), '$29 / month', '₹2,499 one-time'),
  body_md = replace(replace(replace(body_md, '$29/mo', '₹2,499 one-time'), '$29/month', '₹2,499 one-time'), '$29 / month', '₹2,499 one-time')
WHERE coalesce(answer, '') LIKE '%$29%' OR coalesce(body_md, '') LIKE '%$29%';

UPDATE public.help_articles
SET
  answer = replace(replace(replace(answer, '$79/mo', '₹6,799 one-time'), '$79/month', '₹6,799 one-time'), '$79 / month', '₹6,799 one-time'),
  body_md = replace(replace(replace(body_md, '$79/mo', '₹6,799 one-time'), '$79/month', '₹6,799 one-time'), '$79 / month', '₹6,799 one-time')
WHERE coalesce(answer, '') LIKE '%$79%' OR coalesce(body_md, '') LIKE '%$79%';
