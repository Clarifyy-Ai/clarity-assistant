# CAREER_PILOT_END_TO_END_TEST_EVIDENCE

## Exact automated totals (this remediation focus suite)

Command (example):

```bash
npx vitest run src/test/hooks/useScorecard.test.ts \
  src/test/lib/coding/javascriptSolveRunner.test.ts \
  src/test/lib/billing/creditKeyDriftContracts.test.ts \
  src/test/lib/billing/razorpayWebhookSignatureGrant.test.ts \
  src/test/lib/overlay/overlayHonesty.test.ts \
  src/test/lib/mock/mockTts.test.ts \
  src/test/lib/edge/govExamCreditContracts.test.ts \
  src/test/lib/edge/aiOperationRegistryContracts.test.ts
```

| Metric | Count |
|--------|-------|
| Passed | **82** |
| Failed | **0** |
| Skipped | **0** |
| Blocked (runtime E2E live) | N/A (not executed as deployed certification) |

Artifact: `docs/audit/_wave_vitest_summary.json`

## Additional wave agent reports (session)

| Area | Reported passed |
|------|-----------------|
| Auth suites | 67 + 34 |
| Live overlay/start | 43 |
| Mock TTS/core | 30 |
| Gov credit | 38 |
| Docs/results | 55 |
| Assess/coding | 62 |
| Billing/referrals | 40 |
| P1 honesty | 17 |

These were run in separate agent shells; aggregate full-repo vitest/Playwright totals were **not** re-run as a single monolith this pass.

## Journey matrix

| Journey | Automated | Deployed runtime |
|---------|-----------|------------------|
| Signup→onboarding | Unit/e2e present | Not verified |
| Live→scorecard→debrief | Contracts + unit | Not verified |
| Mock→scoring | Unit | Not verified |
| Gov search→result | Contracts | Not verified |
| Assessment personalization | Unit + e2e case | Not verified |
| Coding JS practice | Unit + e2e updates | Not verified |
| Razorpay test lifecycle | Source contracts | BLOCKED_BY_CONFIGURATION |
| Referral reward | Unit | Not verified |
| User A/B RLS live | Scripts exist | Not verified |

**Final:** Repository tests green for focused suites; **RUNTIME_VERIFIED journeys: 0**.
