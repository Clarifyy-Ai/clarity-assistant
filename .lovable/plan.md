

## Diagnosis

The preview shows a blank/minimal page because of two major issues:

### 1. Route Mismatch (Critical — causes blank screens)
The **router** in `App.tsx` defines all app routes WITHOUT the `/app` prefix (e.g., `/dashboard`, `/live`, `/mock`, `/settings`), but the **sidebar** and **Settings page** link to routes WITH `/app` prefix (e.g., `/app/live`, `/app/mock`, `/app/settings/profile`). This means clicking any sidebar link navigates to a route that does not exist, hitting the 404 page or showing nothing.

Additionally, the route `/app` has a redirect to `/dashboard`, but the sidebar's "Dashboard" link points to `/app` with `exact: true` — which would redirect, not match.

### 2. Landing Page is a Stub
The `/` route renders `Landing.tsx` which is just a centered "ConfideQ" heading — no navigation, no call-to-action, no way to access the app.

### 3. Supabase Client Duplication
There are **two** Supabase clients:
- `src/lib/supabase/client.ts` — used by `App.tsx`, reads `VITE_SUPABASE_ANON_KEY` (not in `.env`)
- `src/integrations/supabase/client.ts` — auto-generated, uses `VITE_SUPABASE_PUBLISHABLE_KEY` (correct)

The app uses the wrong one, so Supabase calls go to the placeholder fallback.

---

## Plan

### Step 1: Fix Supabase Client
Update `src/lib/supabase/client.ts` to read `VITE_SUPABASE_PUBLISHABLE_KEY` (the env var that actually exists in `.env`) instead of `VITE_SUPABASE_ANON_KEY`. Alternatively, re-export from `src/integrations/supabase/client.ts`.

### Step 2: Fix Route Mismatch
Normalize all routes to use the `/app` prefix consistently. Update the router in `App.tsx`:
- Change all AppShell child paths from `/dashboard` → `/app/dashboard`, `/live` → `/app/live`, `/mock` → `/app/mock`, etc.
- Change Settings children from `/settings/*` → `/app/settings/*`
- Update the Settings component's nav links (already correct at `/app/settings/*`)
- Update the `/app` redirect to point to `/app/dashboard`
- The sidebar links already use `/app/*` so they will match after this fix

### Step 3: Build a Real Landing Page
Replace the stub `Landing.tsx` with a proper marketing landing page that includes:
- Hero section with tagline and CTA buttons (Login / Get Started)
- Feature highlights (Live Co-Pilot, Mock Engine, Analytics)
- Navigation to `/login` and `/signup`

### Step 4: Fix Settings Route Paths
The Settings component's `SETTINGS_NAV` already uses `/app/settings/*` paths, which will be correct once Step 2 is done. But the router currently nests settings children with relative paths under `/settings` — need to update to `/app/settings`.

### Step 5: Audit Missing Files Referenced in Imports
Several files may be missing stubs. The `tsconfig.app.json` excludes many page files from type-checking, which masks import errors at compile time but they still fail at runtime. Key missing stubs to verify/create if needed.

---

## Summary of Changes

| File | Change |
|------|--------|
| `src/lib/supabase/client.ts` | Use `VITE_SUPABASE_PUBLISHABLE_KEY` env var |
| `src/App.tsx` | Prefix all app routes with `/app/` to match sidebar |
| `src/pages/marketing/Landing.tsx` | Build real landing page with nav + CTA |
| `src/pages/app/settings/Settings.tsx` | No change needed (already uses `/app/settings/*`) |

This will make the app render the landing page at `/`, navigate correctly to login/signup, and once authenticated, all sidebar links will work.

