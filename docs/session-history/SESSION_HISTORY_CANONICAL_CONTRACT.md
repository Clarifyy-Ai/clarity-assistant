# Session History — Canonical Contract

Approach **B**: read-only `get_session_history` RPC normalizes authoritative module tables. No duplicate write table.

## Item shape (JSON)

```json
{
  "sessionId": "uuid",
  "sourceId": "uuid",
  "sourceKind": "interview|mock_test|practice_workspace|coding_submission",
  "userId": "uuid",
  "sessionType": "practice_coach|mock_interview|government_exam|assessment|practice_workspace|coding_assessment|other_practice",
  "sessionSubtype": "live_copilot|rehearsal|warmup|null",
  "title": "string",
  "role": "string|null",
  "company": "string|null",
  "examName": "string|null",
  "assessmentName": "string|null",
  "status": "draft|scheduled|starting|active|paused|processing|completed|incomplete|submitted|expired|cancelled|failed|evaluation_pending|evaluation_failed",
  "sourceStatus": "string",
  "startedAt": "ISO|null",
  "lastActivityAt": "ISO",
  "endedAt": "ISO|null",
  "durationSeconds": "number|null",
  "answeredCount": "number|null",
  "totalQuestionCount": "number|null",
  "score": "number|null",
  "scoreMaximum": "number|null",
  "scoreUnit": "percent|marks|tests|null",
  "resultLabel": "string|null",
  "debriefStatus": "available|processing|not_eligible|failed|not_requested|null",
  "debriefId": "uuid|null",
  "detailRoute": "/app/...",
  "sourceRoute": "/app/...",
  "createdAt": "ISO",
  "updatedAt": "ISO"
}
```

**Score rule:** missing evaluation stays `null`. Never coerce to `0`.

## Type map

| Source | Canonical `sessionType` | Subtype |
|--------|-------------------------|---------|
| `sessions.type=live` | `practice_coach` | `live_copilot` |
| `sessions.type=rehearsal` | `practice_coach` | `rehearsal` |
| `sessions.type=warmup` | `practice_coach` | `warmup` |
| `sessions.type=mock` | `mock_interview` | null |
| `sessions.type=room` | `other_practice` | `room` |
| `mock_tests` + exam_template | `assessment` | `assessment_objective` from config when set |
| other `mock_tests` | `government_exam` | null |
| `practice_workspace_sessions` | `practice_workspace` | null |
| `coding_submissions` | `coding_assessment` | null |

## Status map (display)

| Normalized | Examples |
|------------|----------|
| `active` | sessions active/paused; mock_tests IN_PROGRESS; workspace active |
| `completed` | sessions completed; mock_tests COMPLETED; workspace completed |
| `submitted` | coding submitted/scored |
| `incomplete` | abandoned |
| `expired` | workspace expired; lifecycle EXPIRED |
| `cancelled` | cancelled lifecycle |
| `failed` | coding rejected; evaluation failed signals |
| `draft` | mock_tests DRAFT |
| `evaluation_pending` | debrief/score processing when exposed |

## RPC

```
get_session_history(
  p_types text[] default null,
  p_statuses text[] default null,
  p_search text default null,
  p_date_from timestamptz default null,
  p_date_to timestamptz default null,
  p_score_state text default null,   -- scored|not_scored|all
  p_debrief_state text default null, -- available|processing|not_eligible|failed|not_requested|all
  p_sort text default 'newest',      -- newest|oldest|highest_score|lowest_score|longest|shortest
  p_cursor text default null,
  p_page_size int default 20
) returns jsonb
```

Auth: `auth.uid()` only. Envelope:

```json
{ "ok": true, "items": [...], "nextCursor": "...|null", "hasMore": false }
```

Errors: `{ "ok": false, "code": "...", "message": "..." }` — clients must not treat as empty list.

## UI labels

- `practice_coach` + `live_copilot` → Live Copilot
- `practice_coach` → Practice Coach
- `mock_interview` → Mock Interview
- `government_exam` → Government Exam
- `assessment` → Assessment
- `practice_workspace` → Practice Workspace
- `coding_assessment` → Coding Assessment
- `other_practice` → Other Practice
