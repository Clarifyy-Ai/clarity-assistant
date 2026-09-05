# GOV_EXAM_GENERATION_JOB_AND_WORKER

## Durable job flow

```
UI check-exam-paper-availability (no charge)
  → UI create-exam-paper (enqueue_gov_paper_job + reserve credits)
  → Dispatch: Python /internal/gov-exams/process-job OR Edge waitUntil
  → Poll get-paper-generation-job until terminal
  → completed → mock_tests row + session URL
```

## Job statuses (DB)

`validating` → `checking_availability` → `queued` → `leased` → selecting/generating/validating/assembling → `completed`

Terminal: `completed`, `failed_retryable`, `failed_permanent`, `cancelled`, `expired`

## Client honesty

- `pollPaperJobUntilTerminal` — soft exit `GENERATION_STILL_RUNNING`; does not invent failure
- Progress UI — real counts when present; else stage labels from `paperJobStatus.ts`
- Refresh — `?jobId=` + `localStorage` active job + hub Resume banner
- Alias route — `/app/mock-test/generate/job/:jobId`

## Worker

| Component | Path |
|-----------|------|
| Python routes | `scraper/app/routes/gov_exams.py` |
| DB poller | `scraper/app/paper_factory/worker.py` |
| Edge assembly | `supabase/functions/_shared/govPaperAssembly.ts` |
| Lease/sweep | `govPaperJobLease.ts`, cron `sweep_gov_paper_jobs` |

Env: `PYTHON_SERVICE_URL`, HMAC auth, `PAPER_FACTORY_WORKER=1`

## AI validation

Realistic mock only — multi-agent validators in `src/lib/gov-exam/` + Python pipeline. Labels: **AI-Generated Practice Question**. Never Official/PYQ.

## Duplicate prevention

1. Normalized text fingerprint
2. Semantic similarity within paper
3. Source identity (exam/year/shift/paper/no)

Enforced at `gov_generated_paper_questions` insert.

## Environment blockers

Undeployed Edge/Python = **Blocked (BLK-EDGE / BLK-PY)**, not a product Pass for full journey.

See: `docs/gov-exam/GOV_EXAM_GENERATION_AND_WORKER_REPORT.md`
