# Government Exam Monitoring (Pilot)

Light ops for the **CONDITIONAL_GO_PILOT**. Source: master prompt §28 *Production and Monitoring*.  
This is **not** a full alert pipeline — log drains and paging remain external ops (see `docs/MONITORING_SETUP.md` if present).

## Observable now vs deferred

| Area | Observable now | Deferred |
|------|----------------|----------|
| Exam registry counts | `gov_exams` by `review_state` via ops snapshot | Automated drift alerts |
| Paper generation jobs | Status + `error_code` (7d) via snapshot / SQL | Duration histograms, queue backlog paging |
| Bank readiness | RPC/view + `gov-bank-readiness.mjs` / ops snapshot | Continuous certification scanner |
| Translations | `question_translations` by `review_state` | Expert-pack certification metrics |
| Content quality incidents | Open/`triaging` counts on `content_quality_incidents` | SLA / auto-assign / paging |
| Ingestion jobs | `source_ingestion_jobs` by status | OCR confidence timeseries |
| Human review backlog | `needs_review` questions + non-approved PYQ papers | Day-over-day trend dashboards |
| Edge health | Supabase Edge logs (manual / CLI) | Log drain + >2%/5m auto-alerts |
| Similarity / quality gates | In-process n-gram/Jaccard (+ optional offline embeddings helper) | Rejection-rate warehouse; vector store |

## Observe today

| Master-prompt signal | How to observe now | Notes |
|----------------------|--------------------|-------|
| Source-ingestion failures | `source_ingestion_jobs` status=`failed` (SQL / ops snapshot) | Table exists after PYQ migrations |
| Generation-job duration | `gov_paper_generation_jobs.started_at` / `completed_at` | Manual SQL; no histogram yet |
| Generation-job failure rate | Job status counts last 7d (`completed` vs `failed`) | Ops snapshot |
| Paper assembly failure | Jobs with `error_code` + Edge logs for `create-exam-paper` | Fail-closed paths emit stable codes |
| Insufficient-approved-question rate | `error_code = 'INSUFFICIENT_APPROVED_QUESTIONS'` + bank readiness | Expected while 0 packs are full-sim ready |
| Human-review backlog | Questions `metadata.needs_review=true`; translations `needs_review`/`draft`; papers/jobs awaiting admin | Admin console + SQL below |
| User-reported question issues | `content_quality_incidents` open/triaging (+ `report-question` EF) | Snapshot reports open count; no pager |
| Bank readiness / certification gap | `node scripts/gov-bank-readiness.mjs` or RPC `get_gov_exam_bank_readiness()` | Honest full-sim gate |
| Credit reservation / compensation failures | Jobs with `credits_charged > 0` and `status=failed` without matching `refund_*` credit row | See RUNBOOK |
| Edge Function health | Supabase Edge logs for gov EFs | Dashboard / CLI; drain optional |
| Registry / review_state drift | `gov_exams` counts by `review_state` | Ops snapshot |

### Commands

```bash
# Combined pilot snapshot (prefers Management API; falls back to service-role REST)
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/gov-exam-ops-snapshot.mjs
# or: node scripts/gov-exam-ops-snapshot.mjs  # with SUPABASE_SERVICE_ROLE_KEY in .env.local

# Per-exam bank readiness
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/gov-bank-readiness.mjs

# Edge logs (example)
npx supabase functions logs create-exam-paper --project-ref qzgvjrvtkwlzxpmlddkx
```

### SQL snippets (human review backlog)

```sql
-- OCR / extract items held unpublished
SELECT COUNT(*) AS needs_review_questions
FROM public.questions
WHERE (metadata->>'needs_review') = 'true';

-- Translation queue
SELECT review_state, COUNT(*)
FROM public.question_translations
GROUP BY 1
ORDER BY 1;

-- Open content quality incidents
SELECT status, COUNT(*)
FROM public.content_quality_incidents
WHERE status IN ('open', 'triaging', 'triaged')
GROUP BY 1;

-- Draft / in-review previous-year papers
SELECT review_status, COUNT(*)
FROM public.previous_year_papers
GROUP BY 1
ORDER BY 1;

-- Failed ingest jobs (7d)
SELECT status, COUNT(*)
FROM public.source_ingestion_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY 1;

-- Paper jobs stuck / failed (7d)
SELECT status, error_code, COUNT(*)
FROM public.gov_paper_generation_jobs
WHERE created_at > now() - interval '7 days'
GROUP BY 1, 2
ORDER BY 1, 2;
```

### Soft alert thresholds (manual pilot)

| Signal | Soft threshold | First action |
|--------|----------------|--------------|
| Paper job failure rate (7d, n≥10) | >20% failed | Inspect `error_code`; check bank readiness |
| Ingest jobs failed (24h) | ≥3 | Check allowlist / payload; admin ingest UI |
| Open content_quality_incidents | Growing with no triage | Admin review queue |
| Human-review backlog (needs_review Qs) | Growing day-over-day with no reviews | Prioritize admin queue |
| Credits charged + job failed, no refund | Any | Refund investigation (RUNBOOK) |
| Edge 5xx on create-exam-paper / ingest | Align with RUNBOOK (>2% / 5m) | Logs → rollback if deploy-related |

Notification destination: **not wired** — operator runs snapshot + dashboard. No claim of automated paging.

## Deferred (master prompt, not instrumented as alerts)

| Signal | Why deferred |
|--------|--------------|
| OCR confidence distributions | Extract path stores audit metadata; no confidence timeseries / alert |
| Question extraction failure rate (OCR-specific) | Manual job status only |
| Validator disagreement rate | Multi-agent validators run in-process; no metrics table |
| Low-quality / similarity rejection rate dashboards | Gate exists in `create-exam-paper` / reconcile; no export |
| Embedding / vector near-dup warehouse | Lexical primary; cosine helpers offline-ready only — no vector store / external embed calls without keys |
| Answer correction rate | No dedicated correction analytics |
| Autosave / submission / scoring failure alerts | Generic mock runner; no gov-specific monitors |
| Model cost per paper / by exam+language | No cost warehouse |
| Duplicate credit deduction alerts | Relies on billing ops + idempotency; not gov-specific pager |
| Published question without provenance / unverified answer | Content policy + RLS; no continuous integrity scanner |
| Blueprint violation alert | Fail-closed in assembly; no secondary scanner |
| Current-affairs pipeline stale | Pipeline not productized for pilot |
| Generation queue backlog / worker lease failures | Inline job processing; no separate worker fleet |
| Automated alert routing | Log drain + pager still external ops |

## Release posture

**CONDITIONAL_GO_PILOT** — engine, admin, ingest, mastery, and validators are live; **0** packs are full-simulation ready; frontend host deploy is external ops. Do not treat this doc as GO for all exams.
