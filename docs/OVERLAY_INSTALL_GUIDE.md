# Practice Coach overlay — install, system settings & troubleshooting

Clarify AI’s **Practice Coach** shows AI coaching hints in an on-screen overlay during rehearsal sessions. The overlay is a **normal application window** — it remains **visible on screen share, recordings, and proctoring tools**. It is not designed to be hidden during real interviews.

---

## Before you start

- Use Practice Coach for **mock interviews and rehearsal only**.
- If you share your screen, assume **everyone can see the overlay**.
- Complete the **screen share visibility** acknowledgment in session setup before starting.

---

## Web browser setup (recommended: Chrome or Edge)

### 1. Sign in and open Practice Coach

1. Log in at your Clarify AI URL.
2. Go to **Dashboard → Practice Coach** (or `/app/live`).
3. Complete the session setup wizard through **Connect** (step 6).

### 2. Allow microphone access

When the browser prompts:

1. Click **Allow** for microphone access.
2. If you previously blocked it:
   - **Chrome/Edge:** lock icon in address bar → Site settings → Microphone → Allow → reload.
   - **Safari:** Safari → Settings for This Website → Microphone → Allow.
   - **Firefox:** shield/lock icon → Permissions → use microphone → Allow.

### 3. OS input device (Windows / macOS / Linux)

Pick the mic you actually use:

| OS | Path |
|----|------|
| **Windows 11/10** | Settings → System → Sound → Input → choose device → test |
| **macOS** | System Settings → Sound → Input → select mic → level meter moves when you speak |
| **Linux** | Settings → Sound → Input (or `pavucontrol`) → default source |

Then verify in **Settings → Audio & speech → Test mic** inside Clarify AI.

### 4. System / tab audio (optional, Chromium only)

To hear the interviewer through Zoom / Meet / Teams in the **browser tab**:

1. Enable **System Audio** in session setup (step 6).
2. Open the meeting in a **browser tab** (not the desktop app).
3. When Clarify AI opens the share picker:
   - Select the **meeting tab** (not “Entire screen”).
   - Tick **Share tab audio** — required on Chrome/Edge.
4. Confirm the overlay shows **Mic + Tab** in the audio badge.

Safari and Firefox do not support tab-audio capture in this flow; use microphone-only or switch to Chrome/Edge.

### 5. Overlay controls (web)

| Action | Shortcut |
|--------|----------|
| Toggle overlay minimize / restore | `Ctrl+Shift+H` (`⌘+Shift+H` on Mac) |
| Calm coaching steps | `Ctrl+Shift+P` |
| Generate AI answer | `Ctrl+Enter` |
| Full list | `/shortcuts` or Settings → Keyboard shortcuts |

If the overlay disappears, click **Show Overlay** / **Restore Overlay** (bottom-right) or press `Ctrl+Shift+H`.

---

## Desktop app (Electron)

### Install

| Platform | Command (from repo) | Output |
|----------|---------------------|--------|
| Windows | `npm run dist:win` | NSIS `.exe` in `release/` |
| macOS | `npm run dist:mac` | `.dmg` in `release/` |
| Linux | `npm run dist:linux` | `.AppImage` in `release/` |

End users: download the signed installer from your release channel, run the wizard, and sign in.

**Windows:** allow SmartScreen if the installer is newly published; use a signed Authenticode build in production.

**macOS:** drag to Applications; on first open, approve in Privacy & Security if Gatekeeper prompts. Production builds should be notarized (see `docs/ELECTRON_RELEASE.md`).

**Linux:** `chmod +x Clarify AI*.AppImage` then run.

### Desktop-specific settings

1. **Microphone:** allow when Clarify AI first requests access (Windows Privacy → Microphone; macOS Privacy → Microphone → Clarify AI).
2. **Tray icon:** closing the overlay window **hides to tray** — use tray → **Quit** to exit fully.
3. **Always on top:** the overlay floats above other windows and **appears in screen capture** by design (compliance).
4. **Global hotkey:** `Ctrl+Shift+A` requests an AI answer system-wide (desktop only). If it fails, another app may own the shortcut — see troubleshooting.

Dev mode: `npm run dev:electron`

---

## Mobile (phone / tablet)

Practice Coach is **optimized for desktop**. On mobile:

- You can open setup and start a session, but floating overlay space and tab-audio capture are limited.
- Prefer **Mock Interview** for phone-sized practice.
- **Warning:** if you mirror or share your phone screen, the overlay **remains visible** to viewers.

The app shows a notification when you open Practice Coach on mobile reminding you of visibility rules.

---

## Troubleshooting

### Microphone denied or silent

- Reload and click **Allow**.
- Check OS privacy settings for browser / Clarify AI.
- Close apps holding the mic (Zoom, Discord, etc.).
- Run **Settings → Audio & speech → Test mic**.

### Interviewer not heard (mic-only)

- Enable **System Audio** before start.
- Share the **meeting tab**, not full screen.
- Tick **Share tab audio** in the picker.
- Use Chrome/Edge with a browser-based meeting.

### Overlay missing

- `Ctrl+Shift+H` or **Restore Overlay** button.
- Desktop: tray → **Show Clarify AI**.
- Web: keep the Clarify AI tab open — overlay is tied to the session tab.

### Slow hints / transcript lag

- Stable network; avoid high-latency VPN.
- Use **Gemini Flash** in setup.
- Close heavy tabs.

### Desktop global hotkey conflict

- Quit apps using `Ctrl+Shift+A`.
- Restart Clarify AI after install.

### Session fails to start

- Check credits and plan limits.
- Verify Supabase / API env on self-hosted builds.
- Read the red error banner in setup step 6 (audio preflight).

---

## Coding screen capture (during session)

1. Start a Practice Coach session.
2. Click **Capture** in the overlay toolbar (or press `Ctrl+Shift+C`).
3. Allow screen share when prompted (one time per capture).
4. **Drag a box** around the coding question on the frozen preview.
5. Clarify AI streams a **full answer** (2 credits) — uses the spoken question if detected, otherwise reads the problem from your selection.

Pick **Coding** (or your interview type) in session setup so prompts match the session.

- [COMPLIANCE_GATING.md](./COMPLIANCE_GATING.md) — visibility policy
- [ELECTRON_RELEASE.md](./ELECTRON_RELEASE.md) — signing & distribution
- [QA_MANUAL.md](./QA_MANUAL.md) — manual overlay QA steps
- In-app: **Settings → Practice Coach** (redirects to guide), **`/app/guide/practice-coach`** (sign-in required)
