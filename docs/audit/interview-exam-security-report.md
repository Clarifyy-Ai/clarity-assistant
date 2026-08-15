# Security report — interview + gov exam

Date: 2026-08-15

## Controls verified in this pass

- Overlay capture exclusion, auto-hide, and stealth click-through defaults disabled. Discrete UI remaps labels only. `isStealthCaptureFeatureAllowed()` always false.
- Practice overlay consent still requires visible-on-share + responsible-use ack.
- Exam player selects playable columns / `questions_playable` (no `correct_answer` / explanation). Live estimated score removed.
- `submit-test` no longer maps score% to a cohort percentile. Rank UI uses `RANK_UNAVAILABLE_COPY` until min cohort 50.
- Interview vs gov-exam entitlements separated (`gov_exam_ai_fill` ≠ `desktop_overlay`).
- New tables have RLS `user_id = auth.uid()`.
- Resume copy documents private storage and deletion via Settings → Data.

## Residual limitations

- Direct PostgREST SELECT on `questions.correct_answer` remains possible for public rows (column-level revoke not applied to avoid breaking admin editor). Tracked as PARTIAL_SECURITY.
- Live STT/AI certification blocked without provider secrets.
- Public share tokens remain a review surface (`get_shared_debrief`).
- B2C tenancy only — not org isolation.
