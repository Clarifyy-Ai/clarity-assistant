# GOV_EXAM_PRODUCTION_CERTIFICATION

## Release decision

**CONDITIONAL_GO_PRODUCTION**

Code fixes for the Dashboard redirect and inventory integrity are merge-ready and covered by Vitest. Full production go requires migration apply, Edge/Python deploy, and staging UAT completion.

## Acceptance criteria

| Criterion | Status |
|-----------|--------|
| Valid exam deep link never ends on Dashboard solely due to onboarding/verify | **Pass (code)** — returnTo in URL |
| Load/analysis errors show Retry/Not Found on same URL | **Pass (code)** |
| Refresh on Generating restores same jobId | **Pass (code)** — URL + localStorage |
| Client poll timeout ≠ credit loss | **Pass (code)** — existing pollPaperJob |
| Review and Generate share availability snapshot id | **Pass (code)** |
| Start/refresh one attempt; submit once; Results + History agree | **Pass (unit)** — UAT pending |
| User B denied on A's URLs | **Pass (RLS unit)** — UAT pending |

## Blockers

| ID | Type | Resolution |
|----|------|------------|
| BLK-MIG | Ops | Apply `20260905140000_gov_exam_inventory_public_pyp_fix.sql` |
| BLK-EDGE | Ops | Deploy edge functions |
| BLK-PY | Ops | Deploy Python paper factory |
| RC-SEARCH | Data/API | search-exams health on target env |
| E2E-FLAKE | QA | 10/20 Playwright specs failed locally (hydration/submit UI) |

## Sign-off

| Role | Name | Date | Result |
|------|------|------|--------|
| Engineering | Recovery agent | 2026-09-05 | **CONDITIONAL GO** |
| QA | | | Pending UAT |
| Release | | | Pending staging |

## Deliverables index

1. [GOV_EXAM_REDIRECT_ROOT_CAUSE.md](./GOV_EXAM_REDIRECT_ROOT_CAUSE.md)
2. [GOV_EXAM_ROUTE_AND_IDENTIFIER_CONTRACT.md](./GOV_EXAM_ROUTE_AND_IDENTIFIER_CONTRACT.md)
3. [GOV_EXAM_CONFIGURATION_AND_INVENTORY.md](./GOV_EXAM_CONFIGURATION_AND_INVENTORY.md)
4. [GOV_EXAM_GENERATION_JOB_AND_WORKER.md](./GOV_EXAM_GENERATION_JOB_AND_WORKER.md)
5. [GOV_EXAM_CREDIT_RECONCILIATION.md](./GOV_EXAM_CREDIT_RECONCILIATION.md)
6. [GOV_EXAM_ATTEMPT_RUNNER_AND_SCORING.md](./GOV_EXAM_ATTEMPT_RUNNER_AND_SCORING.md)
7. [GOV_EXAM_RLS_AND_SECURITY.md](./GOV_EXAM_RLS_AND_SECURITY.md)
8. [GOV_EXAM_END_TO_END_TEST_EVIDENCE.md](./GOV_EXAM_END_TO_END_TEST_EVIDENCE.md)
9. This report's sibling: [GOV_EXAM_REGRESSION_REPORT.md](./GOV_EXAM_REGRESSION_REPORT.md)
10. This file

**NO_GO** if Dashboard redirect reproduces after deploy or duplicate credit charge observed in UAT.
