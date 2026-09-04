# Government Exam — production certification

## Scope

Certifies the Government Exam (mock-test) P0 journey: auth return path, durable generation, availability honesty, attempt lifecycle, Session History linkage.

## Deliverables checklist

| Doc | Path |
|-----|------|
| Route / redirect audit | `docs/gov-exam/GOV_EXAM_ROUTE_AND_REDIRECT_AUDIT.md` |
| Generation / worker | `docs/gov-exam/GOV_EXAM_GENERATION_AND_WORKER_REPORT.md` |
| Credit ledger | `docs/gov-exam/GOV_EXAM_CREDIT_LEDGER_REPORT.md` |
| Identifier / data contract | `docs/gov-exam/GOV_EXAM_IDENTIFIER_AND_DATA_CONTRACT.md` |
| Migration / RLS | `docs/gov-exam/GOV_EXAM_MIGRATION_AND_RLS_REPORT.md` |
| E2E evidence | `docs/gov-exam/GOV_EXAM_END_TO_END_TEST_EVIDENCE.md` |
| This certification | `docs/gov-exam/GOV_EXAM_PRODUCTION_CERTIFICATION.md` |

## Acceptance criteria (must all hold on target env)

- [ ] Valid exam deep link never ends on Dashboard solely due to completed onboarding/verify
- [ ] Load/analysis errors show Retry/Not Found on the same URL
- [ ] Refresh on Generating restores same `jobId`; hub shows Resume CTA
- [ ] Client poll timeout ≠ credit loss / permanent fail
- [ ] Review and Generate share one availability snapshot id
- [ ] Start/refresh one attempt; timer/answers persist; submit once; Results + Session History agree
- [ ] User B denied on A’s attempt/results URLs

## Explicitly out of scope (tracked)

- Full Admin ingestion CRUD staff UAT
- Renaming routes to `/app/government-exams/*`
- Analytics chart rewrite beyond Session History linkage
- Killing Quick Drill / legacy `ExamPapers` `launchMockTest` fork

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Engineering | | | |
| QA | | | |
| Release | | | GO / NO-GO |

**NO-GO** if Edge/Python undeployed (BLK-EDGE/BLK-PY) or any P0 acceptance row fails on live URL.
