## Phase 4 (split into 4A scraper fix + 4B audit items)

User's "component-by-component" rule + the scraper being broken right now means I'll fix the scraper first as a standalone slice, then continue with the original Phase 4 audit items.

---

### 4A — Fix `collect-exam-papers` scraper (BLOCKER)

**Root cause (verified by reading `supabase/functions/collect-exam-papers/index.ts`):**
The allowlist gate in `isAllowedUrl` rejects any PDF URL whose hostname isn't in `ALLOWED_HOSTS`. But official paper PDFs on NTA are served from CDN subdomains (`cdnbbsr.s3waas.gov.in`, `cdn3.digialm.com`), UPSC PDFs from `upsc.gov.in/sites/...` (works) but also `documents.upsc.gov.in`, and SSC from `ssc.nic.in/SSCFileServer/...` plus the new `ssc.gov.in` host. So `extractPdfLinks` discards every CDN-hosted PDF → `pdfs_found: 0` → toast "No questions imported".

Secondary issues:
1. Year filter `html.includes(String(year))` is global to the page, but the page often only mentions ranges like "2019-2024" without the exact year token → false negatives.
2. `successResponse` returns `message: "No PDF links found…"` but `imported: 0` triggers a warning toast that doesn't surface *why*.
3. `requireAuth` / `requireAdmin` helpers — confirm they exist in `_shared`.

**Fix plan (scoped to this one edge function — no DB or UI changes):**

1. **Two-tier allowlist:** keep `ALLOWED_HOSTS` for listing pages, add `ALLOWED_PDF_HOSTS` that includes the CDN hostnames:
   ```ts
   const ALLOWED_PDF_HOSTS = new Set([
     ...ALLOWED_HOSTS,
     "cdnbbsr.s3waas.gov.in",
     "cdn3.digialm.com",
     "cdn.digialm.com",
     "documents.upsc.gov.in",
     "static.upsc.gov.in",
     "ssc.gov.in",
     "www.ssc.gov.in",
     "ibpsonline.ibps.in",
   ]);
   function isAllowedListingUrl(raw) { …existing strict check… }
   function isAllowedPdfUrl(raw) { …same check against ALLOWED_PDF_HOSTS… }
   ```
   Use `isAllowedListingUrl` in the listings loop, `isAllowedPdfUrl` in `extractPdfLinks`.

2. **Relax year filter:** keep it as a *preference*, not a hard filter. Sort matches with year-in-URL first, take top 5, fall back to no-year matches if none match. (Avoids dropping all results when the year is encoded as `2024-25` instead of `2024`.)

3. **Better diagnostics in the "0 imported" path:** include `pdfs_found`, `pdfs_processed`, and the first parse `errors[]` in the response so the admin toast shows actionable info (already wired in `AdminSeedQuestions.tsx` — `res.errors` is logged).

4. **Add explicit return when listing fetch fails per page** (collect into `errors[]` instead of throwing the whole call), so one dead URL doesn't kill the run.

5. Increase `uniquePdfs` cap from 3 → 5 to match `extractPdfLinks` cap (currently mismatched).

6. **Quick smoke test** with `supabase--curl_edge_functions` POST `/collect-exam-papers` body `{"exam_type":"JEE_MAIN","year":2024}` — confirm response shape includes `pdfs_found > 0` or actionable `errors[]`. (Logged in as preview admin user.)

**Guardrails:** no schema changes, no client changes, no scope creep into other scraper sources. `parse-question-pdf` untouched. `_shared/banCheck.ts` untouched.

---

### 4B — Original Phase 4 audit items (after 4A is verified)

Same scope as previously discussed, will reconfirm before starting:

1. **`.maybeSingle()` migration** — convert `.single()` → `.maybeSingle()` in the hooks/pages where a missing row is a normal "not found" case (per project memory rule). Candidates from grep: `authStore`, `sessionLifecycle`, `useXPSystem`, `subscriptionManager`, `creditsManager`, `useStreakTracker`, `useScorecard`, `useGamification`, `ResumeDetail`, `CompanyProfile`, `JDDetail`, `SessionDetail`, `DebriefDetail`, `TestSession`, `TestResults`, `OnboardingStep5ResumeUpload`. I'll triage which actually need it (only the lookups where 0 rows is expected) — not a blanket replace.

2. **AdminDashboard error handling** — surface errors via `setError`/toast instead of silent fallback.

3. **`useXPSystem`** — `setError` instead of silently swallowing.

**After 4A I will stop and wait for explicit "go 4B" before starting any of these.**

---

### Out of scope for this phase
- N+1 query elimination (will be Phase 5).
- Hard-coded anon-key consolidation (low-priority).
- `/settings/byok` decision (low-priority).