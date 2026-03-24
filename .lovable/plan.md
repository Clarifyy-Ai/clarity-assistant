

# Fix All Build Errors & Database Connection Issues

## Current Build Error
The only blocking build error is in `OverlayPositionManager.tsx` (lines 79-102) — duplicated/malformed JSX with double `<div>`, double `{children}`, double `</div>`, and double `);`.

## Code Fixes (No Code Removal — Only Corrections)

### 1. Fix `OverlayPositionManager.tsx` — Corrupted JSX (BLOCKING BUILD)
Lines 79-102 have duplicated elements. Fix the return block to a single correct JSX structure:
```tsx
return (
  <div
    ref={mergedRef}
    className="fixed animate-fade-in"
    style={{
      left: `${position.x}px`,
      top: `${position.y}px`,
      zIndex: 2147483647,
      pointerEvents: "auto",
      isolation: "isolate",
      willChange: "transform",
      transform: "translateZ(0)",
    }}
  >
    {children}
  </div>
);
```

### 2. Fix `AdminDashboard.tsx` — Column name mismatch (line 49)
Change `.not("plan", "eq", "free")` to `.not("plan_id", "eq", "free")` — the live DB column is `plan_id`.

### 3. Fix `RoomSession.tsx` — Wrong table name (line 60)
Change `"practice_room_participants"` to `"room_participants"` — that's the actual table name in the live DB.

### 4. Fix `SettingsNotifications.tsx` — Non-existent column (line 66)
The `notification_prefs` column doesn't exist on `profiles`. Change the save logic to use the `metadata` JSONB column instead: `update({ metadata: { ...profile?.metadata, notification_prefs: prefs } })`. Also fix the initial state read on line 51 to use `profile?.metadata?.notification_prefs`.

### 5. Fix `useCredits.ts` — `refund_credits` RPC call (line 84)
The `refund_credits` RPC exists in the live DB and accepts `p_cost`. This is already correct. No change needed (file has `@ts-nocheck` so no build error).

## Database State
All 27 previously-missing tables **now exist** in the live DB (confirmed in the `<supabase-tables>` context: `analytics`, `answer_bank`, `calendar_integrations`, `company_research`, `credits`, `exam_papers`, `feedback`, `interview_rounds`, `job_descriptions`, `mock_tests`, `practice_rooms`, `questions`, `resumes`, `revision_list`, `room_chat`, `room_questions`, `saved_answers`, `scheduled_interviews`). The `refund_credits` and `update_topic_performance` RPCs also exist. The migration was successfully applied.

## RLS Linter Warnings
- 9 functions with mutable search_path — low priority, won't affect functionality
- 4 "always true" RLS policies on `room_chat`, `room_questions`, `model_cost_logs` — intentional for shared data, acceptable

## Summary
Only **4 files** need fixes. No database changes needed — all tables are present.

