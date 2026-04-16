

# Remaining Fixes — Issues 3, 17, 31, 37, 38, 39, 41

Most of the 46-issue roadmap is already implemented. Seven issues remain unfixed.

---

## Fix 3: Seed overlay opacity/font from profile on auth load

**File**: `src/store/authStore.ts` (line ~323, after `loadProfile` sets profile)
- After `s.profile = profileRes.data`, add overlay store seeding:
  ```ts
  const overlay = useOverlayStore.getState();
  const p = profileRes.data;
  if (p.overlay_opacity != null) overlay.setStealthOpacity(p.overlay_opacity);
  if (p.overlay_font_size != null) overlay.setFontSize(p.overlay_font_size);
  ```
- Import `useOverlayStore` at the top of authStore.ts

---

## Fix 17: CORS origin whitelist in cors.ts

**File**: `supabase/functions/_shared/cors.ts`
- Update `getCorsHeaders(req)` to read `ALLOWED_ORIGINS` from `Deno.env.get("ALLOWED_ORIGINS")`
- If set, split by comma and validate `req.headers.get("origin")` against the list
- If origin not in whitelist, return empty origin (block)
- If `ALLOWED_ORIGINS` not set, fall back to `*` (current behavior — avoids breaking deployments without the secret)

---

## Fix 31: Memoize ProtectedRoute

**File**: `src/components/layout/ProtectedRoute.tsx`
- Wrap the component function with `React.memo` to prevent unnecessary re-renders of the `<Outlet />` on route changes
- Change: `export const ProtectedRoute = memo(function ProtectedRoute(...) { ... })`

---

## Fix 37: Remove error detail leaks from edge functions

**Files**: 
- `supabase/functions/create-checkout/index.ts` (line 217): remove `detail: String(err)`
- `supabase/functions/parse-resume/index.ts` (line 215): remove `details: String(err)`
- Both already `console.error` the full error server-side, so just strip the client response

---

## Fix 38: Retry UI for failed session start

**File**: `src/pages/app/mock/MockSession.tsx`
- `sessionConfigRef.current` is already kept on error (line 237 returns early without clearing)
- Add: when `phase === "setup"`, pass `sessionConfigRef.current` as `initialConfig` prop to `PreSessionSetup`
- **File**: `src/components/session/PreSessionSetup.tsx`
- Accept optional `initialConfig` prop and pre-populate form fields from it

---

## Fix 39: Dashboard parallel queries

**File**: `src/pages/app/Dashboard.tsx`
- Create `useDashboardData()` hook that wraps the session count query (currently in a useEffect)
- Since profile, gamification, documents, and interviews are already from stores/hooks, the main sequential query is just the session count — this is a minor optimization
- The staggered skeleton issue is mostly resolved by the null→skeleton fix already applied

---

## Fix 41: Explicit column lists for documents

**File**: `src/pages/app/Dashboard.tsx` — `DocumentsStatusCard` uses `docStore` which reads from documentStore
- Audit `src/store/documentStore.ts` and any direct `.from("documents").select("*")` calls
- Replace with `.select("id, title, type, user_id, is_primary, is_active, created_at")` excluding `content`

---

## Deployment

- Redeploy `create-checkout` and `parse-resume` edge functions after error leak fix
- `cors.ts` change propagates to all functions on next deploy
- No database migration needed

## Summary

| Fix | File(s) | Effort |
|-----|---------|--------|
| 3 — Overlay opacity seed | authStore.ts | Small |
| 17 — CORS whitelist | cors.ts | Small |
| 31 — Memo ProtectedRoute | ProtectedRoute.tsx | Tiny |
| 37 — Error leak | create-checkout, parse-resume | Tiny |
| 38 — Retry UI | MockSession.tsx, PreSessionSetup.tsx | Small |
| 39 — Parallel queries | Dashboard.tsx | Small |
| 41 — Column lists | documentStore.ts | Small |

