# feature-copies/

Historical snapshots of feature slices (auth, admin, gov-exams, etc.) used during parallel development.

**Do not edit these trees for product fixes.** The authoritative source is the repo root (`src/`, `supabase/`).

## Classification (2026-09-06 audit)

| Copy | Status | Action |
|------|--------|--------|
| `feature-copies/audio/` | ARCHIVE | Not imported by `src/` — reference only |
| `feature-copies/auth/` | ARCHIVE | Superseded by root auth |
| `feature-copies/admin/` | ARCHIVE | Superseded by root admin |
| `feature-copies/gov-exams/` | ARCHIVE | Superseded by root gov exam modules |
| `feature-copies/rooms-legacy/` | DELETE candidate | Retired product surface |
| All other copies | ARCHIVE | No runtime imports from canonical app |

**KEEP:** This README + folder until ops confirms safe deletion.  
**MIGRATE:** None — root is canonical.  
**DELETE:** Only after explicit ops approval; never import from copies in new code.

When merging a feature from a copy:

1. Port changes into root paths only.
2. Delete or refresh the copy after merge to avoid drift.
3. Run root vitest + `npm run release:edge-parity` before deploy.

If a copy diverges from root for more than one sprint, prefer deleting it over syncing manually.
