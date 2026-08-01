# Exam Pack Certification

An exam pack is public only when:

- Recruiting body + exam + stage registered  
- Approved pattern version + sections  
- Approved syllabus version  
- Official source links registered  
- Language configuration present  
- Scoring rules (marks / negative mark) server-owned  
- Question bank coverage documented  
- Automated tests for alias search + blueprint  
- Known limitations recorded  

## Bank readiness (full-pattern simulation)

Full simulation requires **public + verified** questions for the exam’s `legacy_exam_type` ≥ approved pattern `total_questions`.

| Status | Meaning |
|--------|---------|
| `ready` | Bank count ≥ pattern total — Full Simulation enabled |
| `partial` | Some approved questions, below pattern total — Full Simulation disabled |
| `empty` | Zero public verified questions — Full Simulation disabled |

Source of truth:

- SQL RPC: `get_gov_exam_bank_readiness()`  
- View: `gov_exam_bank_readiness`  
- CLI: `SUPABASE_ACCESS_TOKEN=… node scripts/gov-bank-readiness.mjs`  
- Verify runway CLI: `node scripts/gov-bank-verify-stats.mjs`  
- Exposed to UI via `search-exams` → `bankReadiness`  
- Admin queue: `/app/admin/gov/question-review` (default filter: **public + unverified**)

**Do not invent question counts.** Numbers below were queried live against project `qzgvjrvtkwlzxpmlddkx` (service-role REST count by `legacy_exam_type`, `is_public`, `is_verified`). `SUPABASE_ACCESS_TOKEN` was not present in this run; refresh with Management API when available.

### Queried coverage (2026-08-02)

| Exam | Stage | Pattern Q | Approved public (verified) | Public (any) | Status | Full sim |
|------|-------|-----------|----------------------------|--------------|--------|----------|
| SSC CGL | Tier I | 100 | 20 | 111 | **partial** | no |
| RRB NTPC | CBT 1 | 100 | 0 | 0 | **empty** | no |
| IBPS PO | Prelims | 100 | 18 | 109 | **partial** | no |
| UPSC CSE Prelims GS | GS Paper I | 100 | 23 | 205 | **partial** | no |
| APPSC Group-II Screening | Screening | 150 | 0 | 91 | **empty** | no |

Notes from query:

- No pack is `ready` for Full Simulation yet.  
- APPSC has public rows but **zero verified** → status `empty` for certification gating.  
- RRB NTPC uses legacy type `GENERAL` and currently has no matching public bank rows.  
- Prefer reporting empty/partial honestly over seeding copyrighted PYQs.

After applying `20260802160000_gov_exam_bank_readiness.sql`, refresh with:

```bash
node scripts/gov-bank-readiness.mjs
node scripts/gov-bank-verify-stats.mjs
```

## Verification runway (certify without inventing questions)

Increase bank readiness by **verifying existing public questions**, not by inventing copyrighted PYQs.

Formula:

`verifies_needed = max(0, pattern_total − public_verified)`

Also track `unverified_public` (`is_public=true AND is_verified=false`) — the pool admins can certify from.

### Live verify runway (2026-08-02)

Queried via `node scripts/gov-bank-verify-stats.mjs` (service-role REST; prefer `SUPABASE_ACCESS_TOKEN` when set):

| Exam code | Status | Verified | Public | Unverified public | Pattern | Verifies needed |
|-----------|--------|----------|--------|-------------------|---------|-----------------|
| APPSC_GROUP2 | empty | 0 | 91 | 91 | 150 | **150** |
| IBPS_PO | partial | 18 | 109 | 91 | 100 | **82** |
| RRB_NTPC | empty | 0 | 0 | 0 | 100 | **100** |
| SSC_CGL | partial | 20 | 111 | 91 | 100 | **80** |
| UPSC_CSE_PRELIMS | partial | 23 | 205 | 182 | 100 | **77** |

**Totals:** 0 packs ready · **489** verifies still needed across all packs for full `ready`.

Caveats:

- APPSC needs 150 verifies but only 91 unverified-public rows exist — remaining gap requires additional **licensed / official** public ingest, not invented MCQs.  
- RRB NTPC has zero public bank rows under legacy `GENERAL` — ingest/link official sources first.  
- SSC / IBPS / UPSC have enough unverified-public rows to close the runway via admin verify alone.

### Admin workflow (explicit action required)

1. Open **Admin → Gov Exams → Q Review**.  
2. Default filter: **public + unverified** (+ optional legacy exam type).  
3. Review each item (or select a bulk set).  
4. Confirm bulk action in the UI dialog — **no blind auto-verify**.  
5. Actions (each writes `admin_audit_log`):  
   - **Verify** → `is_verified=true`, keep public  
   - **Unpublish** → `is_public=false`  
   - **Request translation** → draft stub + metadata flag (no invented translation text)  
6. Mutations use existing admin RLS (`adminOps`); no separate edge function required.

## Pilot packs (registry seeded)

| Exam | Stage | Pattern | Syllabus | Languages | Registry | Bank coverage |
|------|-------|---------|----------|-----------|----------|---------------|
| SSC CGL | Tier I | 2024.1 | 2024.1 | en, hi | REGISTRY_APPROVED | partial 20/100 — need 80 verifies — Full Simulation disabled |
| RRB NTPC | CBT 1 | 2024.1 | 2024.1 | en, hi | REGISTRY_APPROVED | empty 0/100 — need 100 (no public pool) — Full Simulation disabled |
| IBPS PO | Prelims | 2024.1 | 2024.1 | en, hi | REGISTRY_APPROVED | partial 18/100 — need 82 verifies — Full Simulation disabled |
| UPSC CSE Prelims GS | GS Paper I | 2024.1 | 2024.1 | en, hi | REGISTRY_APPROVED | partial 23/100 — need 77 verifies — Full Simulation disabled |
| APPSC Group-II Screening | Screening | 2024.1 | 2024.1 | en, te | REGISTRY_APPROVED | empty 0/150 verified (91 public unverified) — need 150; verify on psc.ap.gov.in |

Patterns are practice approximations; candidates must verify the active official notification.

**Do not claim “all Indian government exams supported.”** One State PSC pilot (APPSC Group-II) is seeded; other state commissions are not certified by this pack.

Starter practice MCQs in historical seed migrations (if present) are **practice/synthetic-style** items for pipeline smoke — they do **not** certify Full Simulation until live readiness reports `ready`.
