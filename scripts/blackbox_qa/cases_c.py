"""Black-box cases — Answer Bank through Release-oriented sheets."""
from __future__ import annotations

from .common import SITE, tc

B = SITE


def answer_bank_cases() -> list[dict]:
    return [
        tc("TC-ANS-001", "Answer Bank", "Create answer",
           f"1. Open {B}/app/answers.\n2. Create new answer with title+body.\n3. Save.\n4. Refresh list.",
           "1. List loads (or feature-flag message).\n2. Form works.\n3. Saved.\n4. Appears after refresh.",
           "Create answer persists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-ANS-002", "Answer Bank", "Edit / delete",
           "1. Edit an answer; save; refresh.\n2. Delete; refresh; confirm gone.",
           "1. Edit persists.\n2. Delete persists.",
           "Edit and delete persist.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-ANS-003", "Answer Bank", "Search / filter / categories",
           "1. Create two differently categorized answers if categories exist.\n2. Search by keyword.\n3. Apply filters.",
           "1. Data ready.\n2. Search finds match.\n3. Filters narrow correctly.",
           "Search and filters work.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
        tc("TC-ANS-004", "Answer Bank", "Ownership isolation",
           "1. USER_A creates answer; copy URL.\n2. USER_B opens URL.\n3. Confirm denied.",
           "1. A owns answer.\n2. B attempts.\n3. No access to A's content.",
           "Answers are not cross-user accessible.",
           priority="P0", severity="Critical", test_type="Security", account="USER_A_01"),
        tc("TC-ANS-005", "Answer Bank", "Empty state",
           "1. As NO_HISTORY/empty account open Answer Bank.\n2. Observe empty CTA.",
           "1. Opens.\n2. Empty state with create CTA — not error.",
           "Empty Answer Bank is clear.",
           priority="P3", severity="Cosmetic", account="FREE_USER_02"),
        tc("TC-ANS-006", "Answer Bank", "Use in Practice Coach",
           "1. If UI allows inserting answer-bank item into Practice Coach, do so.\n2. Else mark Unavailable.",
           "1. Integration works or Unavailable recorded.\n2. Do not Pass a dead button.",
           "Answer Bank → Practice Coach integration verified or classified Unavailable.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
    ]


def scheduler_cases() -> list[dict]:
    return [
        tc("TC-SCH-001", "Interview Scheduler", "Create interview",
           f"1. Open {B}/app/interviews/new (or note feature flag).\n2. Fill required date/time/title.\n3. Save.\n4. Refresh list.",
           "1. Form opens or flagged.\n2. Validation works.\n3. Saved.\n4. Persists.",
           "Create interview persists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-SCH-002", "Interview Scheduler", "Edit / reschedule / cancel",
           "1. Edit time; save; refresh.\n2. Cancel/delete; refresh.",
           "1. Reschedule persists.\n2. Cancel removes/marks cancelled.",
           "Edit and cancel persist.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-SCH-003", "Interview Scheduler", "Invalid date / timezone",
           "1. Enter past-invalid date if restricted.\n2. Toggle timezone if control exists.\n3. Observe validation.",
           "1. Invalid blocked or warned.\n2. Timezone applies.\n3. Clear errors.",
           "Date/timezone validation works.",
           priority="P2", severity="Minor", test_type="Negative", account="PRO_USER_01"),
        tc("TC-SCH-004", "Interview Scheduler", "Calendar integration",
           "1. Open Settings → Integrations.\n2. Connect Google Calendar if available.\n3. If not configured, mark Requires Configuration.\n4. Disconnect if connected.",
           "1. Integrations page.\n2. OAuth success or clear failure.\n3. Honest Requires Configuration if missing.\n4. Disconnect works.",
           "Calendar integration verified or Requires Configuration.",
           priority="P1", severity="Major", account="PRO_USER_01",
           notes="Button opening dialog ≠ working integration."),
        tc("TC-SCH-005", "Interview Scheduler", "Email reminder (if configured)",
           "1. Create interview soon enough to trigger reminder if QA harness supports.\n2. Check QA inbox.\n3. Else mark Requires Configuration / Blocked by Environment.",
           "1. Interview created.\n2. Email arrives or N/A.\n3. Honest classification.",
           "Reminder email verified only when email system configured.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
    ]


def sessions_cases() -> list[dict]:
    return [
        tc("TC-SES-001", "Sessions", "List sessions",
           f"1. Open {B}/app/sessions as HISTORY_USER_01.\n2. Apply status filter if present.\n3. Search if present.",
           "1. List shows sessions.\n2. Filters work.\n3. Search works or N/A.",
           "Session list/filter/search usable.",
           priority="P0", severity="Critical", account="HISTORY_USER_01"),
        tc("TC-SES-002", "Sessions", "Session detail — transcript/score",
           "1. Open a completed session.\n2. Verify date, duration, status, transcript/answers/score sections.\n3. Refresh.",
           "1. Detail opens.\n2. Key fields present or explicitly unavailable.\n3. Persists.",
           "Session detail shows durable session data.",
           priority="P0", severity="Critical", test_type="Persistence", account="HISTORY_USER_01"),
        tc("TC-SES-003", "Sessions", "Empty history",
           f"1. As FREE_USER_02 open {B}/app/sessions.\n2. Confirm empty state CTA.",
           "1. Opens.\n2. Empty state — not error.",
           "Empty sessions state is clear.",
           priority="P2", severity="Minor", account="FREE_USER_02"),
        tc("TC-SES-004", "Sessions", "End active session from UI",
           "1. Start a short Practice/Mock.\n2. End from UI.\n3. Confirm appears completed in list.",
           "1. Active.\n2. Ended.\n3. Listed completed with sensible duration/status.",
           "Ending a session updates history.",
           priority="P0", severity="Critical", account="SUFFICIENT_CREDIT_01"),
        tc("TC-SES-005", "Sessions", "Cross-user session URL",
           "1. USER_A copies session detail URL.\n2. USER_B opens it.\n3. Confirm denied.",
           "1. A URL.\n2. B opens.\n3. No A transcript/score exposed.",
           "Session detail is owner-scoped.",
           priority="P0", severity="Critical", test_type="Security", account="USER_A_01"),
    ]


def reports_cases() -> list[dict]:
    return [
        tc("TC-REP-001", "Reports", "Debrief list & detail",
           f"1. Open {B}/app/debriefs.\n2. Open a debrief.\n3. Refresh detail.",
           "1. List loads.\n2. Detail shows scorecard/insights or generating/error.\n3. Persists.",
           "Debriefs list/detail work.",
           priority="P0", severity="Critical", account="HISTORY_USER_01"),
        tc("TC-REP-002", "Reports", "Scorecard page",
           "1. Open scorecard from session/debrief link.\n2. Verify metrics visible.\n3. Share control if present — use invalid/public rules carefully.",
           "1. Scorecard loads.\n2. Metrics shown.\n3. Share behaves safely.",
           "Scorecard renders for completed sessions.",
           priority="P1", severity="Major", account="HISTORY_USER_01"),
        tc("TC-REP-003", "Reports", "Compare Session A vs B",
           "1. If compare UI exists (analytics/compare), select two different sessions.\n2. View delta.\n3. Try same session twice — expect rejection.\n4. Try unscored session.",
           "1. Two sessions selectable.\n2. Comparison metrics/delta shown.\n3. Same-session rejected.\n4. Unscored handled with message.",
           "Session compare validates selections and shows deltas.",
           priority="P1", severity="Major", account="HISTORY_USER_01",
           notes="If compare UI absent, mark Unavailable."),
        tc("TC-REP-004", "Reports", "Export report",
           "1. Use Export if available.\n2. Open downloaded file.\n3. Confirm no secrets embedded.",
           "1. Export starts.\n2. File opens.\n3. Contains expected summary only.",
           "Export produces a usable file without secrets.",
           priority="P2", severity="Minor", account="HISTORY_USER_01"),
        tc("TC-REP-005", "Reports", "Missing data session",
           "1. Open a session with missing transcript if available.\n2. Observe debrief/score behavior.",
           "1. Opens.\n2. Clear missing-data state — not fake scores.",
           "Missing data does not fabricate scores.",
           priority="P1", severity="Major", test_type="Negative", account="HISTORY_USER_01"),
    ]


def analytics_cases() -> list[dict]:
    return [
        tc("TC-AN-001", "Analytics", "Range 7 / 30 / 90 / all",
           f"1. Open {B}/app/analytics.\n2. Switch 7d, 30d, 90d, all-time if offered.\n3. Observe chart updates.",
           "1. Page loads (or flag).\n2. Ranges switch.\n3. Charts/empty update without crash.",
           "Analytics ranges switch correctly.",
           priority="P1", severity="Major", account="HISTORY_USER_01"),
        tc("TC-AN-002", "Analytics", "Empty analytics",
           "1. As FREE_USER_02 open analytics.\n2. Confirm empty state.",
           "1. Opens.\n2. Empty — not error.",
           "Empty analytics is clear.",
           priority="P2", severity="Minor", account="FREE_USER_02"),
        tc("TC-AN-003", "Analytics", "Weak topics / trends widgets",
           "1. With history user, locate weak topics/trends.\n2. Click through if clickable.",
           "1. Widgets show data or empty.\n2. Navigation works; do not validate hidden formulas.",
           "Trend widgets are user-sensible without formula audits.",
           priority="P2", severity="Minor", account="HISTORY_USER_01"),
        tc("TC-AN-004", "Analytics", "Loading / error retry",
           "1. Slow network; reload analytics.\n2. Restore; retry.",
           "1. Loading/error visible.\n2. Recovers.",
           "Analytics handles load errors.",
           priority="P2", severity="Minor", test_type="Negative", account="PRO_USER_01"),
    ]


def billing_cases() -> list[dict]:
    return [
        tc("TC-BILL-001", "Billing", "Billing page loads",
           f"1. Open {B}/app/settings/billing.\n2. Note plan, credits, purchase CTAs.",
           "1. Page loads.\n2. Plan/credits/CTAs visible.",
           "Billing settings page usable.",
           priority="P0", severity="Critical", account="FREE_USER_01"),
        tc("TC-BILL-002", "Billing", "Sandbox purchase start (Razorpay/Stripe test)",
           "1. Click Buy credits / Upgrade using TEST mode only.\n2. Confirm checkout opens sandbox.\n3. Cancel checkout.",
           "1. CTA works.\n2. Sandbox checkout (not live charge).\n3. Cancel returns safely; balance unchanged.",
           "Checkout opens in sandbox and cancel is safe.",
           priority="P0", severity="Critical", account="FREE_USER_01",
           data="Sandbox keys only. Never use real money unless explicitly approved.",
           evidence="Screenshot of sandbox checkout (mask card fields)."),
        tc("TC-BILL-003", "Billing", "Successful test payment → credit grant",
           "1. Note credits.\n2. Complete sandbox payment with test card/UPI as instructed.\n3. Wait for grant (incl. webhook delay).\n4. Refresh billing; confirm increase + history row.",
           "1. Baseline recorded.\n2. Payment success in sandbox.\n3. Grant appears (allow documented delay).\n4. Balance + history updated.",
           "Successful sandbox payment grants credits visibly.",
           priority="P0", severity="Critical", test_type="Persistence", account="FREE_USER_01"),
        tc("TC-BILL-004", "Billing", "Failed payment",
           "1. Use failing test payment method if provided.\n2. Observe UI.\n3. Confirm credits unchanged.",
           "1. Failure path.\n2. Clear failure message.\n3. No credit grant.",
           "Failed payment does not grant credits.",
           priority="P0", severity="Critical", test_type="Negative", account="FREE_USER_01"),
        tc("TC-BILL-005", "Billing", "Duplicate payment attempt",
           "1. Start checkout.\n2. Rapidly re-click Buy.\n3. Complete at most one sandbox payment.\n4. Confirm no double grant for one intent.",
           "1. Checkout.\n2. Double click handled.\n3. Single completion.\n4. Credits match single purchase.",
           "Duplicate payment attempts do not double-grant.",
           priority="P0", severity="Critical", test_type="Negative", account="FREE_USER_01"),
        tc("TC-BILL-006", "Billing", "Purchase history",
           "1. Open purchase/billing history.\n2. Match last sandbox purchase.\n3. Refresh.",
           "1. History visible.\n2. Row matches.\n3. Persists.",
           "Purchase history persists.",
           priority="P1", severity="Major", account="FREE_USER_01"),
        tc("TC-BILL-007", "Billing", "Refund path (if supported in sandbox)",
           "1. If refunds supported in QA, trigger per playbook.\n2. Else mark Requires Configuration / N/A.",
           "1. Refund attempted or N/A.\n2. Balance/history reflect refund or honest N/A.",
           "Refunds verified only when sandbox supports them.",
           priority="P2", severity="Minor", account="ADMIN_USER_01"),
        tc("TC-BILL-008", "Billing", "Plan gate from pricing page",
           f"1. Logged in as FREE_USER_01 open {B}/pricing.\n2. Click Pro CTA.\n3. Land on upgrade/checkout.",
           "1. Pricing loads.\n2. CTA works.\n3. Upgrade path correct.",
           "Pricing CTAs reach upgrade/checkout.",
           priority="P1", severity="Major", account="FREE_USER_01"),
    ]


def credits_cases() -> list[dict]:
    return [
        tc("TC-CR-001", "Credits", "Balance visible",
           f"1. Open {B}/app/usage and billing.\n2. Record displayed balance.",
           "1. Pages load.\n2. Balance visible and consistent across surfaces.",
           "Credit balance is visible and consistent.",
           priority="P0", severity="Critical", account="PRO_USER_01"),
        tc("TC-CR-002", "Credits", "Deduction on AI action",
           "1. Note balance.\n2. Run one credit-consuming AI action (prep/chat/gov generate).\n3. Refresh balance.",
           "1. Baseline.\n2. Action succeeds.\n3. Balance decreases per UI messaging.",
           "Successful AI action deducts credits as shown to user.",
           priority="P0", severity="Critical", account="SUFFICIENT_CREDIT_01"),
        tc("TC-CR-003", "Credits", "Zero credit block",
           "1. As ZERO_CREDIT_01 attempt credit action.\n2. Confirm block + CTA.",
           "1. Attempt.\n2. Blocked with upgrade/buy CTA; no silent success.",
           "Zero credits block consumption cleanly.",
           priority="P0", severity="Critical", test_type="Negative", account="ZERO_CREDIT_01"),
        tc("TC-CR-004", "Credits", "Low credit banner",
           "1. As LOW_CREDIT_01 browse app.\n2. Confirm low-credit banner/warning if product has threshold.",
           "1. Low balance account.\n2. Warning visible or document if not implemented.",
           "Low credit warning appears when applicable.",
           priority="P2", severity="Minor", account="LOW_CREDIT_01"),
        tc("TC-CR-005", "Credits", "Boundary — exact remaining credits",
           "1. Login EXACT_CREDIT_01 (qa.exactcredit@ — not past-due).\n"
           "2. Run one action costing exactly remaining (if shown in UI).\n3. Confirm success then subsequent block.",
           "1. Exact fixture.\n2. Exact spend succeeds if allowed.\n3. Next action blocks at zero.",
           "Exact credit boundary behaves correctly.",
           priority="P1", severity="Major", test_type="Boundary", account="EXACT_CREDIT_01"),
        tc("TC-CR-006", "Credits", "Rate limiting vs credit errors",
           "1. Trigger rapid AI calls.\n2. Distinguish rate-limit message vs insufficient credits.",
           "1. Burst.\n2. Messages are distinct and truthful.",
           "Rate limit is not mislabeled as credit failure.",
           priority="P1", severity="Major", test_type="Negative", account="SUFFICIENT_CREDIT_01"),
    ]


def settings_cases() -> list[dict]:
    tabs = [
        ("TC-SET-001", "profile", "Profile save → refresh"),
        ("TC-SET-002", "appearance", "Appearance save → refresh"),
        ("TC-SET-003", "notifications", "Notification prefs save → refresh"),
        ("TC-SET-004", "audio", "Audio device prefs save → refresh"),
        ("TC-SET-005", "practice-coach", "Practice Coach prefs save → refresh"),
        ("TC-SET-006", "hotkeys", "Hotkeys page loads / reset"),
        ("TC-SET-007", "privacy", "Privacy prefs save → refresh"),
        ("TC-SET-008", "security", "Security / MFA controls visible"),
        ("TC-SET-009", "models", "Models / BYOK page loads"),
        ("TC-SET-010", "integrations", "Integrations list loads"),
        ("TC-SET-011", "data", "Data export control"),
        ("TC-SET-012", "danger", "Danger zone warnings visible"),
        ("TC-SET-013", "polish", "Polish prefs save → refresh"),
        ("TC-SET-014", "billing", "Billing tab reachable from settings"),
    ]
    out = []
    for tid, slug, feature in tabs:
        out.append(
            tc(
                tid, "Settings", feature,
                f"1. Open {B}/app/settings/{slug}.\n"
                f"2. Change a safe non-destructive setting if editable.\n"
                f"3. Save.\n"
                f"4. Refresh and verify persistence.\n"
                f"5. For danger/export: do NOT delete account unless on disposable NEW_USER.",
                "1. Page loads.\n2. Controls editable or clearly read-only.\n3. Save succeeds or validates.\n"
                "4. Values persist.\n5. Destructive actions require confirm.",
                f"Settings/{slug} works with save→refresh persistence where editable.",
                priority="P0" if slug in ("profile", "billing", "security", "danger") else "P1",
                severity="Critical" if slug in ("profile", "billing", "security") else "Major",
                test_type="Persistence",
                account="PRO_USER_01",
                sub=slug,
            )
        )
    out.append(
        tc(
            "TC-SET-015", "Settings", "Account deletion (disposable only)",
            "1. Using disposable NEW_USER only, open Danger zone.\n"
            "2. Read warnings.\n"
            "3. Complete deletion if approved in this run.\n"
            "4. Confirm login fails afterward.",
            "1. Danger page.\n2. Strong confirmations.\n3. Account deleted.\n4. Cannot login.",
            "Account deletion works on disposable accounts only.",
            priority="P1", severity="Critical", account="NEW_USER_01",
            notes="Skip if not authorized this cycle — mark Blocked.",
        )
    )
    return out


def notifications_cases() -> list[dict]:
    return [
        tc("TC-NTF-001", "Notifications", "List read/unread",
           f"1. Open {B}/app/notifications.\n2. Mark read if control exists.\n3. Refresh.",
           "1. List/empty.\n2. Read state updates.\n3. Persists.",
           "Notification read state persists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-NTF-002", "Notifications", "Filters",
           "1. Apply unread/all filters if present.\n2. Confirm list changes.",
           "1. Filters work.\n2. Results match filter.",
           "Notification filters work.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
        tc("TC-NTF-003", "Notifications", "Browser permission",
           "1. Trigger browser notification permission if prompted.\n2. Allow/deny.\n3. Confirm app still usable.",
           "1. Prompt or settings path.\n2. Choice respected.\n3. No broken UI.",
           "Browser notification permission handled safely.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
        tc("TC-NTF-004", "Notifications", "Preferences linkage",
           "1. Disable a notification type in Settings.\n2. Trigger related event if possible.\n3. Confirm preference honored or document limits.",
           "1. Pref changed.\n2. Event.\n3. Preference effect observed or Not verifiable noted.",
           "Notification preferences take effect where testable.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
    ]


def integrations_cases() -> list[dict]:
    return [
        tc("TC-INT-001", "Integrations", "List visible integrations",
           f"1. Open {B}/app/settings/integrations.\n2. Inventory each card (Google Calendar, etc.).\n3. Classify configured vs not.",
           "1. Page loads.\n2. Cards listed.\n3. Status honest.",
           "Integrations inventory completed from UI.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-INT-002", "Integrations", "Connect success path",
           "1. For an available integration, Connect.\n2. Complete OAuth with approved test identity.\n3. Confirm Connected status after return.",
           "1. Connect starts.\n2. OAuth completes.\n3. Connected — not merely dialog opened.",
           "Connect results in Connected state.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-INT-003", "Integrations", "Connect failure / deny",
           "1. Start Connect.\n2. Deny permissions on provider.\n3. Observe app message.",
           "1. Connect.\n2. Denied.\n3. Clear failure; app stable; not falsely Connected.",
           "Denied OAuth does not mark Connected.",
           priority="P1", severity="Major", test_type="Negative", account="PRO_USER_01"),
        tc("TC-INT-004", "Integrations", "Disconnect",
           "1. Disconnect a connected integration.\n2. Refresh.\n3. Confirm disconnected.",
           "1. Disconnect.\n2. Refresh.\n3. Status disconnected.",
           "Disconnect persists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-INT-005", "Integrations", "Not configured provider",
           "1. If Connect fails with configuration error, capture message.\n2. Mark Requires Configuration — not Pass.",
           "1. Error visible.\n2. Classification Requires Configuration.",
           "Missing provider config classified correctly.",
           priority="P1", severity="Major", account="PRO_USER_01"),
    ]


def learning_cases() -> list[dict]:
    return [
        tc("TC-LRN-001", "Learning Hub", "Courses list",
           f"1. Open {B}/app/learn.\n2. If no courses, record CONTENT_NOT_AVAILABLE (not auto-defect).\n3. Open a course if present.",
           "1. Hub loads.\n2. Empty content noted OR courses listed.\n3. Course detail opens.",
           "Learning Hub loads; empty content classified CONTENT_NOT_AVAILABLE.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-LRN-002", "Learning Hub", "Lesson progress",
           "1. Open a lesson.\n2. Complete/continue.\n3. Refresh; confirm progress retained.",
           "1. Player works.\n2. Progress updates.\n3. Persists — or CONTENT_NOT_AVAILABLE.",
           "Lesson progress persists when content exists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-LRN-003", "Learning Hub", "Certificate",
           "1. If completion yields certificate, open verify link.\n2. Else N/A.",
           "1. Certificate shown or N/A.\n2. Public verify works for valid id; invalid safe.",
           "Certificates work when content completion exists.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
    ]


def community_cases() -> list[dict]:
    return [
        tc("TC-COM-001", "Community", "List posts",
           f"1. Open {B}/app/community.\n2. Observe list/empty.",
           "1. Loads.\n2. Posts or empty — empty not defect unless content required.",
           "Community list loads.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-COM-002", "Community", "Create post",
           "1. Create a post with title/body.\n2. Submit.\n3. Refresh; reopen.",
           "1. Composer works.\n2. Posted.\n3. Persists.",
           "Create post persists.",
           priority="P1", severity="Major", test_type="Persistence", account="PRO_USER_01"),
        tc("TC-COM-003", "Community", "Reply / report",
           "1. Reply if supported.\n2. Report if supported.\n3. Unauthorized actions as Free if gated.",
           "1. Reply works or N/A.\n2. Report works or N/A.\n3. Gates clear.",
           "Reply/report flows work or are classified N/A.",
           priority="P2", severity="Minor", account="PRO_USER_01"),
        tc("TC-COM-004", "Community", "Moderation (admin)",
           "1. As ADMIN hide/restore a test post if controls exist.\n2. As user confirm visibility change.",
           "1. Moderation action succeeds.\n2. User sees updated visibility.",
           "Admin moderation affects user-visible community content.",
           priority="P1", severity="Major", account="ADMIN_USER_01", role="admin"),
    ]


def coding_lab_cases() -> list[dict]:
    return [
        tc("TC-COD-001", "Coding Lab", "Question list & open",
           f"1. Open {B}/app/coding.\n2. Open a question (or CONTENT_NOT_AVAILABLE).",
           "1. Lab loads.\n2. Editor opens or empty content noted.",
           "Coding Lab reachable.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-COD-002", "Coding Lab", "Execute valid code",
           "1. Select supported language.\n2. Write trivial valid solution/stub per problem.\n3. Run/Execute.",
           "1. Language selectable.\n2. Code entered.\n3. Output/error panel shows real result — not stuck Running.",
           "Code execution returns observable output.",
           priority="P0", severity="Critical", account="PRO_USER_01"),
        tc("TC-COD-003", "Coding Lab", "Invalid code / timeout",
           "1. Submit syntax-invalid code.\n2. Submit infinite-loop style if safe harness exists OR long sleep.\n3. Observe errors/timeout.",
           "1. Clear compile/runtime error.\n2. Timeout message.\n3. Editor remains usable.",
           "Invalid code and timeouts fail gracefully.",
           priority="P1", severity="Major", test_type="Negative", account="PRO_USER_01"),
        tc("TC-COD-004", "Coding Lab", "Submit / score / reset",
           "1. Submit.\n2. View score/result.\n3. Reset editor.\n4. Resubmit.",
           "1. Submit works.\n2. Result shown.\n3. Reset clears.\n4. Resubmit allowed per rules.",
           "Submit/score/reset lifecycle works.",
           priority="P1", severity="Major", account="PRO_USER_01"),
        tc("TC-COD-005", "Coding Lab", "Unsupported language",
           "1. If language dropdown limited, attempt unsupported via UI only.\n2. Observe message.",
           "1. Only supported langs or clear error.\n2. No silent failure.",
           "Unsupported languages handled clearly.",
           priority="P2", severity="Minor", test_type="Negative", account="PRO_USER_01"),
    ]


def admin_cases() -> list[dict]:
    pages = [
        ("TC-ADM-001", "dashboard", "/app/admin", "Admin dashboard KPIs load"),
        ("TC-ADM-002", "users", "/app/admin/users", "Users table loads; search works"),
        ("TC-ADM-003", "analytics", "/app/admin/analytics", "Admin analytics loads"),
        ("TC-ADM-004", "revenue", "/app/admin/revenue", "Revenue page loads"),
        ("TC-ADM-005", "model-costs", "/app/admin/model-costs", "Model costs load"),
        ("TC-ADM-006", "ai-hub", "/app/admin/ai-hub", "AI Hub loads"),
        ("TC-ADM-007", "feature-flags", "/app/admin/feature-flags", "Flags list/toggle UI present"),
        ("TC-ADM-008", "seed-questions", "/app/admin/seed-questions", "Seed questions UI loads"),
        ("TC-ADM-009", "bulk-upload", "/app/admin/bulk-upload", "Bulk upload UI loads"),
        ("TC-ADM-010", "live-chat", "/app/admin/live-chat", "Live chat/support inbox loads"),
        ("TC-ADM-011", "questions", "/app/admin/questions", "Question editor loads"),
        ("TC-ADM-012", "audit-log", "/app/admin/audit-log", "Audit log loads"),
        ("TC-ADM-013", "diagnostics", "/app/admin/diagnostics", "Diagnostics loads"),
        ("TC-ADM-014", "blog", "/app/admin/blog", "Blog CMS loads"),
        ("TC-ADM-015", "help-articles", "/app/admin/help-articles", "Help CMS loads"),
        ("TC-ADM-016", "support", "/app/admin/support", "Support page loads"),
        ("TC-ADM-017", "promo-codes", "/app/admin/promo-codes", "Promo codes UI loads"),
        ("TC-ADM-018", "billing-settings", "/app/admin/billing-settings", "Billing settings load"),
        ("TC-ADM-019", "gov-sources", "/app/admin/gov/sources", "Gov sources load"),
        ("TC-ADM-020", "gov-ingest", "/app/admin/gov/ingest", "Gov ingest load"),
        ("TC-ADM-021", "gov-exams", "/app/admin/gov/exams", "Exam registry loads"),
        ("TC-ADM-022", "gov-q-review", "/app/admin/gov/question-review", "Question review loads"),
        ("TC-ADM-023", "gov-paper-review", "/app/admin/gov/paper-review", "Paper review loads"),
        ("TC-ADM-024", "gov-translations", "/app/admin/gov/translations", "Translations review loads"),
        ("TC-ADM-025", "community", "/app/admin/community", "Community admin loads"),
        ("TC-ADM-026", "learning", "/app/admin/learning", "Learning admin loads"),
    ]
    out = []
    for tid, sub, path, final in pages:
        out.append(
            tc(
                tid, "Admin Portal", sub,
                f"1. Login ADMIN_USER_01.\n2. Open {B}{path}.\n"
                f"3. Perform one safe read interaction (search/filter/open row).\n"
                f"4. For write UIs, make a reversible test change OR stop at confirming controls enable.\n"
                f"5. Classify Fully/Partial/Blocked.",
                "1. Admin auth works.\n2. Page loads without 403.\n3. Data/controls visible or honest empty.\n"
                "4. Writes only if safe.\n5. Classification recorded.",
                final,
                priority="P0" if sub in ("dashboard", "users", "feature-flags") else "P1",
                severity="Critical" if sub in ("dashboard", "users") else "Major",
                account="ADMIN_USER_01", role="admin", sub=sub,
            )
        )
    out += [
        tc("TC-ADM-027", "Admin Portal", "Non-admin blocked from Admin URL",
           f"1. Login FREE_USER_01.\n2. Open {B}/app/admin.\n3. Open {B}/app/admin/users.",
           "1. Free user.\n2. Redirect/denied — no admin data.\n3. Denied — no user PII table.",
           "Non-admin cannot access Admin portal.",
           priority="P0", severity="Critical", test_type="Security", account="FREE_USER_01"),
        tc("TC-ADM-028", "Admin Portal", "Feature flag toggle visible effect",
           "1. As admin, note a non-destructive flag state.\n2. Toggle only if QA playbook allows.\n3. As user verify UI change.\n4. Revert flag.",
           "1. Flag visible.\n2. Toggle works.\n3. User effect observed.\n4. Reverted.",
           "Feature flags change user-visible behavior when toggled.",
           priority="P0", severity="Critical", account="ADMIN_USER_01", role="admin",
           notes="Only toggle flags listed as safe in QA playbook."),
    ]
    return out


def security_cases() -> list[dict]:
    return [
        tc("TC-SEC-001", "Security", "Logged-out protected route",
           f"1. Logout.\n2. Open {B}/app/dashboard.\n3. Open {B}/app/sessions.",
           "1. Logged out.\n2. Redirect login.\n3. Redirect login — no data flash.",
           "Protected routes require authentication.",
           priority="P0", severity="Critical", test_type="Security", account="GUEST", user_type="Guest", role="guest"),
        tc("TC-SEC-002", "Security", "Free user paid feature gate",
           "1. As FREE_USER_01 attempt a known Pro-only action (gov AI fill / premium prep if gated).\n2. Observe upgrade prompt.",
           "1. Attempt.\n2. Gated — no silent Pro access.",
           "Plan gates enforce paid features.",
           priority="P0", severity="Critical", test_type="Security", account="FREE_USER_01"),
        tc("TC-SEC-003", "Security", "IDOR via URL id change",
           "1. As USER_A open own session/doc URL; note id.\n2. Modify id guessing another value.\n3. Confirm not found/denied — no other user data.",
           "1. Own resource.\n2. Mutated id.\n3. Safe error; no foreign data.",
           "URL id tampering does not expose others' data.",
           priority="P0", severity="Critical", test_type="Security", account="USER_A_01"),
        tc("TC-SEC-004", "Security", "Browser back after logout",
           "1. Visit sensitive page.\n2. Logout.\n3. Browser Back repeatedly.",
           "1. Sensitive visible.\n2. Logged out.\n3. No sensitive content usable from bfcache; re-auth required.",
           "Back after logout does not restore private UI access.",
           priority="P0", severity="Critical", test_type="Security", account="PRO_USER_01"),
        tc("TC-SEC-005", "Security", "Hidden disabled controls not bypassable",
           "1. Find a disabled Pro CTA as Free user.\n2. Do not use DevTools to force-enable for Pass criteria; instead paste target URL directly.\n3. Confirm server/UI still gates.",
           "1. Disabled control.\n2. Direct URL attempt.\n3. Still blocked.",
           "UI disable is backed by real access control.",
           priority="P0", severity="Critical", test_type="Security", account="FREE_USER_01"),
        tc("TC-SEC-006", "Security", "Admin privilege via UI only",
           "1. As Free user, search UI for Admin links.\n2. Confirm absent or denied.\n3. Paste admin paths.",
           "1. No admin chrome.\n2. Denied.\n3. Denied.",
           "No privilege escalation via normal UI.",
           priority="P0", severity="Critical", test_type="Security", account="FREE_USER_01"),
    ]


def accessibility_cases() -> list[dict]:
    return [
        tc("TC-A11Y-001", "Accessibility", "Keyboard login",
           f"1. Open {B}/login.\n2. Tab through fields.\n3. Submit with Enter.\n4. Confirm visible focus styles.",
           "1. Page.\n2. Logical tab order.\n3. Submit works.\n4. Focus visible.",
           "Login is keyboard operable.",
           priority="P1", severity="Major", test_type="Accessibility", account="GUEST", user_type="Guest", role="guest"),
        tc("TC-A11Y-002", "Accessibility", "Modal Escape / focus trap",
           "1. Open a modal (upgrade, confirm, settings).\n2. Press Escape.\n3. Tab within modal before close.",
           "1. Modal open.\n2. Escape closes.\n3. Focus managed reasonably.",
           "Modals support Escape and focus handling.",
           priority="P1", severity="Major", test_type="Accessibility", account="PRO_USER_01"),
        tc("TC-A11Y-003", "Accessibility", "Forms labels & errors",
           "1. On signup/settings, trigger validation errors.\n2. Confirm errors announced/associated with fields.\n3. Required fields indicated.",
           "1. Errors shown.\n2. Field association clear.\n3. Required indicated beyond color alone.",
           "Form errors are accessible.",
           priority="P1", severity="Major", test_type="Accessibility", account="FREE_USER_01"),
        tc("TC-A11Y-004", "Accessibility", "Status not by color alone",
           "1. Find status chips (session/gov answers).\n2. Confirm text/icon accompanies color.",
           "1. Status found.\n2. Meaning clear without color.",
           "Status is not color-only.",
           priority="P2", severity="Minor", test_type="Accessibility", account="PRO_USER_01"),
        tc("TC-A11Y-005", "Accessibility", "Skip/nav landmarks on dashboard",
           "1. Keyboard navigate sidebar and main.\n2. Confirm focus not lost.\n3. Screenshot focus rings if failing.",
           "1. Nav operable.\n2. Focus remains visible.\n3. Failures evidenced.",
           "Primary app chrome is keyboard navigable.",
           priority="P1", severity="Major", test_type="Accessibility", account="PRO_USER_01"),
    ]


def responsive_cases() -> list[dict]:
    viewports = [
        ("TC-RSP-001", "360x800", "Mobile"),
        ("TC-RSP-002", "375x812", "Mobile"),
        ("TC-RSP-003", "414x896", "Mobile"),
        ("TC-RSP-004", "768x1024", "Tablet"),
        ("TC-RSP-005", "1366x768", "Desktop"),
        ("TC-RSP-006", "1440x900", "Desktop"),
        ("TC-RSP-007", "1920x1080", "Desktop"),
    ]
    out = []
    for tid, vp, kind in viewports:
        out.append(
            tc(
                tid, "Responsive / Cross-Browser", f"Layout @ {vp}",
                f"1. Set viewport to {vp} ({kind}) in DevTools or device.\n"
                f"2. Visit landing, login, dashboard, gov exam hub, settings billing.\n"
                f"3. Check horizontal scroll, clipped CTAs, nav/sidebar/bottom nav, modals, forms.\n"
                f"4. Open one modal and one dropdown.",
                "1. Viewport set.\n2. Pages load.\n3. No blocking overflow; primary actions reachable.\n4. Overlay UI usable.",
                f"Core flows usable at {vp} without critical layout breakage.",
                priority="P1", severity="Major", test_type="Responsive", account="PRO_USER_01",
                data=f"Viewport {vp}",
            )
        )
    browsers = ["Chrome", "Edge", "Firefox", "Safari"]
    for i, br in enumerate(browsers, 1):
        out.append(
            tc(
                f"TC-BR-{i:03d}", "Responsive / Cross-Browser", f"{br} smoke",
                f"1. On {br} (latest available), login PRO_USER_01.\n"
                f"2. Dashboard → Practice Coach setup page → Documents upload UI → Gov hub → Billing.\n"
                f"3. Note audio permission differences.\n"
                f"4. If Safari unavailable on machine, mark Blocked by Environment.",
                "1. Login works.\n2. Modules load.\n3. Differences documented.\n4. Honest Blocked if unavailable.",
                f"Critical smoke passes on {br} or environment limitation recorded.",
                priority="P1", severity="Major", test_type="Cross-Browser", account="PRO_USER_01",
                data=f"Browser={br}",
            )
        )
    return out


def api_network_cases() -> list[dict]:
    return [
        tc("TC-API-001", "API / Network Observation", "Login network success",
           "1. Open DevTools Network.\n2. Login.\n3. Note auth-related requests status codes.",
           "1. Network open.\n2. Login.\n3. Success statuses; failures captured with URL/method/status (no tokens copied).",
           "Login network evidence captured without secrets.",
           priority="P1", severity="Major", test_type="API Observation", account="FREE_USER_01"),
        tc("TC-API-002", "API / Network Observation", "401/403 on protected API when logged out",
           "1. Logout.\n2. Trigger an in-app action that calls API if possible, or open protected page.\n3. Observe 401/403 in Network if requests fire.",
           "1. Logged out.\n2. Action/page.\n3. Auth errors; UI handles safely.",
           "Unauthenticated API calls fail closed.",
           priority="P0", severity="Critical", test_type="API Observation", account="GUEST", user_type="Guest", role="guest"),
        tc("TC-API-003", "API / Network Observation", "500/502/503 user-visible",
           "1. During induced outage window, perform AI/generate action.\n2. Capture status + UI message.\n3. Confirm retry path.",
           "1. Outage.\n2. 5xx evidenced; UI error.\n3. Retry or safe abort.",
           "Server errors surface clearly to users.",
           priority="P0", severity="Critical", test_type="API Observation", account="PRO_USER_01"),
        tc("TC-API-004", "API / Network Observation", "429 rate limit",
           "1. Burst AI requests.\n2. Capture any 429.\n3. Confirm UI message.",
           "1. Burst.\n2. 429 or throttle.\n3. User-visible handling.",
           "429 handled without crash.",
           priority="P1", severity="Major", test_type="API Observation", account="SUFFICIENT_CREDIT_01"),
        tc("TC-API-005", "API / Network Observation", "Duplicate POST / infinite polling",
           "1. Watch Network while generating gov paper / starting session.\n2. Flag duplicate identical POSTs or unbounded polling.",
           "1. Watch.\n2. Abnormal patterns recorded with evidence for defects.",
           "No pathological duplicate POST or infinite polling in critical flows.",
           priority="P1", severity="Major", test_type="API Observation", account="SUFFICIENT_CREDIT_01"),
        tc("TC-API-006", "API / Network Observation", "CORS failure visibility",
           "1. If CORS errors appear in Console during normal use, screenshot.\n2. Confirm user sees failure not silent hang.",
           "1. CORS observed or none.\n2. User-visible degradation if CORS breaks a feature.",
           "CORS failures are detectable and user-impacting features don't hang silently.",
           priority="P1", severity="Major", test_type="API Observation", account="PRO_USER_01"),
    ]


def ai_fallback_cases() -> list[dict]:
    return [
        tc("TC-FB-001", "AI / Fallback", "Prep STAR when AI down",
           "1. AI-down window.\n2. Generate STAR.\n3. Observe fallback/error ≤ timeout.",
           "1. Down.\n2. Attempt.\n3. Fallback or clear failure; not endless.",
           "STAR falls back or fails honestly.",
           priority="P0", severity="Critical", test_type="Negative", account="SUFFICIENT_CREDIT_01"),
        tc("TC-FB-002", "AI / Fallback", "Gov generate when AI down",
           "1. AI-down window.\n2. Generate paper.\n3. Expect deterministic/Python fallback paper OR clear failure.\n4. No false credit error.",
           "1. Down.\n2. Generate.\n3. Paper or failure.\n4. Credits truthful.",
           "Gov generation fallback works from user perspective.",
           priority="P0", severity="Critical", test_type="Negative", account="SUFFICIENT_CREDIT_01"),
        tc("TC-FB-003", "AI / Fallback", "Chat when AI down",
           "1. AI-down.\n2. Send chat.\n3. Error/fallback.",
           "1. Down.\n2. Send.\n3. Clear outcome.",
           "Chat fallback/error is clear.",
           priority="P0", severity="Critical", test_type="Negative", account="SUFFICIENT_CREDIT_01"),
        tc("TC-FB-004", "AI / Fallback", "Document parse when AI down",
           "1. AI-down.\n2. Upload resume.\n3. Observe deterministic parse/OCR fallback or error — not infinite Processing.",
           "1. Down.\n2. Upload.\n3. Completes via fallback or fails clearly.",
           "Document parse fallback bounded and honest.",
           priority="P1", severity="Major", test_type="Negative", account="PRO_USER_01"),
        tc("TC-FB-005", "AI / Fallback", "Provider failure ≠ credit failure",
           "1. With sufficient credits, induce provider failure.\n2. Compare message to zero-credit message.",
           "1. Credits remain.\n2. Messages distinct; no false insufficient credits.",
           "Provider failures are not mislabeled as credit errors.",
           priority="P0", severity="Critical", test_type="Negative", account="SUFFICIENT_CREDIT_01"),
    ]


def regression_cases() -> list[dict]:
    items = [
        ("TC-REG-001", "Authentication login/logout", "Re-run TC-AUTH-001 and TC-AUTH-011"),
        ("TC-REG-002", "Admin authorization", "Re-run TC-ADM-027"),
        ("TC-REG-003", "Gov exam search", "Re-run TC-GOV-002"),
        ("TC-REG-004", "Gov exam generation", "Re-run TC-GOV-007"),
        ("TC-REG-005", "Credits deduction/grant", "Re-run TC-CR-002 and TC-BILL-003"),
        ("TC-REG-006", "Duplicate charges", "Re-run TC-BILL-005"),
        ("TC-REG-007", "Gov submission", "Re-run TC-GOV-018"),
        ("TC-REG-008", "Session restore", "Re-run TC-PC-011"),
        ("TC-REG-009", "Mock Next question", "Re-run TC-MOCK-003"),
        ("TC-REG-010", "Practice Coach core", "Re-run TC-PC-003 and TC-PC-010"),
        ("TC-REG-011", "AI fallback", "Re-run TC-FB-002"),
        ("TC-REG-012", "Document parsing", "Re-run TC-DOC-001"),
        ("TC-REG-013", "Billing sandbox", "Re-run TC-BILL-002"),
        ("TC-REG-014", "Feature flags", "Re-run TC-ADM-028"),
        ("TC-REG-015", "RLS/ownership", "Re-run TC-SEC-003 and TC-GOV-025"),
    ]
    out = []
    for tid, feature, pointer in items:
        out.append(
            tc(
                tid, "Regression", feature,
                f"1. {pointer}.\n2. Execute full steps from the referenced case on current build.\n3. Compare to prior fix notes.",
                "1. Case located.\n2. Executed.\n3. Still Pass — Fail if regression.",
                f"Regression check for {feature} remains Pass.",
                priority="P0", severity="Critical", test_type="Regression", account="PRO_USER_01",
            )
        )
    return out


def journey_cases() -> list[dict]:
    return [
        tc("TC-JRN-001", "Cross-Module Journeys", "Journey 1 — Signup to reports",
           "1. Signup new user.\n2. Verify email.\n3. Complete onboarding.\n4. Open dashboard.\n5. Start Practice Coach; answer briefly.\n6. End session.\n7. Open reports/debrief/sessions.",
           "1. Signup ok.\n2. Verified.\n3. Onboarded.\n4. Dashboard.\n5. Session works.\n6. Ended.\n7. History/report visible.",
           "New user journey from signup through first practice to reports succeeds.",
           priority="P0", severity="Critical", test_type="E2E Journey", account="NEW_USER_01"),
        tc("TC-JRN-002", "Cross-Module Journeys", "Journey 2 — Resume to Practice Coach",
           "1. Upload resume.\n2. Wait parse ready.\n3. Select resume in Practice Coach setup.\n4. Use AI Help.\n5. End & open reports.",
           "1. Uploaded.\n2. Parsed.\n3. Selected.\n4. AI help real/error honest.\n5. Report exists.",
           "Resume → Coach → AI Help → reports journey works.",
           priority="P0", severity="Critical", test_type="E2E Journey", account="SUFFICIENT_CREDIT_01"),
        tc("TC-JRN-003", "Cross-Module Journeys", "Journey 3 — Gov exam full lifecycle",
           "1. Search exam.\n2. Select.\n3. Configure.\n4. Check availability.\n5. Generate.\n6. Attempt & answer.\n7. Submit.\n8. Result.\n9. History.",
           "1-9 each step succeeds with observable outcomes; generation not infinite; result persists.",
           "Gov exam search→generate→attempt→result→history succeeds.",
           priority="P0", severity="Critical", test_type="E2E Journey", account="SUFFICIENT_CREDIT_01"),
        tc("TC-JRN-004", "Cross-Module Journeys", "Journey 4 — Purchase credits and consume",
           "1. Note balance.\n2. Sandbox purchase.\n3. Confirm grant.\n4. Consume via AI action.\n5. Confirm new balance.",
           "1. Baseline.\n2. Paid in sandbox.\n3. Granted.\n4. Consumed.\n5. Balance coherent.",
           "Purchase → grant → consume balance journey works.",
           priority="P0", severity="Critical", test_type="E2E Journey", account="FREE_USER_01"),
        tc("TC-JRN-005", "Cross-Module Journeys", "Journey 5 — Admin content to user consume",
           "1. As ADMIN create/publish a safe help article or community/learning item if CMS allows.\n2. As PRO user open/consume it.\n3. Revert/cleanup if needed.",
           "1. Admin publish works.\n2. User sees content.\n3. Cleanup ok.",
           "Admin-created content is consumable by normal users.",
           priority="P1", severity="Major", test_type="E2E Journey", account="ADMIN_USER_01", role="admin"),
    ]
