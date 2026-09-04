# Session History — Test Evidence

## Unit

```bash
npx vitest run src/test/lib/session/sessionHistoryFilters.test.ts
```

Covers:

- Legacy rehearsal→practice chip mapping
- Live Copilot / Answer Bank labels
- URL filter round-trip
- Missing score ≠ `"0"`
- Count policy buckets

## Playwright

```bash
npx playwright test e2e/session-history.spec.ts
```

Covers:

- Multi-type filter chips visible
- URL sync for type + search
- Filtered empty vs global empty copy

## Blackbox

- `TC-SES-001` … `TC-SES-006` in `scripts/blackbox_qa/cases_c.py`
- Requires migration `20260904120000_get_session_history` on the QA database for full multi-type Pass

## Manual acceptance (post-deploy)

1. Complete Live Copilot → appears as Live Copilot
2. Complete Mock → Mock Interview with counts/score state
3. Complete Gov exam → Government Exam + marks route
4. Complete Assessment → Assessment result route
5. Filters + refresh URL persistence
6. User B denied on User A detail URL
