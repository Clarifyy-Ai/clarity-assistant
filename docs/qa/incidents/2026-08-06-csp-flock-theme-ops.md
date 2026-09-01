# INC-2026-08-06 — Production CSP flock + theme-init + Auth HIBP

| Field | Value |
|-------|-------|
| **Status** | OPEN — host/ops actions required for unconditional GO |
| **Site** | https://clarify.ai.sltfinanceindia.com |
| **Repo tip** | Working tree has `/theme-init.js`; live still `./theme-init.js` until redeploy |
| **Related** | REL-2026-08-05-STAB, post-deploy CONDITIONAL GO |

---

## RC-A — Lovable `/~flock.js` CSP violation

**Symptom:** Console blocks inline script  
`sha256-94vmev1ZHn894g2iVWfQ1aQu9FkC2BtPA7fJnXbTA7Y=`  
UI shows **“Edit with”** badge; HTML includes `src="/~flock.js"`.

**Root cause:** Host/platform injection by Lovable (gpteng). **Not in repo** (`index.html`, Vite, CI). Flock loads a widget that executes inline JS blocked by `script-src 'self'`.

**Do not:** add `'unsafe-inline'` or fragile hash allowlists for flock.

### Ops fix (Lovable dashboard)

1. Open the Career Pilot project in Lovable.
2. Disable production **badge / “Edit with” / flock / preview widget** for the custom domain.
3. Re-publish / clear CDN cache.
4. Verify home HTML has **no** `src="/~flock.js"` and cold-load console has **no** CSP script errors.
5. Optional later: remove `https://cdn.gpteng.co` from `font-src` if widget fonts are gone.

---

## RC-B — Relative `theme-init.js` on live

**Symptom:** Nested routes request `/app/theme-init.js` → MIME / `ERR_ABORTED`.

**Root cause:** Live (and stale `dist/`) still ship `./theme-init.js`. Repo working tree already uses absolute `/theme-init.js` (`index.html`).

### Ops fix

1. Commit + deploy tip that includes absolute `/theme-init.js`.
2. Rebuild so `dist/index.html` matches.
3. Hard-refresh / purge CDN.
4. Confirm home HTML: `src="/theme-init.js"` and `/app/*` no longer fetches `/app/theme-init.js`.

---

## RC-C — Leaked password protection disabled (advisor WARN)

**Cannot be set via SQL.** Management API attempt (`PATCH …/config/auth` with `password_hibp_enabled: true`) returned **402 Payment Required**:

> Configuring leaked password protection via HaveIBeenPwned.org is available on **Pro Plans and up**.

Enable only after project is on Pro+:

**Auth → Providers → Email → Password → Leaked password protection (HaveIBeenPwned)** → Enable  
or PATCH `password_hibp_enabled: true` via Management API.

Docs: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

Until upgrade: keep strong `password_min_length` / character requirements; treat advisor WARN as accepted risk.

---

## DEFINER grants (verified 2026-08-06)

Evidence: `docs/qa/audits/post-deploy-definer-grants-check.json`

| RPC class | anon | authenticated | In-function gate |
|-----------|------|---------------|------------------|
| `bulk_update_users`, `get_admin_*` | no EXECUTE | yes | `has_role(...,'admin')` |
| `get_shared_debrief`, `get_shared_scorecard` | yes (token) | yes | share token validation |

**Do not revoke** share EXECUTE from anon (breaks public share links).  
**Do not revoke** admin EXECUTE from authenticated (portal needs it; non-admins get “Admin only”).

---

## Acceptance for unconditional GO

- [ ] Live HTML: no `/~flock.js`
- [ ] Cold-load: no CSP inline-script errors from flock
- [ ] Live HTML: `src="/theme-init.js"`
- [ ] Nested `/app/*`: no `/app/theme-init.js` abort
- [ ] Auth leaked-password protection enabled (advisor clear)
- [ ] Re-run `node scripts/post-deploy-full-suite.mjs` → CSP + theme-init PASS
