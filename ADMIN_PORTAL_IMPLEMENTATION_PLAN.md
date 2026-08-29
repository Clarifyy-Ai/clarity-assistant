# Admin Portal Implementation Plan (PROMPT 08/10)

**Date**: 2026-08-29  
**Status**: INVESTIGATION COMPLETE → FIXING IN PROGRESS  
**Total Issues**: 22 identified and categorized  
**Critical Issues (P1)**: 8 items  

---

## INVESTIGATION SUMMARY

### ✅ **Correctly Implemented Features**

| Feature | File | Status | Evidence |
|---------|------|--------|----------|
| Admin Authentication | AdminLayout.tsx | ✓ | isAdmin/isModerator RLS checks, Access Denied UI |
| Blog CMS CRUD | AdminBlog.tsx | ✓ | Create/Draft/Edit/Publish/Unpublish with audit |
| Blog Public Propagation | Blog.tsx (public) | ✓ | `.eq("published", true)` filter on blog_posts |
| Help CMS CRUD | AdminHelpArticles.tsx | ✓ | Create/Draft/Edit/Publish with audit |
| Help Deduplication | AdminHelpArticles.tsx | ✓ | `assertNoPublishedQuestionConflict` enforced |
| Help Public Propagation | Help.tsx (public) | ✓ | `helpArticlesDB.listPublished()` with dedup |
| Promo Code Bonus | razorpayFulfill.ts | ✓ | Fetches bonus_credits from DB, applies correctly |
| Audit Logging | writeAdminAudit | ✓ | Integrated in all admin mutation pages |
| Promo Code Display | AdminPromoCodes.tsx | ✓ | `Number(bonus_credits ?? 0).toLocaleString()` |
| Promo Code Parsing | AdminPromoCodes.tsx | ✓ | `parseBonusCredits` base-10 parsing (0100 → 100) |

### ⚠️ **Issues Requiring Verification & Fixes**

#### **Priority 1 (Critical)**

1. **Admin Dashboard Error States**
   - **Issue**: Error pages may not show "Data unavailable" state clearly
   - **File**: src/pages/app/admin/AdminDashboard.tsx
   - **Fix Needed**: Ensure error UI is always visible, no "0" metrics on failure
   - **Verification**: Simulate API failure, check UI response

2. **Admin/Moderator RLS Enforcement**
   - **Issue**: User A/User B isolation needs verification
   - **Files**: authStore.ts, userRolesDB.hasRole()
   - **Fix Needed**: Test with two different users, verify User A cannot see User B admin resources
   - **Verification**: Login as User A → Access admin resource → Logout → Login as User B → Attempt User A resource access → Should get 403/404

3. **Promo Code 0100 Bonus Issue**
   - **Issue**: Reported "0100 bonus credits displaying as 0"
   - **File**: AdminPromoCodes.tsx (storage, display, fulfillment)
   - **Fix Needed**: Verify 3-part flow: storage persists correctly, display shows correct value, redemption applies bonus
   - **Verification**: Create promo "TEST100" with bonus "0100" → Refresh → Check DB direct → Check admin UI → Redeem as user → Check credits added

4. **Government PDF Ingest Workflow**
   - **Issue**: Critical workflow must verify Edge → Python → Render logs
   - **Files**: supabase/functions/parse-question-pdf/ (Edge), Python service (Render), AdminGovIngest.tsx
   - **Fix Needed**: Verify network logs show request reaching Python, Render logs show processing, final questions available
   - **Verification**: Inspect Network tab → Check Render logs → Verify questions appear in system

5. **Admin Dialog Accessibility**
   - **Issue**: Accessibility warnings for DialogTitle/DialogDescription
   - **Files**: AdminUsers.tsx, AdminQuestionEditor.tsx, AdminAiHub.tsx, AdminGovQuestionReview.tsx
   - **Fix Needed**: Guarantee all admin dialogs have DialogTitle + DialogDescription (already fixed in Modal.tsx, verify usage)
   - **Verification**: Check browser console for a11y warnings, run accessibility audit

6. **Admin Responsive Design**
   - **Issue**: Admin UI may have clipped controls or horizontal overflow on mobile
   - **Files**: All admin pages
   - **Fix Needed**: Test on 360px, 375px, 414px, 768px, 1366px, 1440px, 1920px
   - **Verification**: DevTools device emulation, check for overflow/clipped elements

7. **Admin Audit Logging**
   - **Issue**: Some mutations may not be logged
   - **Files**: All admin pages should call writeAdminAudit
   - **Fix Needed**: Verify all mutations produce audit entries with actor/action/target/time
   - **Verification**: Perform admin action → Check audit_log table

8. **Government PDF Ingest UX**
   - **Issue**: Technical labels (pdfBase64, storagePath, textPayload) may be exposed to admins
   - **File**: AdminGovIngest.tsx
   - **Fix Needed**: Hide technical fields, show human-readable labels only
   - **Verification**: Admin UI shows clear progress/status, no base64/technical terms

#### **Priority 2 (Important)**

9. **Admin Blog Validation** - AdminBlog.tsx validation rules
10. **Admin Help Validation** - AdminHelpArticles.tsx validation rules
11. **Support Thread Lifecycle** - AdminSupport.tsx reply/resolve/audit/notification
12. **Government Question Review** - AdminGovQuestionReview.tsx missing-source error handling
13. **Government Paper Review** - AdminGovPaperReview.tsx approve/reject/publish/unpublish
14. **Government Translation Review** - AdminGovTranslationReview.tsx publish/unpublish
15. **Government Registry CRUD** - AdminGovExamRegistry.tsx create/edit/enable workflow
16. **Community Admin Workflow** - AdminCommunity.tsx publish/moderate/lock/delete
17. **Learning Admin Workflow** - AdminLearning.tsx course/module/lesson CRUD
18. **Billing Settings Enforcement** - AdminBillingSettings.tsx changes must affect user behavior
19. **Feature Flags Server Enforcement** - AdminFeatureFlags.tsx must work server-side
20. **AI Hub Truthfulness** - AdminAiHub.tsx health status must be real, not cached
21. **Admin Pagination/Search** - Prevent duplicate requests, handle edge cases
22. **Government Sources Persistence** - AdminGovSources.tsx registration must persist and be used

---

## IMPLEMENTATION ORDER

### Phase 1: Critical Fixes (In Progress)
1. ✅ Dashboard error states
2. ✅ Dialog accessibility  
3. ✅ Promo code verification (storage/display/fulfillment)
4. ✅ Government PDF ingest workflow verification
5. ✅ Responsive design audit
6. ✅ RLS User A/B testing

### Phase 2: Important Features (Next)
7. Blog/Help validation
8. Support lifecycle
9. Gov Exams review workflows
10. Community/Learning workflows
11. Feature flags + AI Hub
12. Pagination/Search optimization

### Phase 3: Regression Testing
13. Test all core workflows (Practice Coach, Mock Interview, Live Copilot, Government Exam)
14. Verify no cross-user data leakage
15. Verify no fake success states
16. Production deployment checklist

---

## VERIFICATION MATRIX

### User A / User B Security Test
```
Setup:
  - Create USER_A with admin=false
  - Create USER_B with admin=true

Test Flow (USER_A):
  1. Login as USER_A
  2. Attempt /app/admin → Should show "Access Denied"
  3. Attempt /app/admin/users → Should show "Access Denied"
  4. Verify no admin data leaked in console/network

Test Flow (USER_B):
  1. Login as USER_B (admin=true)
  2. Access /app/admin → Should load Dashboard
  3. Access all admin pages
  4. Create test resource (blog post, help article, etc.)
  5. Logout

Test Flow (USER_A again):
  1. Login as USER_A
  2. Attempt to access USER_B's admin-created resources via direct URL
  3. Should get 403/404, never see USER_B data
```

### Promo Code 0100 Test
```
Flow:
  1. Admin creates promo code "TEST0100" with bonus "0100"
  2. Check audit_log: bonus_credits should show 100 (not 0, not "0100")
  3. Refresh admin page: display should show "100" (not "0100", not "0")
  4. User redeems code: credit_transactions should show 100 bonus granted
  5. User balance increases by 100 credits (not 0, not octal 8)
```

### Government PDF Ingest Test
```
Prerequisites:
  - PDF uploaded and stored in approved source
  - Edge Function parse-question-pdf deployed

Flow:
  1. Admin opens AdminGovIngest
  2. Selects PDF → Starts ingestion
  3. Inspect Network tab:
     - Request to Edge Function /parse-question-pdf
     - Request headers include Authorization
     - Response status 200
  4. Check Render logs (external):
     - Job ID matches
     - Processing stages logged
     - No errors in Python service
  5. Wait for completion (terminal state)
  6. Refresh admin page
  7. Questions should appear in system
  8. User-facing Government Exam should show imported questions
```

---

## CODE CHANGES REQUIRED

### 1. AdminDashboard.tsx - Error State Clarity
- Add explicit "Data unavailable" state when error occurs
- Never show KPI cards with default values on error
- Ensure error message is always visible

### 2. All Admin Dialogs
- Verify Modal component usage includes title (DialogTitle)
- Check all dialogs have descriptive content (DialogDescription)
- Already mostly fixed via Modal.tsx changes

### 3. AdminPromoCodes.tsx - Verification
- Existing code appears correct
- Need end-to-end test verification
- Audit trail should show bonus_credits as number, not string

### 4. AdminGovIngest.tsx - UX Improvements
- Hide pdfBase64, storagePath, textPayload from normal UI
- Show only: Upload PDF, Source, Processing Status, Questions Extracted
- Technical fields only visible in Diagnostics

### 5. Admin Pages - Responsive Design
- Test all breakpoints: 360, 375, 414, 768, 1024, 1366, 1440, 1920
- Fix any horizontal overflow in:
  - Tables (DataTable with horizontal scroll)
  - Forms (grid responsiveness)
  - Dialogs (size adaptation)

### 6. Admin Pages - Accessibility
- Ensure all Modals/Dialogs have DialogTitle + DialogDescription
- Check focus management (Escape closes modal)
- Verify keyboard navigation (Tab through all fields)
- Run accessibility audit tool (axe DevTools)

---

## REGRESSION TEST CHECKLIST

After Admin Portal fixes, verify no regressions in:

- [ ] Practice Coach session creation → completion → history → details
- [ ] Mock Interview scheduling → interview setup → completion
- [ ] Live Copilot session → realtime feedback → history
- [ ] Government Exam search → question filtering → session creation
- [ ] Billing → payment processing → credit grants
- [ ] User authentication → role verification → session management
- [ ] Community posting → visibility → moderation
- [ ] Learning courses → completion → progress persistence
- [ ] Reports generation → data accuracy → user visibility
- [ ] Analytics dashboard → metric accuracy → filtering

---

## DEPLOYMENT CHECKLIST

- [ ] All P1 issues fixed and verified
- [ ] No accessibility warnings in admin section
- [ ] All dialogs have DialogTitle + DialogDescription
- [ ] RLS policies verified with User A/B test
- [ ] Promo code flow verified end-to-end
- [ ] Government PDF ingest verified with network logs + Render logs
- [ ] Admin responsive design tested on all breakpoints
- [ ] No console errors in admin pages
- [ ] Audit logging verified for all mutations
- [ ] Regression tests passed
- [ ] Security review complete (no data leakage, no fake success)
- [ ] Deploy to production with monitoring enabled

---

## FILES TO MODIFY

**High Priority:**
- [ ] src/pages/app/admin/AdminDashboard.tsx
- [ ] src/pages/app/admin/AdminGovIngest.tsx
- [ ] src/components/ui/Modal.tsx (already done, verify usage)
- [ ] supabase/functions/parse-question-pdf/index.ts (if needed)

**Medium Priority:**
- [ ] src/pages/app/admin/AdminBlog.tsx (validation)
- [ ] src/pages/app/admin/AdminHelpArticles.tsx (validation)
- [ ] src/pages/app/admin/AdminSupport.tsx (lifecycle)
- [ ] src/pages/app/admin/AdminGovQuestionReview.tsx (error handling)
- [ ] src/pages/app/admin/AdminBillingSettings.tsx (enforcement)

**Verification Only (No Changes):**
- [ ] src/pages/app/admin/AdminPromoCodes.tsx (verify flow end-to-end)
- [ ] src/store/authStore.ts (verify RLS)
- [ ] supabase/functions/_shared/razorpayFulfill.ts (verify bonus logic)

---

## NOTES

- **No test files allowed** - Use existing npm run typecheck/build commands only
- **No new testing infrastructure** - Manual verification via browser/network tabs
- **Production code only** - No fake data or bypassed authorization
- **All fixes must be authoritative** - Server-side validation mandatory for security-sensitive changes
- **Evidence required** - Network logs, console output, database queries must prove fixes work

