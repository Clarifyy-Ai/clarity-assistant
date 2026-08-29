# SE-006: Credit Deduction Fix - Test Cases & Validation

## Problem Fixed
**CRITICAL BUG**: Credits were deducted BEFORE job creation succeeded, causing orphaned charges when:
1. Job insert fails due to DB errors
2. Network timeouts between deduction and insert
3. Rapid clicks before UI disable (multiple submissions)

## Root Cause
Original code flow:
1. `deductCreditsAtomic()` — Credits removed from balance immediately
2. `INSERT job` — Job creation may fail
3. `refundCreditsBestEffort()` — Refund is "best effort", not atomic (retries once then gives up)

Race condition window: Credits gone but job doesn't exist = lost credits.

## Solution Implemented
**New code flow**:
1. `INSERT job` — Create job first, check for errors
2. Check for idempotency replay (duplicate request) — return existing job
3. **ONLY IF job insert succeeds**: `deductCreditsAtomic()` — Deduct credits
4. If credit deduction fails: Job exists, user retries with same idempotencyKey → gets existing job with no additional charge

**Key benefit**: Idempotency key prevents double-charging on retried requests.

## Test Cases

### Test 1: Normal Flow (Happy Path)
**Scenario**: User creates exam paper, no errors
**Expected**:
- Job created with status="queued"
- Credits deducted exactly once
- Response includes jobId, balanceAfter, creditsCharged

**Validation**:
```sql
SELECT user_id, credits_charged, status, idempotency_key 
FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND idempotency_key = $2
-- Should show: 1 row, credits_charged > 0, status = 'queued'

SELECT balance FROM user_credits 
WHERE user_id = $1
-- Should be: originalBalance - COST
```

### Test 2: Job Insert Fails - No Credits Charged
**Scenario**: DB error during job insert (e.g., constraint violation)
**Expected**:
- User's credits remain untouched
- Error returned (500)
- No refund attempted (credits never charged)

**Validation**:
```sql
SELECT balance FROM user_credits WHERE user_id = $1
-- Should equal: originalBalance (unchanged)

SELECT COUNT(*) FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND idempotency_key = $2
-- Should be: 0 (no job created)
```

### Test 3: Idempotent Replay (Duplicate Request)
**Scenario**: User clicks button twice rapidly (before UI disable), or network retries same request
**Expected**:
- First request: Job created, credits deducted once
- Second request (same idempotencyKey): Returns existing job, no second charge
- Response includes `idempotentReplay: true`

**Validation**:
```sql
SELECT COUNT(*) FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND idempotency_key = $2
-- Should be: 1 (only one job)

SELECT balance FROM user_credits WHERE user_id = $1
-- Should be: originalBalance - COST (not 2x COST)

-- Check job has both attempts recorded
SELECT attempt_count, idempotency_key FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND idempotency_key = $2
-- Should show: attempt_count may vary, but single row
```

### Test 4: Credit Deduction Fails (Rare Race)
**Scenario**: Job inserted successfully, but credit deduction fails (e.g., account locked)
**Expected**:
- Job exists in "queued" status
- Credits not deducted
- User receives credit denial error
- User can retry with same idempotencyKey to get existing job (no re-charge via idempotency)

**Validation**:
```sql
SELECT status FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND idempotency_key = $2
-- Should show: 'queued' (job exists)

SELECT balance FROM user_credits WHERE user_id = $1
-- Should be: unchanged (no deduction)

-- On retry with same idempotencyKey:
-- Should receive 202 with existing job, balance unchanged
```

### Test 5: Concurrent Requests (Same User, Different idempotencyKey)
**Scenario**: Rapid clicks with different exam selections (different requests)
**Expected**:
- Each request creates separate job
- Each request deducts credits separately
- Both jobs exist in DB

**Validation**:
```sql
SELECT COUNT(*), SUM(credits_charged) FROM gov_paper_generation_jobs 
WHERE user_id = $1 AND created_at > now() - interval '1 minute'
-- Should show: 2 jobs, 2x COST total charge

SELECT balance FROM user_credits WHERE user_id = $1
-- Should be: originalBalance - (2 * COST)
```

## Acceptance Criteria

✅ **Code Changes**:
- [x] Credit deduction moved AFTER job insert
- [x] No orphaned refund calls in error path
- [x] Idempotency key prevents double-charge
- [x] Error messages clarify job exists but credit deduction failed
- [x] TypeScript validation passes
- [x] Build passes

✅ **Integration Testing**:
- [ ] Test 1 (normal flow) passes with actual Supabase DB
- [ ] Test 2 (job insert fail) validates no credits lost
- [ ] Test 3 (idempotent replay) validates single charge only
- [ ] Test 4 (credit denial) validates job exists despite fail
- [ ] Test 5 (concurrent requests) validates separate tracking

✅ **Regression Testing**:
- [ ] Other exam generation features unaffected (practice tests, AI papers)
- [ ] Credit balance queries return correct values
- [ ] Exam paper completion flow still works
- [ ] User sees correct balance in UI immediately after paper generation

✅ **Manual QA Validation** (from QA 311 test cases):
- [ ] GE-005: Paper generation with immediate balance check
- [ ] GE-006: Rapid clicks on "Generate" button
- [ ] GE-007: Network error during generation (simulate with DevTools)
- [ ] GE-008: Check credit history shows single charge per paper
- [ ] GE-009: Cross-user isolation (user A can't see user B's jobs)

## Deployment Notes

1. **No database migration needed** — Column structure unchanged
2. **No API contract change** — Response shape identical
3. **Backwards compatible** — Existing job replay logic unaffected
4. **Safe to deploy** — Only affects new job submissions, existing jobs unaffected

## Monitoring After Deploy

Watch for in production:
```sql
-- Jobs that have credits_charged but credit deduction failed
SELECT id, status, credits_charged, created_at, error_code 
FROM gov_paper_generation_jobs 
WHERE user_id IS NOT NULL 
  AND created_at > now() - interval '1 day'
  AND status = 'queued'  -- Stuck in queued
  AND EXISTS (
    SELECT 1 FROM logs 
    WHERE job_id = gov_paper_generation_jobs.id 
    AND message ILIKE '%credit deduction failed%'
  )
-- Should be: 0 (or very rare edge cases)

-- Users with unexpected credit balance (charged but no job)
SELECT u.id, u.email, uc.balance, COUNT(j.id) as job_count
FROM users u
JOIN user_credits uc ON u.id = uc.user_id
LEFT JOIN gov_paper_generation_jobs j ON u.id = j.user_id 
  AND j.created_at > now() - interval '1 day'
WHERE uc.balance < 0  -- Should never be negative
GROUP BY u.id
HAVING COUNT(j.id) = 0  -- No jobs but lost credits
-- Should return: 0 rows
```

## PR Checklist
- [x] Fix implemented in `supabase/functions/create-exam-paper/index.ts`
- [x] Comments explain why credits deducted AFTER insert
- [x] No orphaned refund logic in error path
- [x] Build + TypeScript validation passes
- [ ] Tests pass in staging environment
- [ ] QA sign-off on SE-006 fix
- [ ] Commit message references SE-006 and explains atomic ordering
