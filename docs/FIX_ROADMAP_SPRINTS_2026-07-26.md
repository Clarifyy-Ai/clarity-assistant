# Clarify AI — Fix Roadmap by Sprint

**Date:** 2026-07-26  
**Source:** Master audit Agents 1–5 (final addendum: Database/Supabase)  
**Verdict:** 🔴 NO-GO for public GA · 🟡 GO for invite-only beta after Sprint 0  
**DB readiness:** 6/10 (static migration replay; live linter/MCP project `qzgvjrvtkwlzxpmlddkx` not linked in-session)

---

## Gate rules

| Gate | Required | Outcome |
|------|----------|---------|
| **Beta (invite-only)** | Sprint 0 complete | Limited users; money path + DB P0s closed |
| **Public GA** | Sprints 0–2 complete + live advisor clean | Open signup |
| **Enterprise** | Sprint 3+ (MFA, pen-test, DR drill, multi-tenant) | B2B contracts |

---

## Sprint 0 — Beta gate (money path + new DB P0s)

**Goal:** Safe invite-only launch. Fix money-path P0s **#1–3, #11–12** from the master blocker list, plus **#21–23**.

### Money path (master #1–3, #11–12)

Pull concrete tickets from the consolidated master list. Typical money-path cluster from prior audits (map IDs when Agents 1–4 numbering lands):

| Focus | Likely work |
|-------|-------------|
| Credits / refunds | `refund_credits` overload cleanup; signature match edge callers; raise `MAX_REFUND` vs real costs |
| Credit cost truth | Unify divergent cost tables (`creditEconomics` / `subscriptionManager.PLANS` / pricing / DB) |
| Plan sync | Stripe `subscription.updated` → `plan_id`; stop defaulting missing metadata to `"pro"` |
| Abuse / metering | Harden permissive insert/usage policies; server-side rate limits on credit-sensitive edges |

> Do not ship beta until checkout → webhook → credit grant → deduct → refund smoke path is green.

### P0-21 — `cleanup_expired_documents()` missing `search_path`

**Evidence:** `supabase/migrations/20260628130000_production_hardening.sql` — `SECURITY DEFINER`, no `SET search_path`.

**Fix (new migration):**

```sql
CREATE OR REPLACE FUNCTION public.cleanup_expired_documents()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
-- existing body unchanged
$$;
```

**Verify:** `pg_proc.proconfig` contains `search_path=public`; cron still calls it as `service_role`.

### P0-22 — `avatars` bucket Studio drift

**Evidence:** Policies reference `bucket_id = 'avatars'` (`20260507041140_…`, `20260511154610_…`) but no `INSERT INTO storage.buckets` for `avatars` in repo migrations. App code expects bucket (`src/lib/supabase/storage.ts`, SettingsProfile).

**Fix (new migration):**

```sql
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  true,
  2097152,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = COALESCE(storage.buckets.file_size_limit, EXCLUDED.file_size_limit),
  allowed_mime_types = COALESCE(storage.buckets.allowed_mime_types, EXCLUDED.allowed_mime_types);
```

Align MIME/size with `src/lib/supabase/storage.ts`. Confirm owner-folder policies still match.

### P0-23 — Share-token entropy / anon surface

**Static nuance (important):**

| Migration | Effect |
|-----------|--------|
| `20260628150001_public_share_read.sql` | Broad anon SELECT: `is_shared AND share_token IS NOT NULL` |
| `20260628161000_public_share_token_rls.sql` | **Drops** those policies; token-scoped RPCs `get_shared_debrief` / `get_shared_scorecard` |

**Still open:**

1. **Live verify** `pg_policies` — confirm broad policies are gone in production.
2. **Debrief token entropy too low:** `DebriefAnalyticsPanels.tsx` uses `crypto.randomUUID().replace(/-/g, "").slice(0, 16)` → **64 bits**. Scorecard path uses 16 random bytes → **128 bits** (`useScorecard.ts` / `generateShareToken`).
3. RPC floor is `length(v_token) < 16` (chars), not 128-bit entropy.
4. No rate limit on share RPCs / routes.

**Fix:**

- Single shared `generateShareToken()` (≥16 cryptographically random bytes, hex/base64url).
- Replace debrief 16-hex slice; migrate regenerating active weak tokens optional.
- Tighten RPCs: `length(v_token) >= 32` (hex) or equivalent; keep charset check.
- Edge or WAF rate limit on `/share/*` and RPC callers.
- Confirm `DEPLOY_PRODUCTION_CHECKLIST` includes `20260628161000` applied.

**Beta exit criteria (Sprint 0):**

- [ ] Money-path smoke green
- [ ] P0-21 migration applied
- [ ] P0-22 bucket provenance in migrations + prod match
- [ ] P0-23: live policies match RPC-only intent; tokens ≥128 bits; rate limit in place

---

## Sprint 1 — DB security P1s (pre-GA)

| ID | Item | Action |
|----|------|--------|
| P1-A | `billing_settings` `USING (true)` for authenticated | Confirm columns are non-secret (prices/flags only — currently true). Prefer admin-read + edge/service for writes; optional authenticated read of public price fields via view. |
| P1-B | `exam_images` / `exam_papers` granted to `anon` | Confirm no answer keys / paid packs; if yes, revoke anon and serve via signed URLs or auth. |
| P1-C | `request_metrics_authed_insert` `WITH CHECK (true)` | Scope to `user_id = auth.uid()`, cap columns, or move inserts to service_role edge only. |
| P1-D | `question-images` storage policies rewritten 4× | Diff live `pg_policies` vs final migration intent; one cleanup migration if drift. |
| P1-E | Duplicate overloads (`refund_credits` ×3, `increment_profile_credits` ×2) | `DROP FUNCTION` obsolete signatures after edge callers audited. |

---

## Sprint 2 — Scale / hygiene (GA hardening)

| ID | Item | Action |
|----|------|--------|
| P1-F | No indexes on `room_participants` / `room_chat` | Add `(room_id)`, `(user_id)`, chat `(room_id, created_at DESC)`. |
| P1-G | Live `supabase db advisors` / linter | Run against prod project; close remaining SECURITY DEFINER / RLS warnings. |
| P1-H | Fresh-DB migrate drill | `supabase db reset` (or empty project) — catch missing tables / order bugs. |

---

## Sprint 3 — Auth dashboard (unverified in SQL)

Dashboard-only (not in migrations) — verify and document in runbook:

- [ ] MFA / TOTP for admin (or step-up)
- [ ] Leaked-password protection enabled
- [ ] OTP / magic-link expiry tightened
- [ ] Session / JWT expiry appropriate for paid product

---

## Score matrix (post–Agent 5)

| Dimension | Score |
|-----------|------:|
| Database / Supabase | 6/10 |
| Overall | 🔴 NO-GO public GA · 🟡 Beta after Sprint 0 |

---

## Execution notes

1. Create migrations with `supabase migration new <name>` — never invent filenames.
2. All new/replaced `SECURITY DEFINER` functions: `SET search_path = public` + explicit GRANTs.
3. After each DB sprint: advisors + smoke share links + billing path.
4. Prod project ref in `.env.production`: `qzgvjrvtkwlzxpmlddkx` — link MCP/CLI before claiming live linter clean.
5. Keep Agent 5 methodology note visible until live advisors run once.

---

## Suggested first PR (smallest Sprint 0 DB slice)

1. Migration: `search_path` on `cleanup_expired_documents`
2. Migration: `avatars` bucket upsert
3. App: unify share token generation to ≥128 bits; bump RPC length check
4. Checklist: confirm `20260628161000` applied in prod (`pg_policies` empty for `*_public_share`)
