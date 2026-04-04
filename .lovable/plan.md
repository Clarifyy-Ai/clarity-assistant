
# Production Audit Report — Clarify AI (v2)

---

## 🔴 Critical Issues

### SEC-1: Admin Check Still Uses `profiles.is_admin` (Client-Side)
**AdminLayout.tsx line 23** checks `p?.is_admin` from the profile object. While the `user_roles` table was created and the DB `is_admin()` function was updated, the **client-side admin check still reads from profiles**. The `profiles_own_update` RLS policy allows users to update their own profile, meaning a user could theoretically set `is_admin = true` via the Supabase client (the `protect_admin_column` trigger mitigates this, but the client code should use `user_roles` for defense-in-depth).
- **Fix**: Query `user_roles` table in `authStore.loadProfile()` and set `isAdmin` based on that, not `profile.is_admin`.

### SEC-2: Realtime Channel Authorization Missing
No RLS policies on `realtime.messages`. Any authenticated user can subscribe to other users' session transcripts, AI interactions, and notifications.
- **Fix**: Add RLS policies on `realtime.messages` scoped by topic and `auth.uid()`.

### SEC-3: Leaked Password Protection Disabled
Supabase Auth's leaked password protection is off. Users can register with known-compromised passwords.
- **Fix**: Enable in Supabase Dashboard → Auth → Security. (Manual action required.)

### APP-1: 98 Files with `@ts-nocheck`
98 files suppress all TypeScript checking. Runtime crashes (like the `options.map` error) are direct consequences. Critical files affected: `authStore.ts`, `Dashboard.tsx`, `TestSession.tsx`, `AdminLayout.tsx`.
- **Fix**: Prioritize removing `@ts-nocheck` from auth-critical and data-rendering files. Fix underlying type mismatches with Supabase generated types.

### APP-2: Dashboard Imports from Wrong Store
`Dashboard.tsx` line 7: `import { useAuthStore } from "@/store/userStore"` — imports auth from `userStore` instead of `authStore`. While `userStore` re-exports `authStore`, this creates confusion and potential state desync if the re-export ever breaks.
- **Fix**: Change to `import { useAuthStore } from "@/store/authStore"`.

---

## 🟠 High Priority Issues

### SEC-4: Extension in Public Schema
`pg_trgm` is installed in the `public` schema. Creates a larger attack surface.
- **Fix**: Move to `extensions` schema via migration.

### SEC-5: Referral Email PII Exposure
The `referrals` table exposes `referred_email` to referrers via the `referrals_select` policy.
- **Fix**: Restrict SELECT to exclude `referred_email` column, or mask it after conversion.

### PERF-1: FCP at 4.1 seconds
First Contentful Paint is 4.1s — poor by Core Web Vitals standards (good < 1.8s). Main contributors:
- `lucide-react.js` (161KB, 913ms) — loads the entire icon library
- `@sentry_react.js` (186KB) — loaded on landing page
- `chunk-RPCDYKBN.js` (141KB, 595ms) — React DOM chunk
- **Fix**: Tree-shake Lucide icons (use `import { Icon } from "lucide-react"` per-icon imports — already done but the bundle still includes the full library). Consider dynamic import for Sentry. Add `<link rel="preload">` for critical assets.

### PERF-2: Logo Image is 87KB PNG
The logo (`clarify-logo.png`) is 87KB. For a small logo, this is excessive.
- **Fix**: Convert to WebP or SVG. Target < 10KB.

### FUNC-1: `deduct_credits` RPC Still Has Two Overloads
The DB still has two `deduct_credits` function signatures. Edge functions now use the shared `_shared/supabase.ts` atomic approach, but the RPC overloads remain and could confuse future developers.
- **Fix**: Drop the unused overload via migration.

---

## 🟡 Medium Issues — Typography & UI

### TYP-1: Landing Page Hero Oversized
Current: `text-4xl sm:text-5xl lg:text-6xl` (line 276)
Target: `text-3xl md:text-4xl` per compact scale.
Hero body: Current `text-base sm:text-lg` → Target `text-sm md:text-base`.
CTA buttons: Current `px-7 py-3.5` is oversized → Target `px-5 py-2.5` (size="default").

### TYP-2: Landing Stats Numbers Oversized
Current: `text-2xl sm:text-3xl` (line 417) → Target `text-xl sm:text-2xl`.

### TYP-3: Pricing Page Hero Oversized
Current: `text-3xl sm:text-4xl lg:text-5xl` (Pricing.tsx line 35) → Target `text-3xl md:text-4xl`.
Body: `text-base sm:text-lg` → Target `text-sm md:text-base`.

### TYP-4: Pricing Plan Names
Current: `text-lg font-bold` → Target `text-base font-bold`.
Price display: `text-3xl font-extrabold` is acceptable.

### TYP-5: Landing CTA Section Oversized
CTA button (line 767): `text-base font-semibold px-10 py-4 rounded-2xl` is bloated → Target `text-sm font-semibold px-6 py-3 rounded-xl`.
CTA section padding: `p-10 sm:p-14` → Target `p-8 sm:p-10`.

### TYP-6: Section Padding Inconsistency
Landing uses `pb-16 sm:pb-24`, `py-16 sm:py-20`, `pb-24 sm:pb-32` — inconsistent. Standardize to `py-14` per compact scale.

### TYP-7: Dashboard StatCard Value
Current: `text-xl sm:text-2xl font-black` (line 300) — acceptable but `font-black` is heavier than needed. Consider `font-bold`.

### UX-1: Cookie Consent Covers Content on Mobile
Screenshot shows the cookie banner obscuring the product mockup on mobile 375px. The banner should be dismissible and not overlap critical content.

### UX-2: No Loading/Empty State for Some Pages
Several pages like `CompanyResearch`, `AnswerBank` use `@ts-nocheck` and may lack proper skeleton/empty states. Audit needed per page.

### UX-3: Mobile Nav Missing "Log in" on Small Screens
The marketing layout's "Log in" link is `hidden sm:inline-block` (line 90-91), so it's hidden on mobile. The hamburger menu does include it, but only when open.

---

## 🟢 Minor Issues

### MINOR-1: Console Warning Suppression
`App.tsx` lines 289-293 patch `console.warn` to suppress React Router warnings. This masks legitimate warnings.

### MINOR-2: `App.css` Contains Unused Vite Boilerplate
`src/App.css` still has the default Vite template CSS (logo animations, card styles). Not imported anywhere meaningful but should be cleaned up.

### MINOR-3: Social Links Point to Non-Existent Pages
Footer links to `https://twitter.com/clarifyai` and `https://github.com/clarifyai` — likely don't exist. Should be verified or removed.

### MINOR-4: Copyright Shows "Payara Labs"
Footer shows `© 2026 Payara Labs` — verify this is the correct entity name.

---

## 📈 Performance Metrics

| Metric | Value | Rating |
|---|---|---|
| TTFB | 499ms | Needs improvement |
| DOM Interactive | 967ms | OK |
| DOM Content Loaded | 2829ms | Poor |
| FCP | 4104ms | Poor (target < 1800ms) |
| CLS | 0.0002 | Good |
| JS Heap | 17.6MB | OK |
| DOM Nodes | 3378 | OK (landing page) |
| Total JS | 1274KB | High — tree-shaking needed |
| Logo image | 87KB PNG | Convert to WebP/SVG |
| Largest script | lucide-react 161KB | Tree-shake icons |

---

## 🔐 Security Risk Summary

| Risk | Severity | Status |
|---|---|---|
| Client-side admin check via profiles.is_admin | HIGH | Partially mitigated by trigger |
| Realtime channel leak | CRITICAL | Unfixed |
| Leaked password protection | HIGH | Disabled |
| Extension in public schema | MEDIUM | Unfixed |
| Referral email PII exposure | MEDIUM | Unfixed |
| 98 files with @ts-nocheck | HIGH | Type safety disabled |

---

## 📱 Responsiveness Report

| Device | Status | Issues |
|---|---|---|
| Mobile 375px | Mostly OK | Cookie banner overlaps content; hero text wraps well |
| Mobile 360px | Needs verification | MockTestHub was patched but other pages untested |
| Tablet 768px | Untested | Likely OK given responsive breakpoints |
| Desktop 1067px+ | Good | Primary development target |

---

## 🧭 UX/Navigation Issues

1. No visible credit quota indicator before hitting the limit on mock test creation
2. Admin layout has its own sidebar that doesn't integrate with the main AppSidebar — jarring transition
3. Onboarding step routes (/onboarding/step-1 through step-5) all redirect to /onboarding — confusing if bookmarked

---

## 🛠 Recommended Fixes (Priority Order)

1. **[CRITICAL]** Update `authStore.loadProfile()` to check `user_roles` table for admin status instead of `profiles.is_admin`
2. **[CRITICAL]** Enable leaked password protection (manual: Supabase Dashboard)
3. **[HIGH]** Optimize logo to WebP/SVG (< 10KB)
4. **[HIGH]** Fix Landing hero typography: `text-3xl md:text-4xl`, body `text-sm md:text-base`
5. **[HIGH]** Fix Landing CTA sizing: `px-6 py-3` instead of `px-10 py-4`
6. **[HIGH]** Fix Pricing hero: `text-3xl md:text-4xl`
7. **[HIGH]** Standardize section padding to `py-14` across Landing page
8. **[MEDIUM]** Fix Dashboard import from `@/store/authStore` instead of `@/store/userStore`
9. **[MEDIUM]** Clean up `App.css` boilerplate
10. **[MEDIUM]** Remove `@ts-nocheck` from top 10 critical files
11. **[LOW]** Verify social links exist or remove them
12. **[LOW]** Verify copyright entity name

---

## 🚀 Final Verdict

**Production Readiness Score: 5/10** (up from 4/10 after RLS fixes)

**Rationale**: The RLS hardening migration improved the security posture significantly. However, the client-side admin check still uses `profiles.is_admin`, leaked password protection is disabled, and Realtime channels remain unprotected. The 4.1s FCP is poor. Typography is inconsistent — the landing page uses oversized headings (`text-6xl`) that don't match a compact, mobile-first design system. The 98 `@ts-nocheck` files remain a significant risk for runtime crashes. The app needs typography normalization, performance optimization (logo, icon tree-shaking), and the remaining security items addressed before production launch.

---

## Implementation Plan

### Phase 1: Security (this session)
1. Update `authStore.loadProfile()` to query `user_roles` for admin status
2. Update `AdminLayout.tsx` to use `authStore.isAdmin` instead of `profile.is_admin`
3. Fix Dashboard import path

### Phase 2: Typography Normalization (this session)
4. Landing.tsx: Hero `text-3xl md:text-4xl`, body `text-sm md:text-base`, CTA `px-6 py-3`, section padding `py-14`
5. Pricing.tsx: Hero `text-3xl md:text-4xl`, body `text-sm md:text-base`
6. Standardize all section headings to `text-2xl md:text-3xl`

### Phase 3: Performance (this session)
7. Note logo optimization recommendation (requires asset replacement)
8. Clean up App.css boilerplate

### Phase 4: Deferred
- Remove `@ts-nocheck` systematically (multi-session effort)
- Realtime RLS (requires schema design for channel topics)
- Extension schema migration (requires careful planning)
