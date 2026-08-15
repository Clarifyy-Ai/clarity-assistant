# Interview engine feature matrix

Inspection date: 2026-08-15. Status model from dual-engine certification plan.

| Feature ID | Capability | Route | Status | Residual |
|---|---|---|---|---|
| INT-ONBOARD | Candidate onboarding | `/onboarding` | VERIFIED_WIRED | Industry, date, goals, difficulty persisted |
| INT-RESUME | Resume upload/parse/correct/delete | `/app/documents/resume/:id` | VERIFIED_WIRED | Extraction is provider-dependent |
| INT-JD | Job description + gap analysis | `/app/documents/jd/:id` | VERIFIED_WIRED | Explainable match; no random % |
| INT-QBANK | Interview question bank | `/app/mock`, `/app/answers` | PARTIAL_CONTENT | Generated + local fallback; bookmarks via answer bank |
| INT-MOCK | Mock session FSM | `/app/mock/session/:id` | VERIFIED_WIRED | lifecycle_status mapped; legacy status kept |
| INT-AUDIO | Mic + Deepgram STT | overlay / mock | VERIFIED_WIRED | BLOCKED_CREDENTIALS without Deepgram |
| INT-AI | Hints/answers/debrief | edge functions | VERIFIED_WIRED | Server-side; practice-tagged sessions only |
| INT-OVERLAY | Practice overlay | `/app/live/overlay` | VERIFIED_WIRED | Capture evasion disabled; discrete UI labels only |
| INT-CODING | Coding practice | `/app/prep/coding-hints` | PARTIAL_UI | Visible JS runner only; hidden judge BLOCKED_PROVIDER |
| INT-ANALYSIS | Post-session analysis | `/app/debriefs/:id` | VERIFIED_WIRED | scored_dimensions required; no fake scores |
| INT-PLAN | Interview study plan | `/app/plan` | VERIFIED_WIRED | Rule-based; no readiness % |
| INT-VIDEO | Video coaching | — | NOT_FOUND | FUTURE_GATED |
| INT-GROUP | Group rooms | `/app/rooms` | FUTURE_GATED | Retired |

See `interview-engine-evidence.json` for source files and entitlements.
