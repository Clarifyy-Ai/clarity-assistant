# Electron production smoke checklist — Clarify AI v1.0.0

Honest product note: the desktop app is a **framed companion overlay window** with global shortcuts, not a frameless transparent always-on-top stealth HUD unless the user explicitly enables content-protection / stealth opt-in.

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
| Windows shortcut smoke | Manual checklist ready — execute before claiming |
| macOS shortcut smoke | NOT executed in this sprint |
| Signing/notarization | IMPLEMENTED_REQUIRES_EXTERNAL_OPS |
