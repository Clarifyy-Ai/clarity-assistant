# Google Calendar OAuth (Connect / Disconnect)

Unblocks Settings → Integrations → Google Calendar when Google shows
**Error 403: access_denied** / “trycareerpilot.com has not completed the Google verification process.”

## Classification

| Symptom | Workbook |
|---------|----------|
| Connect opens Google, then **Access blocked** / 403 | **Blocked — QA-GAP-007** (OAuth Test users / verification) — not a product Connect bug |
| Connect → Connected → Disconnect | Pass after Test user (or verified app) + Edge allowlist |

This is **separate from Google Sign-In** (Supabase Auth `email profile`). Calendar uses Edge PKCE with sensitive scope `calendar.events`.

**Product soft-gate:** Until Google verification is published, general users never receive an authorization URL. Connect is offered only when `GOOGLE_CALENDAR_PUBLIC_OAUTH=true` **or** the signed-in Career Pilot email is listed in `GOOGLE_CALENDAR_TEST_USERS`. Manual interview scheduling always works without Connect.

---

## App flow (reference)

1. Settings → Integrations → **Connect** (only if probe `connectAllowed: true`)
2. `POST sync-calendar` `{ action: "oauth_start" }` → Google authorize URL (or **403 `OAUTH_NOT_PUBLIC`** if gated)
3. Redirect: `https://trycareerpilot.com/app/settings/calendar-callback` (prod) or localhost equivalent
4. `oauth_callback` stores refresh token; UI shows Connected / Disconnect

Scopes (server): `https://www.googleapis.com/auth/calendar.events` + `email` only.

Edge secrets:

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` (aliases: `GOOGLE_OAUTH_*`, `GOOGLE_CALENDAR_*`)
- `GOOGLE_CALENDAR_PUBLIC_OAUTH` — `true` only after Google verification is live (default unset/`false`)
- `GOOGLE_CALENDAR_TEST_USERS` — comma-separated Career Pilot account emails allowed to Connect while Testing (case-insensitive)

Probe response when secrets are configured:

```json
{
  "available": true,
  "configured": true,
  "publicOauth": false,
  "connectAllowed": false,
  "reason": "verification_pending"
}
```

Do **not** flip FeatureKillGate `calendar_sync` off — that hides interview routes and breaks manual scheduling.

---

## Ops — unblock QA (Test users)

Google Cloud Console for the **same** OAuth Web client as Edge secrets:

1. **APIs & Services → OAuth consent screen**
2. Publishing status: **Testing** (closed beta)
3. **Test users** → Add every QA Gmail that will click Connect (must match the account chosen on Google’s screen)
4. Set Edge secret `GOOGLE_CALENDAR_TEST_USERS` to those **same** emails (Career Pilot login emails), e.g. `qa1@example.com,qa2@example.com`
5. Enable **Google Calendar API**
6. OAuth client → Authorized redirect URIs:
   - `https://trycareerpilot.com/app/settings/calendar-callback`
   - `http://localhost:5173/app/settings/calendar-callback` (local)
7. Confirm Edge secrets match that client (`npm run qa:sync-secrets` if rotating)
8. Redeploy `sync-calendar` after changing audience secrets

**Re-test:** Connect with a listed Test user (Google Console **and** Edge allowlist) → Connected → Sync / Disconnect → Reconnect.

Until Google **verification** for `calendar.events` is complete:

- General users see “verification pending” / Coming soon — **no** Google Access blocked interstitial
- Non–allowlisted accounts that somehow hit `oauth_start` get **403 `OAUTH_NOT_PUBLIC`** (no `authorization_url`)

Never instruct end users to bypass Google security screens.

---

## Production (after verification)

1. Publish OAuth app + submit verification for sensitive scope `calendar.events`
2. Privacy policy, homepage, demo video, justified use (“interview events only”)
3. Keep branding / authorized domains aligned with `trycareerpilot.com`
4. Set Edge `GOOGLE_CALENDAR_PUBLIC_OAUTH=true` and redeploy `sync-calendar`
5. Re-enable Connect for all entitled Pro users (probe `connectAllowed: true`, `reason: "ok"`)

---

## Browser verification checklist

- [ ] General account: Connect not offered / no Google Access blocked interstitial
- [ ] Allowlisted Test user: Connect → Connected → Sync / event (if API enabled) → Disconnect → Reconnect
- [ ] Deny consent: `?calendar=denied` amber banner
- [ ] Schedule interview without Connect succeeds

---

## In-app UX

- Probe drives Settings / Interviews / New Interview CTAs (`verification_pending` vs Connect)
- Pre-connect footnote explains Testing / Test users when Connect is allowed
- If Google redirects back with `access_denied` → `?calendar=denied` → amber banner + toast with Test user / verification guidance

---

## Related

- [`EXTERNAL_CONFIGURATION_HANDOFF.md`](../../EXTERNAL_CONFIGURATION_HANDOFF.md) — Calendar section
- [`QA_ENVIRONMENT_GAPS.md`](./QA_ENVIRONMENT_GAPS.md) — **QA-GAP-007**
- [`supabase/functions/_shared/googleCalendar.ts`](../../supabase/functions/_shared/googleCalendar.ts)
