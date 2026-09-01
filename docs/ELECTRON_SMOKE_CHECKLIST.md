# Electron production smoke checklist — Clarify AI v1.0.0

Honest product note: the desktop app is a **framed companion overlay window** with global shortcuts, not a frameless transparent always-on-top stealth HUD unless the user explicitly enables content-protection / stealth opt-in.

## Config APIs

- [ ] `npm run electron:check-config` passes (VITE Supabase URL/keys, project ID, `VITE_APP_URL` not localhost for packaging)
- [ ] GitHub Actions secrets set for Electron Release: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_APP_URL`, `VITE_SUPABASE_PROJECT_ID`, `VITE_OAUTH_PROVIDERS`
- [ ] Edge secret `ALLOW_ELECTRON_NULL_ORIGIN=true` (plus `ALLOWED_ORIGINS` / `SITE_URL` / `PUBLIC_URL` for the web origin)
- [ ] Auth redirect URLs include the production website origin — no OpenAI/Gemini/Deepgram/Stripe **secrets** in Electron env

## Automated / local (Windows)

- [ ] `npm run electron:dev` launches without crash
- [ ] Login session persists after reload
- [ ] Stealth / content-protection is **off by default**
- [ ] Enabling stealth requires explicit consent UI
- [ ] `Ctrl+Shift+H` and `Ctrl+Shift+A` register (check console / overlay)
- [ ] Shortcut collision shows a non-fatal warning (does not crash)
- [ ] Quitting the app unregisters shortcuts (no orphaned OS hotkeys)
- [ ] Relaunch re-registers shortcuts
- [ ] Overlay show/hide works while a meeting window is focused
- [ ] Window restores on multi-monitor move
- [ ] Display scaling (125%/150%) does not clip controls
- [ ] Auto-update check does not brick launch when update feed unreachable

## macOS (manual — mark only if actually tested)

- [ ] Accessibility / screen-recording prompts verified
- [ ] Global shortcuts work when meeting app is focused
- [ ] Notarization / Gatekeeper path verified for signed builds

## Linux (if supported)

- [ ] Documented limitations of global shortcuts on Wayland

## Classification

| Claim | Status |
|-------|--------|
| Windows shortcut smoke | Manual checklist ready — **not executed** 2026-08-02 (code: remappable sync + unregisterAll) |
| Always-on-top default off | Code verified (Electron `alwaysOnTop: false`) |
| Presentation-safe opt-in | Code verified (settings + `setContentProtection`) |
| macOS shortcut smoke | NOT executed in this sprint |
| Signing/notarization | IMPLEMENTED_REQUIRES_EXTERNAL_OPS |

## Windows UAT log (2026-08-02)

| Step | Result |
|------|--------|
| `npm run test:run` | PASS 249 |
| `npm run electron:build` | See PRODUCTION_EVIDENCE |
| Interactive launch / mic / meeting focus | BLOCKED — no interactive desktop UAT this session |
| `npm run electron:smoke:static` (2026-08-02 late) | PASS — 9 secure-default / IPC checks |
