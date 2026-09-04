# Session History — Source Inventory

Evidence-backed inventory of session-producing stores used by Clarify Session History (Approach B: normalize via RPC, no duplicate write table).

## Session History before this work

| Surface | Path | Data source |
|---------|------|-------------|
| List UI | `/app/sessions` → `CallSessions.tsx` | `sessions` only via `sessionsDB.listSummariesByUserId` |
| Detail | `/app/sessions/:id` | `get_owned_session_detail` RPC |
| Dashboard recent | `useDashboardData` | `sessionsDB.listRecentSummary` / `countByUserId` |

Missing from history: `mock_tests`, `practice_workspace_sessions`, `coding_submissions`.

---

## 1. Interview / Practice Coach / Mock — `public.sessions`

| Field | Value |
|-------|--------|
| PK | `id` (uuid) |
| Owner | `user_id` |
| Type | enum `session_type`: `live`, `mock`, `warmup`, `rehearsal`, `room` |
| Status | `status` + `lifecycle_status` |
| Start / end | `started_at`, `ended_at`, `created_at`, `updated_at` |
| Duration | `duration_seconds` |
| Score | `overall_score`; authoritative overlay `scorecards.overall_score` |
| Soft delete | `deleted_at` |
| Detail route | `/app/sessions/:id` |
| Debrief | `session_debriefs.session_id` |

Product mapping: Live Copilot ≈ `live`; Practice Coach ≈ `rehearsal`/`warmup`; Mock ≈ `mock`.

## 2. Government Exam + Assessment — `public.mock_tests`

| Field | Value |
|-------|--------|
| PK | `id` |
| Owner | `user_id` |
| Discriminator | `config->>'source' = 'exam_template'` → assessment; else government exam |
| Status | `status` (`DRAFT`/`IN_PROGRESS`/`COMPLETED`/`ABANDONED`) + `attempt_phase` |
| Timestamps | `started_at`, `submitted_at`, `created_at`, `updated_at` |
| Score | `overall_score`; detail `test_analyses` |
| Question count | `cardinality(question_ids)` |
| Detail routes | Gov: `/app/mock-test/results/:id`; Assessment: `/app/assessments/results/:id` |

## 3. Practice Workspace — `public.practice_workspace_sessions`

| Field | Value |
|-------|--------|
| PK | `id` |
| Owner | `user_id` |
| Status | `active` / `completed` / `expired` |
| Duration | `elapsed_seconds` |
| Scores | `scores` JSONB |
| Detail route | `/app/practice-workspace?session=:id` |

## 4. Coding — `public.coding_submissions`

| Field | Value |
|-------|--------|
| PK | `id` |
| Owner | `user_id` |
| Status | `submitted` / `scored` / `pending_review` / … |
| Score | `score`, `passed_tests`, `failed_tests` |
| Timestamp | `submitted_at` |
| Title | join `coding_questions.title` |
| Detail route | `/app/coding/:question_id` |

## 5. Derivatives (not independent history rows)

- `scorecards` — interview score overlay
- `session_debriefs` / `debriefs` — debrief status for interview rows
- `test_analyses` — gov/assessment analysis

## Integration status (target)

All four families are normalized by `get_session_history` (see migration + canonical contract).
