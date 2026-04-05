
# Production Audit Report — Clarify AI (v3)

Previous audits fixed: admin RBAC via `user_roles`, Landing/Pricing typography, Dashboard import, `App.css` cleanup, RLS hardening, credit deduction, streak/gamification queries.

This audit focuses on **remaining issues** not yet addressed.

---

## 🔴 Critical Issues

### SEC-1: Privilege Escalation via `user_roles` INSERT (STILL OPEN)
The security scan confirms: no INSERT-deny policy exists on `user_roles`. Any authenticated user can `INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), 'admin')` and become admin.

**Fix**: Migration to add a restrictive INSERT policy:
```sql
CREATE POLICY "user_roles_no_self_insert"
ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));
```
Also add UPDATE/DELETE restriction:
```sql
CREATE POLICY "user_roles_no_self_modify"
ON public.user_roles FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "user_roles_no_self_delete"
ON public.user_roles FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
```

### SEC-2: Profiles RLS Policies Apply to `{public}` Role
`profiles_own_select` and `profiles_own_insert` apply to the `{public}` role instead of `{authenticated}`. While `auth.uid()` returns NULL for unauthenticated users, best practice is to scope to `authenticated`.

**Fix**: Migration to drop and recreate these policies targeting `TO authenticated`.

### SEC-3: Feature Flags Publicly Readable
`flags_read` policy has `USING: true` on `{public}`. Exposes internal rollout config and user UUIDs.

**Fix**: Change policy to `TO authenticated`.

---

## 🟠 High Priority — Typography Violations

### Blog Page (`src/pages/marketing/Blog.tsx`)
| Element | Current | Target |
|---------|---------|--------|
| Hero section padding (line 92) | `pt-36 pb-16 px-6` | `pt-20 sm:pt-28 pb-14 px-4 sm:px-6` |
| Hero h1 (line 95) | `text-4xl sm:text-5xl` | `text-3xl md:text-4xl` |
| Hero body (line 96) | `text-lg` | `text-sm md:text-base` |
| Blog cards section (line 101) | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |
| Blog card title (line 122) | `text-lg font-bold` | `text-base font-bold` |

### Help Page (`src/pages/marketing/Help.tsx`)
| Element | Current | Target |
|---------|---------|--------|
| Hero section padding (line 95) | `pt-36 pb-16 px-6` | `pt-20 sm:pt-28 pb-14 px-4 sm:px-6` |
| Hero icon (line 98) | `w-10 h-10` | `w-8 h-8` |
| Hero h1 (line 99) | `text-4xl sm:text-5xl` | `text-3xl md:text-4xl` |
| Hero body (line 100) | `text-lg` | `text-sm md:text-base` |
| FAQ section (line 116) | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |
| Contact section (line 165) | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |

### Terms Page (`src/pages/marketing/Terms.tsx`)
| Element | Current | Target |
|---------|---------|--------|
| Article padding (line 12) | `pt-28 sm:pt-36 pb-16 sm:pb-24` | `pt-20 sm:pt-28 pb-14` |

### Privacy Page (likely same pattern as Terms)
Check and apply same padding fix.

### Landing Page — Pricing Teaser Plan Name (line 678)
| Element | Current | Target |
|---------|---------|--------|
| Plan name (line 678) | `text-lg font-bold` | `text-base font-bold` |

### Landing Page — Remaining Section Spacing
| Element | Current | Target |
|---------|---------|--------|
| Stats section (line 407) | `pb-16 sm:pb-20` | `pb-14` |
| How-it-works section (line 424) | `pb-16 sm:pb-24` | `pb-14 sm:pb-16` |
| Features section (line 456) | `pb-16 sm:pb-24` | `pb-14 sm:pb-16` |
| Testimonials section (line 554) | `pb-16 sm:pb-24` | `pb-14 sm:pb-16` |
| Proof section (line 601) | `pb-16 sm:pb-20` | `pb-14` |
| FAQ section (line 718) | `pb-16 sm:pb-24` | `pb-14 sm:pb-16` |

---

## 🟡 Medium Issues

### Leaked Password Protection Still Disabled
**Manual action**: Supabase Dashboard → Auth → Security → Enable leaked password protection.

### Extension in Public Schema
`pg_trgm` in public schema. Low risk, flagged by linter. Moving requires careful planning.

### Calendar Tokens in Plaintext
`calendar_integrations` stores `access_token` and `refresh_token` readable via client SELECT. Ideally, restrict SELECT to service_role and use edge functions for calendar operations. Deferred — requires architecture change.

### Realtime Messages Missing RLS
Any authenticated user can subscribe to any Realtime channel. Requires `realtime.messages` RLS policies. Deferred — complex implementation.

---

## 🟢 Minor Issues

- `console.warn` suppression in `App.tsx` lines 289-293 masks real warnings
- 98 files still use `@ts-nocheck` — systematic cleanup needed over multiple sessions
- Footer references "Payara Labs" — verify correct entity name
- Social links may point to non-existent profiles

---

## Implementation Order

1. **Migration**: Fix `user_roles` INSERT/UPDATE/DELETE policies (SEC-1)
2. **Migration**: Fix `profiles` RLS to `TO authenticated` (SEC-2)  
3. **Migration**: Fix `feature_flags` RLS to `TO authenticated` (SEC-3)
4. **Code**: Normalize Blog.tsx typography
5. **Code**: Normalize Help.tsx typography
6. **Code**: Normalize Terms.tsx and Privacy.tsx padding
7. **Code**: Fix Landing.tsx pricing teaser plan name + remaining section spacing

---

## 🚀 Production Readiness: 6/10

Up from 5/10. Auth RBAC, credit deduction, and primary page typography are fixed. The `user_roles` privilege escalation (SEC-1) remains the most critical blocker — any authenticated user can self-promote to admin. Once SEC-1–3 are patched and typography is normalized across all marketing pages, score rises to 7.5/10.
