
The user wants me to start with Phase 1 (P0 critical security fixes). Let me focus on those three items only, then wait for confirmation.

**Phase 1 items:**

1. **Realtime cross-tenant data leak** — The audit claimed `realtime.messages` lacks RLS. However, `realtime` is a Supabase-reserved schema per system instructions: *"Avoid Modifying Supabase-Reserved Schemas... `realtime` ... Modifying these schemas can cause service degradation or outages."* I cannot add RLS policies on `realtime.messages` directly. The correct approach is **Realtime Authorization** via `realtime.set_auth` and broadcast-channel topic naming (`user:<auth.uid()>`). The right mitigation is at the application/topic level, not by adding RLS to the reserved schema. I'll explain this and provide guidance, but won't violate the reserved-schema rule.

2. **Lock down feature_flags exposure** — Current policy `flags_read USING: true` exposes `allowed_users` UUID list. Need to restrict SELECT so non-admins only see flags relevant to them. Straightforward migration.

3. **Stripe webhook hard-fail on missing secret** — Need to read current `stripe-webhook/index.ts` first, then patch to throw 500 if `STRIPE_WEBHOOK_SECRET` is missing.

Plan:
- Read `supabase/functions/stripe-webhook/index.ts` to see current implementation
- Create migration for feature_flags RLS lockdown
- Patch stripe-webhook to hard-fail
- Explain realtime situation (reserved schema constraint) and propose the safe alternative (channel topic scoping + Realtime Authorization)

I'll do read + plan in this message, then wait for migration approval per the migration tool rules ("call it and then ask the user for approval in text").
