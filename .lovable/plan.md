
# Production Audit Report — Clarify AI (v3)

Previous audits fixed: admin RBAC via `user_roles`, Landing/Pricing typography, Dashboard import, `App.css` cleanup, RLS hardening, credit deduction, streak/gamification queries.

This audit focuses on **remaining issues** not yet addressed.

---

## 🔴 Critical Issues

### SEC-1: Privilege Escalation via `user_roles` INSERT (STILL OPEN)
The security scan confirms: no INSERT-deny policy exists on `user_roles`. Any authenticated user can `INSERT INTO user_roles (user_id, role) VALUES (auth.uid(), 'admin')` and become admin.

**Fix**: Migration to add restrictive INSERT/UPDATE/DELETE policies — only existing admins can modify roles.

### SEC-2: Profiles RLS Policies Apply to `{public}` Role
`profiles_own_select` and `profiles_own_insert` apply to the `{public}` role instead of `{authenticated}`. While `auth.uid()` returns NULL for unauthenticated users, best practice is to scope to `authenticated`.

**Fix**: Migration to drop and recreate these policies targeting `TO authenticated`.

### SEC-3: Feature Flags Publicly Readable
`flags_read` policy has `USING: true` on `{public}`. Exposes internal rollout config and user UUIDs.

**Fix**: Change policy to `TO authenticated`.

---

## 🟠 High Priority — Typography Violations

### Blog Page (`Blog.tsx`)
| Element | Current | Target |
|---------|---------|--------|
| Hero padding | `pt-36 pb-16 px-6` | `pt-20 sm:pt-28 pb-14 px-4 sm:px-6` |
| Hero h1 | `text-4xl sm:text-5xl` | `text-3xl md:text-4xl` |
| Hero body | `text-lg` | `text-sm md:text-base` |
| Cards section | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |
| Card title | `text-lg font-bold` | `text-base font-bold` |

### Help Page (`Help.tsx`)
| Element | Current | Target |
|---------|---------|--------|
| Hero padding | `pt-36 pb-16 px-6` | `pt-20 sm:pt-28 pb-14 px-4 sm:px-6` |
| Hero icon | `w-10 h-10` | `w-8 h-8` |
| Hero h1 | `text-4xl sm:text-5xl` | `text-3xl md:text-4xl` |
| Hero body | `text-lg` | `text-sm md:text-base` |
| FAQ section | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |
| Contact section | `pb-24 px-6` | `pb-14 px-4 sm:px-6` |

### Terms/Privacy Pages
| Element | Current | Target |
|---------|---------|--------|
| Article padding | `pt-28 sm:pt-36 pb-16 sm:pb-24` | `pt-20 sm:pt-28 pb-14` |

### Landing Page — Remaining Fixes
| Element | Current | Target |
|---------|---------|--------|
| Pricing teaser plan name (line 678) | `text-lg font-bold` | `text-base font-bold` |
| Stats section | `pb-16 sm:pb-20` | `pb-14` |
| How-it-works/Features/Testimonials/FAQ sections | `pb-16 sm:pb-24` | `pb-14 sm:pb-16` |
| Proof section | `pb-16 sm:pb-20` | `pb-14` |

---

## 🟡 Medium Issues

- **Leaked Password Protection** still disabled (manual: Supabase Dashboard → Auth → Security)
- **Calendar tokens in plaintext** — deferred, requires architecture change
- **Realtime messages missing RLS** — deferred, complex implementation
- `console.warn` suppression in `App.tsx` masks real warnings

---

## 🟢 Minor Issues
- 98 files with `@ts-nocheck` (multi-session effort)
- Footer entity name "Payara Labs" — verify
- Social links may be dead

---

## Implementation Order

1. Migration: Fix `user_roles` INSERT/UPDATE/DELETE policies (SEC-1)
2. Migration: Fix `profiles` RLS to `TO authenticated` (SEC-2)
3. Migration: Fix `feature_flags` RLS to `TO authenticated` (SEC-3)
4. Code: Normalize Blog.tsx typography
5. Code: Normalize Help.tsx typography
6. Code: Normalize Terms.tsx and Privacy.tsx padding
7. Code: Fix Landing.tsx remaining spacing and plan name

## 🚀 Production Readiness: 6/10

Up from 5/10. The `user_roles` privilege escalation (SEC-1) is the top blocker. Once SEC-1–3 are patched and typography normalized, score rises to 7.5/10.
