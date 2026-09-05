# GOV_EXAM_REDIRECT_ROOT_CAUSE

## Release context

**Symptom:** Clicking **Generate Question Paper** (or deep-linking to `/app/mock-test/generate`) sometimes lands on `/app/dashboard` instead of the generator or session.

**Reproduction method:** Code audit + Vitest contract tests + Playwright gov-exam specs (local). Staging/production UAT pending ops deploy.

## Primary root cause (confirmed)

### Onboarding gate drops deep-link on refresh

| Field | Value |
|-------|-------|
| **File** | `src/components/layout/ProtectedRoute.tsx` |
| **Trigger** | Authenticated user with `profiles.onboarding_completed !== true` visits any `/app/mock-test/*` route |
| **Before fix** | `<Navigate to="/onboarding" state={{ from: location }} />` — return path only in React state |
| **After fix** | `<Navigate to={pathWithReturnTo("/onboarding", returnTo)} state={{ from: location }} />` |
| **Destination chain** | generate URL → onboarding → (refresh loses state) → `getPostOnboardingPath(null)` → **`/app/dashboard`** |
| **Valid gate?** | Yes — onboarding required |
| **Invalid redirect?** | Yes — dashboard is wrong when user intended generate deep link |

### MFA re-enroll (same class)

| Field | Value |
|-------|-------|
| **File** | `src/components/layout/ProtectedRoute.tsx` |
| **Trigger** | `profile.mfa_reenrollment_required` |
| **Before fix** | MFA enroll without URL `returnTo` |
| **After fix** | `pathWithReturnTo(AUTH_PATHS.mfaEnroll, returnTo)` |

## Non-causes (verified)

| Suspect | Result |
|---------|--------|
| `GenerateGovPaper.tsx` auto-`navigate("/app/dashboard")` | **Not present** — only navigates to session on job complete |
| `IndiaRegionGate` silent redirect | **Removed** — in-page block + manual link only |
| `PlanGate` on mock-test routes | **Not applied** |
| `location.state` required on generate page | **No** — uses URL search params + `jobId` |
| Mock-test pages calling `navigate("/app/dashboard")` | **None** |

## Secondary blockers (journey broken, not dashboard redirect)

| ID | Issue | Impact |
|----|-------|--------|
| RC-SEARCH-EXAMS-API | search-exams edge failures | Hub search stuck / empty (TC-GOV-002+) |
| BLK-EDGE | Undeployed edge functions | create/get-paper-generation-job fail |
| BLK-PY | Python worker down | Jobs queue without completion |
| INV-001 | RPC `public_pyp` counted all approved Qs | Official/PYQ availability lied (fixed in migration `20260905140000`) |

## Entry-point matrix

| Entry | Expected | Redirect risk |
|-------|----------|---------------|
| Sidebar → Government Exams | `/app/mock-test` | Low |
| Generate paper CTA | `/app/mock-test/generate` | Onboarding chain only |
| Exam detail → Full sim | `/app/mock-test/generate?...&basis=full_sim` | Low after returnTo fix |
| Session History → View Result | `/app/mock-test/results/:id` | Low — in-place not-found |
| Logged-out deep link | login?returnTo=… | Low — login preserves returnTo |
| Browser refresh on generate | Same URL + jobId | Low — URL is authoritative |

## Fix summary

1. Embed `returnTo` in onboarding and MFA enroll URLs (mirrors verify-email).
2. Add `src/lib/gov-exam/routeResolution.ts` — classify temporary vs not-found; never dashboard on 5xx.
3. Add `/app/mock-test/generate/job/:jobId` alias → `?jobId=`.

## Verification

```bash
npm run test:run -- src/test/lib/gov-exam/govExamRoutes.test.ts src/test/lib/gov-exam/govExamRedirectContract.test.ts src/test/lib/gov-exam/routeResolution.test.ts
```
