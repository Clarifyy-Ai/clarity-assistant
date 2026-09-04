## BUG 13 — Manual Chrome verification checklist

Government Exam hub (`/app/mock-test`) CTAs must never silently land on Dashboard.

1. Sign in → open `/app/mock-test`.
2. Search (or wait for browse results) until an exam row shows **View exam**, **Generate mock**, **Full sim**.
3. Click **View exam** → URL `/app/mock-test/exam/<code>`; Console clean; Network hits exam-details (not a dashboard remount).
4. Back to hub → **Generate mock** → `/app/mock-test/generate?examId=…&code=…` (stay on generate; India gate must not Navigate to Dashboard).
5. Back to hub → **Full sim** → same generate URL with `basis=full_sim`.
6. Refresh generate page → `examId`, `code`, `basis`, `language`, `questionCount` remain in the query string.
7. Open `/app/mock-test/exam/NOT_A_REAL_EXAM` → in-place not-found + hub link (URL unchanged; not Dashboard).
8. Incognito: open generate deep link → `/login?returnTo=…mock-test/generate…`.

Remaining blocker if CI cannot run Playwright against a live browser session: complete steps 3–8 manually before production FIXED.

**2026-09-05 triage:** Routing soft-gate (BUG13) already in code. Remaining “feature dead” symptoms are usually missing `exam.code`/stage (disabled CTAs with titles), Edge/Python workers, or India override — see [`MULTI_FEATURE_OUTAGE_TRIAGE.md`](./MULTI_FEATURE_OUTAGE_TRIAGE.md). Hub now prefetches generate chunk on hover and clarifies disabled CTA titles.
