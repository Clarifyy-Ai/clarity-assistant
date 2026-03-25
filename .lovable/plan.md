

# Fix All Application Issues — Comprehensive Plan

## Issues Found

### A. Build Error (TS2305) — Already Fixed
The 4 files importing from `screenShare` were migrated to import from `tabAudioCapture.ts` in the last edit. The `screenShare.ts` still has duplicate exports at lines 135-165 which should be removed to avoid confusion, but they don't block the build.

### B. PDF Import Failing — Edge Function Bugs (Critical)

**Problem 1: `credit_transactions` insert uses wrong column names**
In `supabase/functions/_shared/utils.ts` line 228, the `deductCredits` function inserts with columns `type` and `feature` — but the actual table has:
- `action` (not `type`) — an enum column of type `credit_action`  
- No `feature` column exists

This causes every credit deduction to silently fail, which means all edge functions that deduct credits break.

**Problem 2: `increment_credits` RPC doesn't exist**
In `supabase/functions/parse-question-pdf/index.ts` line 102, the refund function calls `admin.rpc("increment_credits")` — this RPC does not exist in the database. The existing `refund_credits` RPC expects `p_cost` (not `amount`/`user_id`).

**Problem 3: `ANTHROPIC_API_KEY` not set**
The `parse-question-pdf` function requires `ANTHROPIC_API_KEY` but it's not in the Supabase secrets. Without it, the function returns 503 "AI service not configured."

### C. `screenShare.ts` Duplicate Exports
Lines 135-165 duplicate the functions already in `tabAudioCapture.ts`. Remove them to keep a single source of truth.

## Fix Plan

### Step 1: Fix `_shared/utils.ts` credit transaction insert
Change line 222-230: replace `type: "deduction"` with `action: "usage"` (valid enum value) and remove the non-existent `feature` column. Move `feature` into the existing `description` field.

### Step 2: Fix `parse-question-pdf/index.ts` refund function
Replace the `admin.rpc("increment_credits", { user_id, amount })` call with the existing `refund_credits` RPC: `admin.rpc("refund_credits", { p_cost: amount })`. Note: `refund_credits` uses `auth.uid()` internally, but since we're using an admin client we need to use `add_credits` RPC instead which accepts `p_user_id`.

Actually, looking at `add_credits` — it accepts `(p_user_id uuid, p_amount integer, p_action credit_action, p_description text, p_payment_id text)`. This is the correct function for refunds from edge functions.

Fix: `admin.rpc("add_credits", { p_user_id: userId, p_amount: amount, p_action: "refund", p_description: reason })`

### Step 3: Add ANTHROPIC_API_KEY secret
Prompt user to add their Anthropic API key to Supabase Edge Function secrets.

### Step 4: Remove duplicate exports from `screenShare.ts`
Remove lines 135-165 (the `startTabShareBestEffort` and `captureSystemAudioViaTabShare` functions) since they now live in `tabAudioCapture.ts`.

## Technical Details

### `_shared/utils.ts` — credit_transactions insert fix (line 222-230)
```typescript
// Before (BROKEN):
await admin.from("credit_transactions").insert({
  user_id: userId,
  amount: -cost,
  balance_after: newBalance,
  type: "deduction",     // ← column doesn't exist
  feature,               // ← column doesn't exist
  description: `...`,
  created_at: new Date().toISOString(),
});

// After (FIXED):
await admin.from("credit_transactions").insert({
  user_id: userId,
  amount: -cost,
  balance_after: newBalance,
  action: "usage",       // ← correct enum column
  description: `${feature.replace(/_/g, " ")} — ${cost} credit${cost !== 1 ? "s" : ""}`,
  created_at: new Date().toISOString(),
});
```

### `parse-question-pdf/index.ts` — refund fix (line 98-112)
```typescript
// Before (BROKEN):
admin.rpc("increment_credits", { user_id: userId, amount });

// After (FIXED):
admin.rpc("add_credits", {
  p_user_id: userId,
  p_amount: amount,
  p_action: "refund",
  p_description: reason,
});
```

### Files Changed
| File | Change |
|---|---|
| `supabase/functions/_shared/utils.ts` | Fix `credit_transactions` insert columns |
| `supabase/functions/parse-question-pdf/index.ts` | Fix refund RPC call |
| `src/lib/capture/screenShare.ts` | Remove duplicate exports (lines 135-165) |

### User Action Required
- Add `ANTHROPIC_API_KEY` to Supabase Edge Function secrets for PDF parsing to work

