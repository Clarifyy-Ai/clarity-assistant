# Career Pilot Electron Release

## Why download might not work

In-app **Download** buttons need a hosted installer URL. Without it, the app only shows the install guide.

**Desktop scope:** The Electron app is for **Practice Coach overlay sessions only** (login + live overlay). Dashboard, mock interviews, prep lab, billing, and admin run in your **web browser** — set `VITE_APP_URL` to that site so “Open in browser” links work from the desktop app.

Configure **one** of these in production (`.env` / hosting env vars):

```bash
# Direct URL (recommended after you upload the .exe)
VITE_DESKTOP_DOWNLOAD_URL_WIN=https://github.com/Clarifyy-Ai/clarity-assistant/releases/download/v1.0.0/Clarify-AI-Setup.exe

# Or auto-resolve from GitHub Releases latest tag
VITE_GITHUB_RELEASE_REPO=Clarifyy-Ai/clarity-assistant
```

Rebuild and redeploy the web app after setting env vars.

---

## Build Windows `.exe` locally

```powershell
npm ci
npm run dist:win
```

Installer output: **`release/Career Pilot Setup *.exe`** (NSIS).

### Install on Windows

1. Run the `.exe` from `release/`
2. If **SmartScreen** appears (unsigned build): **More info → Run anyway**
3. Allow microphone when Career Pilot starts
4. Sign in with the same account as the web app

---

## Publish for end users

### Option A — GitHub Release (recommended)

1. Tag a release: `git tag v1.0.0 && git push origin v1.0.0`
2. GitHub Action **Electron Release** builds and attaches the `.exe`
3. Or run workflow manually: Actions → Electron Release → Run workflow
4. Set `VITE_GITHUB_RELEASE_REPO=Clarifyy-Ai/clarity-assistant` so the app auto-finds the latest `.exe`

### Option B — Supabase Storage (fastest for private repos)

1. Apply migration: `npx supabase db push`
2. Add `SUPABASE_SERVICE_ROLE_KEY` to `.env.local` (Dashboard → API → service_role)
3. Build: `npm run dist:win`
4. Upload: `npm run publish:desktop-installer`
5. Copy the printed URL into production env:
   ```bash
   VITE_DESKTOP_DOWNLOAD_URL_WIN=https://YOUR_PROJECT.supabase.co/storage/v1/object/public/desktop-releases/Clarify-AI-Setup-1.0.0.exe
   ```
6. Rebuild and redeploy the **web app** (not just Electron)

### Option C — Install locally (no web download needed)

If you already built the `.exe` on this machine:

```powershell
npm run install:desktop
```

Or open `release-new\Career Pilot Setup 1.0.0.exe` directly in File Explorer.

---

## APIs and env to add

Operators must configure these before a production Electron build. Do **not** put OpenAI, Gemini, Deepgram, or Stripe **secret** keys in Electron or in GitHub Actions Electron secrets — those stay in Edge Function secrets.

**Supabase Dashboard → Project Settings → API**

- Project URL → `VITE_SUPABASE_URL`
- anon / publishable key → `VITE_SUPABASE_ANON_KEY` and `VITE_SUPABASE_PUBLISHABLE_KEY`
- Project ID → `VITE_SUPABASE_PROJECT_ID`

**GitHub Actions secrets** (repo → Settings → Secrets → workflow **Electron Release**)

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_APP_URL` (production website, not localhost)
- `VITE_SUPABASE_PROJECT_ID`
- `VITE_OAUTH_PROVIDERS` (e.g. `google` if that provider is enabled)

Local packaging uses the same `VITE_*` keys as the web app (`VITE_APP_ENV`, `VITE_APP_NAME`). Check with:

```bash
npm run electron:check-config
```

**Edge Functions secrets** (Dashboard or `npm run qa:sync-secrets`)

- `ALLOW_ELECTRON_NULL_ORIGIN=true` (desktop `file://` / null origin)
- `ALLOWED_ORIGINS`, `SITE_URL`, `PUBLIC_URL` — production website origin

**Auth redirect URLs**

Supabase Dashboard → Authentication → URL Configuration: Site URL and Redirect URLs must include the **web** origin (`VITE_APP_URL`), e.g. `{VITE_APP_URL}/auth/callback` and `{VITE_APP_URL}/reset-password`. The desktop app signs in against the same project; “Open in browser” uses that site.

Optional web-app download buttons: `VITE_DESKTOP_DOWNLOAD_URL_WIN` and/or `VITE_GITHUB_RELEASE_REPO` (see above).

---

## Prerequisites (signing — production)

- Apple Developer ID Application certificate (macOS)
- Windows Authenticode certificate (removes SmartScreen warnings)
- Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)

## Build all platforms

```bash
npm run build
npm run dist:win    # → release/*.exe
npm run dist:mac    # → release/*.dmg
npm run dist:linux  # → release/*.AppImage
```

## Tray icon

Electron reads `public/icon.png` (512×512 PNG). Update alongside web favicon when rebranding.

## Not in scope for this repo

Automated notarization and store submission require CI secrets configured outside git.
