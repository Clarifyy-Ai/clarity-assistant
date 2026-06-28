# Clarify AI Electron Release

## Prerequisites (external)

- Apple Developer ID Application certificate (macOS)
- Windows Authenticode certificate
- Apple notarization credentials (`APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID`)

## Build

```bash
npm run build
npm run electron:build
```

Artifacts land in `dist-electron/` (exact path depends on electron-builder config in `package.json`).

## Code signing (manual steps)

### macOS

1. Import Developer ID certificate into Keychain.
2. Set `CSC_LINK` or use local keychain identity.
3. Run build with `CSC_IDENTITY_AUTO_DISCOVERY=true`.
4. Notarize with `xcrun notarytool submit` and staple the ticket.

### Windows

1. Install EV/OV code signing certificate.
2. Set `CSC_LINK` and `CSC_KEY_PASSWORD` for electron-builder.
3. Build on Windows or use a signing service compatible with Authenticode.

## Tray icon

Electron reads `public/icon.png` (512×512 PNG). Update alongside web favicon when rebranding.

## Distribution

- Upload signed `.dmg` / `.exe` to release hosting or auto-update bucket.
- Update download links on marketing site after notarization completes.

## Not in scope for this repo

Automated notarization, Apple/Google store submission, and crash-report symbol upload require CI secrets configured outside git.
