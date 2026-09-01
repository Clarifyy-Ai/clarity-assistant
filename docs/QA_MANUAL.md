# Career Pilot — Manual QA Scripts

For test items that cannot be automated in a jsdom sandbox.
Each script is tagged with its catalog T-ID where possible.

---

## Authentication (real OAuth providers)

### T-0016 to T-0027 — OAuth Sign-In flows
**Pre:** Logged out, on `/signup` or `/login`.
**Steps:**
1. Click each provider button (Google, GitHub, LinkedIn, Azure AD).
2. Confirm provider popup opens.
3. Authorise with a real test account.
4. On success, verify redirect to `/onboarding` (new user) or `/dashboard` (returning).
5. Cancel the provider popup → expect to land back on the auth page with no error toast.

**Expected:** All four providers complete signup; profile is pre-filled with display name + avatar from the provider; OAuth users skip email verification.

---

## Live Overlay (compliance-aware)

### T-Overlay Screen-Share Visibility
**Pre:** Active live session, screen share active in Zoom/Meet/Teams.
**Steps:**
1. Trigger overlay with `Ctrl+Shift+H`.
2. Have a second person view the screen share.

**Expected:** Overlay **remains visible** to screen-capture viewers. Capture evasion is disabled for compliance (`SCREEN_CAPTURE_EVASION_ENABLED = false`).

### T-Overlay Calm Mode (`Ctrl+Shift+P`)
**Pre:** Active session, overlay visible.
**Steps:** Press `Ctrl+Shift+P`.
**Expected:** Calm coaching panel appears (breathing steps). Overlay is **not** hidden from screen share.

---

## Real-Time Audio (microphone hardware)

### T-Audio Mic permission + RMS visualizer
**Pre:** Browser fresh profile, no mic permission granted.
**Steps:**
1. Navigate to `/onboarding/audio-setup`.
2. Click "Test microphone".
3. Grant permission in the browser dialog.
4. Speak into the mic.

**Expected:** RMS visualizer animates in real-time; "Permission granted" success message; "Next" button enables.

### T-Audio System-Audio capture (Chromium only)
**Pre:** Chrome/Edge desktop, live session start.
**Steps:** Choose "Share tab + audio" in the screen-share picker. Play audio in the shared tab.
**Expected:** Audio reaches Deepgram; transcripts appear within 1–2s.

---

## Billing — Stripe (real checkout)

### T-Billing Stripe Pro upgrade
**Pre:** Logged in, free plan.
**Steps:**
1. Click "Upgrade" → "Pro".
2. In Stripe Checkout, use test card `4242 4242 4242 4242`, any future expiry, any CVC.
3. Complete payment.

**Expected:** Redirect to `/app/settings/billing?success=1` within 5s; `profile.plan_id` = `pro`; `subscription_status` = `active`; credits reset to plan allowance.

### T-Billing Stripe customer portal
**Pre:** Logged in, paid plan.
**Steps:** Settings → Billing → "Manage subscription".
**Expected:** Stripe customer portal opens in new tab; cancel/update card works; webhook reflects changes within 10s.

---

## Email delivery (real SMTP)

### T-Auth Verification email arrives within 30s
**Pre:** Inbox accessible, clean signup.
**Steps:** Sign up with `+test` alias (e.g. `you+t1@gmail.com`). Watch inbox.
**Expected:** Verification email arrives within 30s; clicking the link redirects to dashboard.

### T-Auth Password reset email
**Pre:** Existing account.
**Steps:** Click "Forgot password" → enter email → check inbox.
**Expected:** Reset email arrives within 30s; link works exactly once; redirects to `/reset-password`.

---

## Cross-platform / Cross-browser (T7 area)

### T-Compat Smoke test on each browser
**Browsers:** Chrome, Edge, Firefox, Safari.
**Steps for each:** Login → Dashboard renders → Start session → Mic capture works → Logout.
**Expected:** All flows work; visuals consistent (allow minor font-rendering differences in Safari).

### T-Compat Mobile responsive
**Devices:** iPhone (Safari), Android (Chrome) — viewports 375px and 414px.
**Steps:** Landing → Login → Dashboard → Settings.
**Expected:** No horizontal scroll; tap targets ≥ 44px; sidebar collapses to bottom nav.

---

## Accessibility (T8 area — manual screen reader)

### T-A11y VoiceOver / NVDA pass on auth flow
**Pre:** Screen reader enabled.
**Steps:** Tab through `/login`, then `/signup`.
**Expected:** Every input has a label; error messages are announced; focus order matches visual order; no keyboard traps.

---

## Notes

- Run these manually before each production release.
- For OAuth/Stripe, use **dedicated test accounts** — never production credentials.
- Document any failure with browser, OS, account, timestamp, and screenshot.
