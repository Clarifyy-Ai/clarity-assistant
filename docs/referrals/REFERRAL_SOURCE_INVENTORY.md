# Referral Source Inventory

## Client surfaces

| Surface | Path | Behaviour |
|---------|------|-----------|
| Signup | `src/pages/auth/Signup.tsx` | Stores `?ref=` via `storeRefCode` |
| Login | `src/pages/auth/Login.tsx` | Stores `?ref=` like Signup; banner when code present |
| OAuth | `src/components/auth/OAuthButton.tsx` | Stores `?ref=` before provider redirect |
| Marketing | `src/components/layout/MarketingLayout.tsx` | Silent store from URL on public pages |
| Onboarding index | `src/pages/onboarding/OnboardingIndex.tsx` | Claims via `recordReferral` using URL or storage |
| Onboarding step 1 | `src/pages/onboarding/OnboardingStep1Essentials.tsx` | Banner from `getStoredRefCode()` or URL |
| Referrals page | `src/pages/app/Referrals.tsx` | Dashboard RPC; canonical share link |
| Auth sign-out | `src/store/authStore.ts` | Clears `clarify_ref` storage |

## Helpers

- `src/lib/referrals.ts` — normalize/store/clear/`buildReferralLink`/`recordReferral`
- `src/lib/supabase/database.ts` — `referralsDB.getReferralDashboard()` (+ legacy list/stats)

## Edge

| Function | Auth | Role |
|----------|------|------|
| `record-referral` | JWT | Claim → `record_referral_reward` |
| `validate-referral-code` | Public, IP rate-limited | `{ valid, programmeVersion }` only |

## Database

| Object | Role |
|--------|------|
| `profiles.referral_code` | Server-minted unique code |
| `referrals` | Attribution row (first bind wins) |
| `referral_programmes` | Versioned programme terms |
| `referral_events` | Claim/conversion audit (service_role) |
| `referral_rewards` | Pending/granted reward ledger pointers |
| `billing_settings` | Legacy knobs; kept in sync with active programme |
| RPCs | `ensure_my_referral_code`, `get_my_referrals`, `get_referral_dashboard`, `record_referral_reward`, `mark_referral_converted` |

## Payment fulfill

- `supabase/functions/_shared/razorpayFulfill.ts` calls `mark_referral_converted` after first paid fulfill (no second credit).
