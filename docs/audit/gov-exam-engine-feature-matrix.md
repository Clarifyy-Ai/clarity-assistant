# Government exam engine feature matrix

Inspection date: 2026-08-15.

| Feature ID | Capability | Route | Status | Residual |
|---|---|---|---|---|
| GOV-CATALOG | Exam catalogue | `/app/mock-test`, `/gov-exams` | VERIFIED_WIRED | Pilot packs only; 0 full-sim ready |
| GOV-ONBOARD | Exam onboarding | `/app/mock-test/exam/:code` | VERIFIED_WIRED | Preferences persist; no invented official facts |
| GOV-SYLLABUS | Syllabus tracking | exam detail + mastery | VERIFIED_WIRED | Labels mapped to spec states |
| GOV-QBANK | Question bank | admin + player | PARTIAL_CONTENT | Thin verified coverage |
| GOV-PYQ | Previous-year papers | exam detail Previous | PARTIAL_CONTENT | BLOCKED_CONTENT_LICENSING for full libraries |
| GOV-BLUEPRINT | Mock paper generation | `/app/mock-test/generate` | VERIFIED_WIRED | Deterministic blueprint; AI fill Pro-gated |
| GOV-AIQ | AI-generated questions | paper jobs | PARTIAL_AI | Never auto-publish; never labeled PYQ |
| GOV-PLAYER | Exam player FSM | `/app/mock-test/session/:id` | VERIFIED_WIRED | attempt_phase + local recovery; pause does not extend timer |
| GOV-EVAL | Evaluation | `submit-test` | VERIFIED_WIRED | Negative marking; versioned attempt_phase |
| GOV-RESULT | Result analysis | `/app/mock-test/results/:id` | VERIFIED_WIRED | Real score metrics |
| GOV-RANK | Rank / percentile | results | VERIFIED_WIRED | Shows “Ranking data is not yet available.” until cohort ≥ 50 |
| GOV-CA | Current affairs | table `current_affairs` | PARTIAL_DATABASE | Empty until verified ingest |
| GOV-COURSES | Courses / live / doubts | — | FUTURE_GATED | Needs providers + licensed content |
| GOV-ADMIN | Admin/reviewer | `/app/admin/gov/*` | VERIFIED_WIRED | Author ≠ reviewer constraint added |

See `gov-exam-engine-evidence.json`.
