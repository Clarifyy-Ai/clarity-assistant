# Prep Lab + Gov Exam Mock Tests Audit — 2026-05-25

---

## 1. Feature map

### Prep Lab (`/app/prep`)

| Feature | Files | Backend | Status |
|---------|-------|---------|--------|
| Hub (tabs) | `PrepLab.tsx` | — | **FIXED** (tool links, bank, company) |
| STAR tab | `PrepLab.tsx` | `polish-star-section`, `generate-star-answer` | **FIXED** (STAR draft in prompt) |
| Question bank | `PrepLab.tsx` | `answer_bank` | **FIXED** (`question_text`, practice + save) |
| AI tools modal | `PrepLab.tsx` | `prep-tool` | **working** |
| Company prep | `PrepLab.tsx` | `company-research` | **FIXED** (`fetchEdgeJson`) |
| Rephraser | `Rephraser.tsx` | `prep-tool` | **FIXED** (single credit path) |
| Coding hints | `CodingHints.tsx` | `prep-tool` | **FIXED** |
| System design | `SystemDesign.tsx` | `prep-tool` | **FIXED** |
| Project builder | `ProjectBuilder.tsx` | `prep-tool` | **FIXED** |
| STAR standalone | `StarBuilder.tsx` | `prep-tool` | **NEEDS MANUAL TEST** |

### Gov exam mock tests (`/app/mock-test`)

| Feature | Files | Backend | Status |
|---------|-------|---------|--------|
| Hub | `MockTestHub.tsx` | `mock_tests` | **FIXED** (Papers link) |
| Configure | `TestConfigure.tsx` | `select-test-questions`, `create-test` | **FIXED** (exam URL resolve) |
| Session | `TestSession.tsx` | `submit-test` | **working** |
| Results | `TestResults.tsx` | `test_analyses` | **FIXED** (retry poll) |
| Exam papers | `ExamPapers.tsx` | `exam_papers` | **FIXED** (year cap, configure URL) |
| Excel upload | `ExcelImportTab.tsx` | `questions` | **FIXED** (exam type normalize) |
| PDF upload | `UploadQuestions.tsx` | `parse-question-pdf` | **working** |
| Analytics / revision | `TestAnalytics.tsx`, `TestRevision.tsx` | DB | **data-dependent** |

---

## 2. Issue register

| Sev | Issue | Fix |
|-----|-------|-----|
| P0 | Double credits (client + `prep-tool` EF) | Removed `credits.deduct` on prep sub-pages; `refreshCredits()` after success |
| P0 | Question bank wrong column `question` | Use `question_text` |
| P0 | Invalid `star_breakdown` insert | Valid `answer_bank` columns only |
| P0 | Company brief empty (`res.json()` wrong) | `fetchEdgeJson("company-research")` |
| P0 | `prep-tool` result parsing broken on Coding/System/Project | `fetchEdgeJson<{ result }>` |
| P1 | Practice modal buttons dead | Wired save + AI feedback |
| P1 | STAR generate ignored user STAR fields | Append draft to `resumeText` |
| P1 | `AI_GENERATED` ignored when PYP also selected | EF: `includeOnlyPYP` only when AI off |
| P1 | Configure URL `exam=JEE Main` broke subjects | `resolveExamConfigId()` |
| P1 | Exam papers year cap 2022 | Raised to **2025** |
| P1 | Results page race on `test_analyses` | Retry poll up to ~4s |
| P2 | Hub missing papers link | Configure + Papers per exam card |
| P2 | Excel `JEE_MAIN` not matched in selection | `normalizeExamTypeForStorage()` on insert |

---

## 3. Remaining / manual test

- Populate `questions` table (upload, admin seed, or `SYSTEM_USER_ID` + gap-fill)
- Add `CareerPilot_Question_Template.xlsx` to `public/` or fix download path
- CSV import (not implemented — Excel only)
- `StarBuilder.tsx` still uses `supabase.functions.invoke` — verify envelope
- Deploy updated `select-test-questions` edge function to Supabase

---

## 4. Validation

```bash
npm install && npm run build
```

1. Prep Lab → Question bank loads saved questions  
2. Prep Lab → Company prep shows overview  
3. Coding hints returns AI text (with keys)  
4. Mock test hub → Papers → launch/configure with correct exam id  
5. Upload Excel with `Exam_Type=JEE_MAIN` → configure test finds questions  
