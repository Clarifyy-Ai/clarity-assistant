# feature-copies/

Historical snapshots of feature slices (auth, admin, gov-exams, etc.) used during parallel development.

**Do not edit these trees for product fixes.** The authoritative source is the repo root (`src/`, `supabase/`).

When merging a feature from a copy:

1. Port changes into root paths only.
2. Delete or refresh the copy after merge to avoid drift.
3. Run root vitest + `npm run release:edge-parity` before deploy.

If a copy diverges from root for more than one sprint, prefer deleting it over syncing manually.
