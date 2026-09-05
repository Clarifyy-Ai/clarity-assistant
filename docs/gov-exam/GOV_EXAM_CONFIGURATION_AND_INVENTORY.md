# GOV_EXAM_CONFIGURATION_AND_INVENTORY

## Configuration

### Client validation

`src/lib/gov-exam/generationConfig.ts` + `questionCount.ts`:

- Required: examId, stageId, basis/mode, language, question count, duration (pattern modes)
- Rejects: zero/negative, NaN, decimals, unsupported pattern counts
- Continue/Generate disabled with explicit reasons via `resolveGeneratorReadiness`

### Server persistence

At **Generate** click, configuration is sent in `create-exam-paper` body and stored on the job as `request_json` (durable). Fields include:

- examId, stageId, mode, language, questionCount, durationMinutes, topics, difficulty, pattern/syllabus version refs, availabilitySnapshotId

Pre-enqueue dedicated `gov_exam_configurations` table: **deferred** — job `request_json` + idempotency key is sufficient for audit when combined with inventory snapshot.

## Inventory — single authoritative source

### Before

| Source | When used | Problem |
|--------|-----------|---------|
| RPC `count_gov_exam_eligible_questions` | Most modes | `public_pyp` OR bug counted all approved |
| `legacy_fallback` row scan | RPC skip / error | Diverged from RPC |
| Python availability | create + check | Could override official/PYQ on create |

### After (this recovery)

1. Migration `20260905140000_gov_exam_inventory_public_pyp_fix.sql` — `gov_inventory_v2`; public_pyp requires official/PYQ source match
2. `supabase/functions/_shared/govQuestionInventory.ts` — RPC only when `examId` present; throws on RPC error; legacy only when examId absent
3. `create-exam-paper` — Python override **skipped** for `official_previous` (aligned with check-availability)

### Standard availability response

```json
{
  "inventorySnapshotId": "<correlationId>",
  "requested": 100,
  "approvedAvailable": 82,
  "missing": 18,
  "generationAllowed": true,
  "strategy": "approved_plus_validated_ai_fill"
}
```

Review step and Generate must share the same `availabilitySnapshotId`. Create re-counts at enqueue (authoritative for charge) but stamps the same snapshot id on the job.

## Source modes

| Mode | Inventory policy | AI fill |
|------|------------------|---------|
| official_previous / official_paper | verified PYQ only | Never |
| generated_mock / realistic_mock | approved_bank | Allowed when plan permits |
| custom_mock / quick_drill | approved_bank | Label AI questions clearly |

Official/PYQ shortage → `CONTENT_INSUFFICIENT` or `OFFICIAL_CONTENT_INSUFFICIENT`; never silent AI backfill.
