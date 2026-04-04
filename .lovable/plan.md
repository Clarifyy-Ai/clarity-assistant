
# Production Audit Report & Implementation Plan — Clarify AI (v2)

## Summary

Full end-to-end audit completed. Production readiness: **5/10**. Four categories of fixes identified: security, typography normalization, performance, and code cleanup.

---

## 🔴 Critical Issues

### SEC-1: Admin Check Uses `profiles.is_admin` (Client-Side)
`AdminLayout.tsx` line 23 checks `p?.is_admin` from profile. `authStore.loadProfile()` line 319 sets `isAdmin` from `profiles.is_admin`. Despite the `user_roles` table and `protect_admin_column` trigger, the client code should query `user_roles` directly.

**Fix in `src/store/authStore.ts` (loadProfile method, ~line 299-323):**
Replace the single profiles query with parallel queries for profile + user_roles:
```typescript
loadProfile: async () => {
  const userId = get().user?.id;
  if (!userId) return;

  const [profileRes, roleRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", userId).single(),
    supabase.from("user_roles").select("role").eq("user_id", userId).eq("role", "admin").maybeSingle(),
  ]);

  if (profileRes.error || !profileRes.data) {
    console.error("[authStore] Failed to load profile:", profileRes.error?.message);
    return;
  }

  const row = profileRes.data as Record<string, unknown>;
  const hasAdminRole = !!roleRes.data;

  _set((s) => {
    s.profile         = profileRes.data as unknown as ProfileRow;
    s.isProfileLoaded = true;
    s.isAdmin         = hasAdminRole;
    s.isOnboarded     = (row.onboarding_completed as boolean) ?? false;
    s.planId          = (row.plan_id as string) ?? "free";
    s.credits         = (row.credits as number) ?? 0;
  });
},
```

**Fix in `src/pages/app/admin/AdminLayout.tsx`:**
- Change import from `@/store/userStore` to `@/store/authStore`
- Replace `const { profile } = useAuthStore(); const p = profile as ProfileRow | null; if (!p?.is_admin)` with `const { isAdmin } = useAuthStore(); if (!isAdmin)`
- Remove unused `ProfileRow` import

### APP-1: Dashboard Imports from Wrong Store
**Fix `src/pages/app/Dashboard.tsx` line 7:** Change `import { useAuthStore } from "@/store/userStore"` to `import { useAuthStore } from "@/store/authStore"`

---

## 🟠 High Priority — Typography Normalization

### Landing Page (`src/pages/marketing/Landing.tsx`)

| Element | Current | Target |
|---------|---------|--------|
| Hero h1 (line 276) | `text-4xl sm:text-5xl lg:text-6xl` | `text-3xl md:text-4xl` |
| Hero body (line 282) | `text-base sm:text-lg` | `text-sm md:text-base` |
| Hero CTA button (line 289) | `px-7 py-3.5` | `px-5 py-2.5` |
| Secondary CTA (line 296) | `px-7 py-3.5` | `px-5 py-2.5` |
| Hero section padding (line 264) | `pt-24 sm:pt-36 pb-16 sm:pb-24` | `pt-20 sm:pt-28 pb-14` |
| Stats numbers (line 417) | `text-2xl sm:text-3xl` | `text-xl sm:text-2xl` |
| Section headings (lines 427, 459, 505, 557, 603, 625, 721) | `text-2xl sm:text-3xl` | `text-2xl md:text-3xl` (OK — keep) |
| How-it-works section (line 425) | `py-16 sm:py-20` | `py-14` |
| Feature card title (line 484) | `text-base font-bold` | OK — keep |
| Feature card desc (line 485) | `text-sm` | OK — keep |
| Comparison section (line 504) | `py-16 sm:py-20` | `py-14` |
| Pricing teaser section (line 623) | `py-16 sm:py-20` | `py-14` |
| CTA section (line 752) | `pb-24 sm:pb-32` | `pb-16 sm:pb-20` |
| CTA container (line 755) | `p-10 sm:p-14` | `p-8 sm:p-10` |
| CTA button (line 767) | `text-base px-10 py-4 rounded-2xl` | `text-sm px-6 py-3 rounded-xl` |
| CTA heading (line 758) | `text-2xl sm:text-3xl` | OK — keep |

### Pricing Page (`src/pages/marketing/Pricing.tsx`)

| Element | Current | Target |
|---------|---------|--------|
| Hero h1 (line 35) | `text-3xl sm:text-4xl lg:text-5xl` | `text-3xl md:text-4xl` |
| Hero body (line 38) | `text-base sm:text-lg` | `text-sm md:text-base` |
| Hero section padding (line 32) | `pt-24 sm:pt-36` | `pt-20 sm:pt-28` |
| Plan name (line 96) | `text-lg font-bold` | `text-base font-bold` |
| Feature list text (line 121) | `text-sm` | `text-xs` |

---

## 🟡 Medium Issues

### Performance
- **FCP: 4.1s** — Poor. `lucide-react.js` is 161KB/913ms. Logo is 87KB PNG.
- Recommendation: Convert logo to WebP/SVG (< 10KB). Investigate Lucide tree-shaking.

### Code Cleanup
- **`src/App.css`**: Contains unused Vite boilerplate (logo-spin animation, `.read-the-docs`, etc.). Replace with single comment line.
- **Console warning suppression** (`App.tsx` lines 289-293): Patches `console.warn` — masks real warnings.

---

## 🟢 Minor Issues
- Footer social links may point to non-existent pages (twitter.com/clarifyai, github.com/clarifyai)
- Copyright shows "Payara Labs" — verify correct entity
- 98 files still have `@ts-nocheck` (deferred — multi-session effort)

---

## 🔐 Security — Manual Action Required
- **Enable Leaked Password Protection**: Supabase Dashboard → Auth → Security

---

## Implementation Order

1. Fix `authStore.loadProfile()` to query `user_roles` for admin status
2. Fix `AdminLayout.tsx` import and admin check
3. Fix `Dashboard.tsx` import path
4. Apply Landing.tsx typography normalization (hero, CTAs, section padding)
5. Apply Pricing.tsx typography normalization
6. Clean up `App.css`

All changes are code-only (no migrations needed). The `user_roles` table and RLS policies already exist from the previous migration.
