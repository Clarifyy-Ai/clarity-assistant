# Clarify AI — Abbreviated Spec Pointer

**Product:** Clarify AI — AI-powered interview **preparation**  
**Stack in repo:** Vite + React + Supabase Edge Functions + optional Electron desktop  
**Full launch checklist:** [Clarify AI_ALIGNMENT.md](./Clarify AI_ALIGNMENT.md)

---

## Scope guardrails (intentionally removed)

These features were **removed from scope** and must not be reintroduced without legal review:

| Removed | Rationale |
|---------|-----------|
| **Stealth overlay** — hides from screen-share/Zoom/Teams, auto-fade, panic-kill, no taskbar | Covert cheating infrastructure, not prep |
| **Real-time auto-answer during live third-party interviews** | Deceives employer/examiner during hiring decisions |

**Allowed instead:** Mock, warmup, and rehearsal sessions with post-answer feedback and clearly labeled practice AI assistance.

See also: [COMPLIANCE_GATING.md](./COMPLIANCE_GATING.md), `src/lib/compliance/featureGates.ts`.

---

## Engineering guardrails (in force)

- AI generation edge functions enforce session type server-side (`supabase/functions/_shared/sessionEnforcement.ts`).
- Allowed types: `mock`, `warmup`, `rehearsal`, `room`, `practice`.
- `type=live` requires DB `tags` containing `practice` or `rehearsal` (client flags are not trusted).
- Screen-capture evasion code **removed** from the codebase (see `COMPLIANCE_GATING.md`).

---

## Module map (spec §1.3 → repo)

| Spec module | Primary routes / files |
|-------------|------------------------|
| Auth & onboarding | `src/pages/auth/*`, `src/pages/onboarding/*` |
| Dashboard | `src/pages/app/Dashboard.tsx` |
| Document hub | `src/pages/app/documents/*` |
| Prep tools | `src/pages/app/prep/*`, `supabase/functions/prep-tool` |
| Mock & practice | `src/pages/app/mock/*`, `src/pages/app/live/LiveRehearsal.tsx` |
| Scoring & debrief | `src/pages/app/scorecard/*`, `generate-debrief` |
| Analytics | `src/pages/app/analytics/*` |
| Billing | `src/pages/app/settings/billing/*`, Stripe edge functions |
| Settings | `src/pages/app/settings/*` |
| Troubleshooting / export | `export-user-data`, `delete-account`, Help center |

---

## Deploy reference

- Pre-flight: `node scripts/pre-deploy-check.mjs`
- Deploy steps: [DEPLOY_PRODUCTION_CHECKLIST.md](./DEPLOY_PRODUCTION_CHECKLIST.md)

---

*For checklist status by section (A–F), see [Clarify AI_ALIGNMENT.md](./Clarify AI_ALIGNMENT.md).*
