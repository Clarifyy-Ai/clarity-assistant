# Hybrid Live Chat: Bot Resolution + Agent Incidents

Support chat runs entirely on the `support-chat` Edge function with shared triage logic in `src/lib/support/triage.ts` (mirrored in `supabase/functions/_shared/supportTriage.ts`).

## Flow

1. **User message** → `classifySupportRequest` (rules) → `shouldAutoEscalate` (triage).
2. **Auto-escalate** (if triggered) → thread becomes `mode: waiting_agent`, `status: pending`, priority set, system message with ticket ref (`CP-*`).
3. **Otherwise** → deterministic snapshot reply or optional Gemini for unclear questions.
4. **Admin** → `AdminLiveChat` queue sorted by priority (`urgent` → `high` → `normal` → `low`), then `last_message_at`.

## Auto-escalate triggers

| Trigger | Priority | Example |
|---------|----------|---------|
| Talk to Support / explicit escalate | normal | User taps chip |
| Payment urgent language | urgent | "charged but credits not received" |
| Stuck after bot job reply | high | Bot explained `exam_job`, user says "still stuck" |
| 2+ unresolved AI turns | normal/low | `unclear` intent after repeated AI replies |

Escalation state is stored in `support_threads.context_snapshot.escalation` (no migration).

## User experience

- Widget shows priority-aware waiting labels and ticket ref in header.
- Chat stays saved; user can add messages while waiting.
- Agent replies appear in the same thread.

## Admin queue

- Filter: **Urgent** (`priority === urgent` && `waiting_agent`).
- Badges per priority on thread list.
- `summary` shown in thread detail when present (Gemini one-liner on escalate, or truncated user message).

## Deploy

```bash
node --use-system-ca scripts/deploy-edge-via-management-api.mjs support-chat
```

## Verification checklist

1. "I paid but credits not received" → urgent incident, `CP-*` ref in system message.
2. Stuck paper → bot job status → user "still stuck" → auto-escalate.
3. Ambiguous question → 2 AI replies → auto-escalate on 3rd message.
4. Talk to Support chip → escalate without AI.
5. Thread persists; guest poll / signed-in realtime shows agent reply.
6. Admin queue shows urgent threads first with badge.
