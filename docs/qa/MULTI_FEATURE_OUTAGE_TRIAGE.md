# Multi-feature outage triage (2026-09-05)

Classification from code review + confirmed defect patterns (ops still needed where noted).

| Area | Class | Finding |
|------|--------|---------|
| Admin Access Denied / “completely broken” | **Code** | `ADMIN_ROLE_WAIT_MS` (6s) << role check + retry (~24s). Also `isAdminResolved` set **before** moderator RPC finishes → brief/false Access Denied for moderators. |
| Admin Mail folders | **Ops + UX** | Needs `HOSTINGER_MAIL_API_TOKEN`. Diagnostics wrongly checked `HOSTINGER_MAIL_TOKEN`. Tracking folders empty by design without auto-filing. |
| Live chat | **Code + Ops** | Guest `list`/`bootstrap` counted against 8/min token limit → 429. Admin Realtime degrade had no auto-poll. CORS needs `ALLOWED_ORIGINS` for non-prod hosts. |
| Gov exam | **Mostly ops / data** | BUG13 routing already fixed. Remaining: missing `exam.code`, workers, India override. Prefetch gaps add perceived slowness. |
| Slow navigation | **Code** | MFA gate resets to full-page splash on remount; lazy chunks for gov/admin subroutes not prefetched. |

## Fixes shipped in this pass

1. Align admin role wait with role timeout budget; resolve moderator before `isAdminResolved`.
2. Correct Hostinger secret name in finance diagnostics; honest empty-folder copy in Admin Mail.
3. Exempt support-chat read actions from tight guest limits; admin live-chat polls when Realtime degraded.
4. Prefetch gov generate/detail + key admin routes; MFA allow-cache to avoid splash flash on remount.

## Ops still required

- Set Edge `HOSTINGER_MAIL_API_TOKEN` if mail shows not configured.
- Confirm admin accounts have `user_roles.role = 'admin'`.
- Confirm `ALLOWED_ORIGINS` includes the browser origin used for support chat.
- Redeploy `support-chat` and `admin-finance-report` after this change.

## Automated / code verification

- Admin role wait uses `ADMIN_ROLE_WAIT_MS` (= 2× role timeout + 4s).
- Moderator resolved before `isAdminResolved`.
- Unit: `npx vitest run src/test/lib/auth/accountBootstrap.test.ts src/test/lib/auth/authStoreBootstrap.test.ts`

## Browser verification (ops)

- [ ] Admin login → `/app/admin` without Access Denied
- [ ] `/app/admin/mail` Configured + folders (or clear not-configured)
- [ ] Support widget connects; Admin Live Support refreshes when Realtime degraded
- [ ] Gov hub View / Generate with valid exam codes
- [ ] Navigate between app routes without multi-second full splash
