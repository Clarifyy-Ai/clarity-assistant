"""Black-box atomic test cases — Part A: Public, Auth, Onboarding, Dashboard, Module index."""
from __future__ import annotations

from .common import SITE, tc

B = SITE


def public_cases() -> list[dict]:
    pages = [
        ("TC-PUB-001", "Landing", "/", "Landing loads with brand, headline, primary CTA"),
        ("TC-PUB-002", "Pricing", "/pricing", "Pricing plans and CTAs visible"),
        ("TC-PUB-003", "Gov Exams marketing", "/gov-exams", "Gov exam marketing content loads"),
        ("TC-PUB-004", "Help", "/help", "Help center lists articles or empty-state"),
        ("TC-PUB-005", "Shortcuts", "/shortcuts", "Shortcuts page loads"),
        ("TC-PUB-006", "Blog", "/blog", "Blog list loads"),
        ("TC-PUB-007", "Terms", "/terms", "Terms content loads"),
        ("TC-PUB-008", "Privacy", "/privacy", "Privacy content loads"),
    ]
    out = []
    for tid, name, path, final in pages:
        out.append(
            tc(
                tid, "Public Pages", name,
                f"1. Open {B}{path} in a logged-out Incognito window.\n"
                f"2. Wait for page load (max 15s).\n"
                f"3. Scroll full page; click primary nav/footer links that stay on-site.\n"
                f"4. Note any console red errors (ignore 3rd-party noise).",
                f"1. URL is {B}{path} (or intentional redirect).\n"
                f"2. Page content renders; no infinite spinner/blank screen.\n"
                f"3. Links navigate correctly; no broken chrome.\n"
                f"4. No app-breaking console errors.",
                final,
                sub="Marketing",
                priority="P0" if path == "/" else "P1",
                severity="Critical" if path == "/" else "Major",
                user_type="Guest",
                role="guest",
                account="GUEST",
                pre="Logged out. Incognito. No extensions blocking scripts.",
                data=f"URL={B}{path}",
                evidence="Full-page screenshot + address bar.",
            )
        )
    out += [
        tc(
            "TC-PUB-009", "Public Pages", "Help article deep link",
            f"1. Open {B}/help and click the first available article (or open a known slug).\n"
            "2. Verify title, body, and back/nav.\n"
            "3. Refresh the article URL.",
            "1. Article opens.\n2. Content readable; nav works.\n3. Same article still loads after refresh.",
            "Help article deep links work and persist on refresh.",
            sub="Help", priority="P2", severity="Minor", user_type="Guest", role="guest", account="GUEST",
        ),
        tc(
            "TC-PUB-010", "Public Pages", "Blog post deep link",
            f"1. Open {B}/blog; open first post if any.\n"
            "2. If empty, record CONTENT_NOT_AVAILABLE (not a defect unless content is required).\n"
            "3. Refresh post URL if opened.",
            "1. Post opens or empty state is clear.\n2. Empty ≠ crash.\n3. Refresh keeps content.",
            "Blog post loads or honest empty state.",
            sub="Blog", priority="P2", severity="Minor", user_type="Guest", role="guest", account="GUEST",
        ),
        tc(
            "TC-PUB-011", "Public Pages", "Certificate verification — invalid ID",
            f"1. Open {B}/verify-certificate/invalid-test-id-000.\n"
            "2. Observe message.",
            "1. Page loads without crash.\n2. Clear invalid/not-found message; no other users' data shown.",
            "Invalid certificate ID fails safely with no data leak.",
            sub="Certificates", priority="P1", severity="Major", test_type="Negative",
            user_type="Guest", role="guest", account="GUEST",
        ),
        tc(
            "TC-PUB-012", "Public Pages", "Shared debrief — invalid token",
            f"1. Open {B}/share/not-a-real-token.\n"
            "2. Observe UI.",
            "1. Safe error or not-found.\n2. No private debrief content exposed.",
            "Invalid share token does not leak session content.",
            sub="Sharing", priority="P1", severity="Major", test_type="Security",
            user_type="Guest", role="guest", account="GUEST",
        ),
        tc(
            "TC-PUB-013", "Public Pages", "Public CTA to Signup/Login",
            f"1. From landing, click primary Sign up / Get started CTA.\n"
            f"2. From pricing, click a plan CTA.\n"
            f"3. Use Login link from signup.",
            "1. Navigates to /signup.\n2. Navigates to signup/checkout/login as designed.\n3. Login page loads.",
            "Public CTAs reach correct auth entry points.",
            sub="CTAs", priority="P0", severity="Critical", user_type="Guest", role="guest", account="GUEST",
        ),
        tc(
            "TC-PUB-014", "Public Pages", "Missing marketing routes (About/Contact/etc.)",
            "1. From landing & footer, look for About, Contact, Careers, Features, Industries, Cookies, FAQ.\n"
            "2. For each missing route, record Unavailable.\n"
            "3. For each present link, open and verify load.",
            "1. Inventory updated honestly.\n2. Missing ≠ Fail unless product promises the page.\n3. Present pages load.",
            "Public route inventory complete; no false 'working' claims.",
            sub="Inventory", priority="P3", severity="Cosmetic", user_type="Guest", role="guest", account="GUEST",
            notes="Mark Application Inventory accordingly.",
        ),
        tc(
            "TC-PUB-015", "Public Pages", "404 / unknown public path",
            f"1. Open {B}/this-page-does-not-exist-qa.\n"
            "2. Observe not-found UI and navigation home.",
            "1. Friendly 404 (not blank/crash).\n2. User can navigate back to a valid page.",
            "Unknown routes show safe 404.",
            sub="Errors", priority="P2", severity="Minor", test_type="Negative",
            user_type="Guest", role="guest", account="GUEST",
        ),
    ]
    return out


def auth_cases() -> list[dict]:
    return [
        tc(
            "TC-AUTH-001", "Authentication", "Valid login",
            f"1. Open {B}/login.\n"
            "2. Enter FREE_USER_01 email + password from credential store.\n"
            "3. Submit Login.\n"
            "4. Observe landing destination.",
            "1. Login form visible.\n2. Fields accept input; password masked.\n"
            "3. No unexplained error.\n4. Lands on dashboard or onboarding as appropriate.",
            "Valid credentials sign the user in and reach the correct post-login page.",
            priority="P0", severity="Critical", account="FREE_USER_01",
            pre="Logged out. Valid FREE_USER_01 credentials available.",
            data="Email/password from credential store only (do not write password in Actual Result).",
        ),
        tc(
            "TC-AUTH-002", "Authentication", "Invalid password",
            f"1. Open {B}/login.\n"
            "2. Enter FREE_USER_01 email with wrong password.\n"
            "3. Submit.",
            "1. Form loads.\n2. Input accepted.\n3. Clear error; user not signed in; no stack trace.",
            "Invalid password is rejected with a safe user-visible error.",
            priority="P0", severity="Critical", test_type="Negative", account="FREE_USER_01",
        ),
        tc(
            "TC-AUTH-003", "Authentication", "Invalid email format",
            f"1. Open {B}/login.\n"
            "2. Enter 'not-an-email' and any password.\n"
            "3. Submit.",
            "1. Form loads.\n2. Client validation or server error.\n3. Not signed in.",
            "Malformed email blocked with clear feedback.",
            priority="P1", severity="Major", test_type="Negative", account="GUEST", user_type="Guest", role="guest",
        ),
        tc(
            "TC-AUTH-004", "Authentication", "Empty required fields",
            f"1. Open {B}/login.\n"
            "2. Leave email and password empty.\n"
            "3. Click Login.",
            "1. Form loads.\n2. Empty fields.\n3. Inline validation; no request storm; not signed in.",
            "Empty login fields show required-field validation.",
            priority="P1", severity="Major", test_type="Negative", account="GUEST", user_type="Guest", role="guest",
        ),
        tc(
            "TC-AUTH-005", "Authentication", "Password visibility toggle",
            f"1. Open {B}/login.\n"
            "2. Type a password.\n"
            "3. Toggle show/hide if control exists.",
            "1. Form loads.\n2. Password masked by default.\n3. Toggle reveals/hides; does not clear value unexpectedly.",
            "Password visibility control works if present.",
            priority="P3", severity="Minor", account="GUEST", user_type="Guest", role="guest",
        ),
        tc(
            "TC-AUTH-006", "Authentication", "Signup happy path",
            f"1. Open {B}/signup.\n"
            "2. Register with a new approved disposable email.\n"
            "3. Submit.\n"
            "4. Observe next screen (verify email / onboarding).",
            "1. Signup form loads.\n2. Validation passes for valid data.\n"
            "3. Success path (no silent fail).\n4. User directed to verification or next step.",
            "New user can register and reach verification/onboarding.",
            priority="P0", severity="Critical", account="NEW_USER_01", user_type="Guest", role="guest",
            data="Fresh disposable email + strong password from QA playbook.",
        ),
        tc(
            "TC-AUTH-007", "Authentication", "Duplicate signup",
            f"1. Open {B}/signup.\n"
            "2. Attempt signup with FREE_USER_01 existing email.\n"
            "3. Submit.",
            "1. Form loads.\n2. Existing email entered.\n3. Clear duplicate/exists error; no second account created silently.",
            "Duplicate email signup is rejected clearly.",
            priority="P1", severity="Major", test_type="Negative", account="FREE_USER_01",
        ),
        tc(
            "TC-AUTH-008", "Authentication", "Unverified email login gate",
            f"1. Login as UNVERIFIED_01.\n"
            "2. Attempt to open {B}/app/dashboard.",
            "1. Login may succeed into verify gate or show verify prompt.\n"
            "2. Protected app content not available until verified.",
            "Unverified users cannot use protected app modules.",
            priority="P0", severity="Critical", test_type="Negative", account="UNVERIFIED_01",
            user_type="Unverified", role="user",
        ),
        tc(
            "TC-AUTH-009", "Authentication", "Forgot password request",
            f"1. Open {B}/forgot-password (or Login → Forgot).\n"
            "2. Submit FREE_USER_01 email.\n"
            "3. Observe confirmation message (do not expose whether email exists beyond product rules).",
            "1. Form loads.\n2. Request accepted.\n3. User-facing confirmation; no crash.",
            "Forgot-password request completes with clear confirmation.",
            priority="P1", severity="Major", account="FREE_USER_01", user_type="Guest", role="guest",
        ),
        tc(
            "TC-AUTH-010", "Authentication", "Reset password via email link",
            "1. Using QA inbox, open reset link for a test account.\n"
            "2. Set a new password meeting rules.\n"
            "3. Login with new password.\n"
            "4. Confirm old password fails.",
            "1. Reset page loads from link.\n2. Password updated.\n3. New password works.\n4. Old password rejected.",
            "Password reset works end-to-end via email link.",
            priority="P0", severity="Critical", account="FREE_USER_01",
            pre="QA inbox access for reset email. Approved to rotate this account password.",
            notes="Coordinate with QA lead before rotating shared passwords.",
        ),
        tc(
            "TC-AUTH-011", "Authentication", "Logout",
            "1. Login as FREE_USER_01.\n"
            "2. Logout via profile/settings control.\n"
            "3. Press browser Back.\n"
            "4. Paste /app/dashboard.",
            "1. Authenticated.\n2. Session cleared; lands on public/login.\n"
            "3. No protected content via Back.\n4. Redirected to login.",
            "Logout clears session; protected routes inaccessible.",
            priority="P0", severity="Critical", test_type="Security", account="FREE_USER_01",
        ),
        tc(
            "TC-AUTH-012", "Authentication", "Session persistence across refresh",
            "1. Login as FREE_USER_01.\n"
            "2. Open Dashboard.\n"
            "3. Hard refresh.\n"
            "4. Confirm still authenticated.",
            "1. Logged in.\n2. Dashboard visible.\n3. Refresh completes.\n4. Still logged in (unless product uses short-lived sessions — then re-auth is clear).",
            "Session persists across refresh per product rules.",
            priority="P1", severity="Major", test_type="Persistence", account="FREE_USER_01",
        ),
        tc(
            "TC-AUTH-013", "Authentication", "Banned account login",
            f"1. Open {B}/login.\n"
            "2. Login as BANNED_USER_01.\n"
            "3. Observe result.",
            "1. Form loads.\n2. Credentials submitted.\n3. Access denied/ban message; no dashboard access.",
            "Banned users cannot access the application.",
            priority="P0", severity="Critical", test_type="Security", account="BANNED_USER_01",
        ),
        tc(
            "TC-AUTH-014", "Authentication", "OAuth login (if configured)",
            f"1. On {B}/login, if Google/OAuth button is shown, click it.\n"
            "2. Complete or cancel provider consent with approved test identity.\n"
            "3. If button absent, mark Requires Configuration / N/A.",
            "1. OAuth control visible or absent honestly.\n"
            "2. Success returns to app; cancel returns safely.\n"
            "3. N/A recorded if not configured — not a Pass.",
            "OAuth works when configured; otherwise classified Requires Configuration.",
            priority="P1", severity="Major", account="GUEST", user_type="Guest", role="guest",
            notes="Do not mark Pass merely because the button exists.",
        ),
        tc(
            "TC-AUTH-015", "Authentication", "MFA (if configured)",
            "1. Login with an MFA-enabled account if provided.\n"
            "2. Complete MFA challenge.\n"
            "3. If MFA UI absent, record Unavailable / Requires Configuration.",
            "1. MFA prompt appears when enabled.\n2. Valid code grants access; invalid denied.\n3. Honest classification if not present.",
            "MFA enforced when enabled for the account.",
            priority="P2", severity="Major", test_type="Security", account="MFA_USER_01",
            notes="Blocked until npm run qa:seed-mfa — see QA-GAP-002.",
        ),
        tc(
            "TC-AUTH-016", "Authentication", "Expired / invalid session action",
            "1. Login as FREE_USER_01.\n"
            "2. Per QA playbook, expire session (idle wait or clear auth storage as instructed — do not reverse-engineer tokens).\n"
            "3. Attempt a protected action (open Sessions, start Practice).",
            "1. Initially authenticated.\n2. Session becomes invalid.\n3. User prompted to re-login; no partial private data flash.",
            "Expired sessions force safe re-authentication.",
            priority="P1", severity="Major", test_type="Security", account="EXPIRED_SESSION_01",
        ),
    ]


def onboarding_cases() -> list[dict]:
    return [
        tc(
            "TC-ONB-001", "Onboarding", "First-time user completes onboarding",
            "1. Login as a verified new user who has not finished onboarding.\n"
            "2. Complete required steps with valid data.\n"
            "3. Finish and land on dashboard.\n"
            "4. Refresh; confirm onboarding does not restart.",
            "1. Onboarding shown.\n2. Required fields validated; progress works.\n"
            "3. Dashboard reachable.\n4. Onboarding stays completed after refresh.",
            "New user can complete onboarding and reach the app.",
            priority="P0", severity="Critical", account="NEW_USER_01",
            pre="Verified email; onboarding incomplete. Run npm run qa:reset-fixtures (QA-GAP-003).",
        ),
        tc(
            "TC-ONB-002", "Onboarding", "Required field validation",
            "1. On a required onboarding step, leave required fields empty.\n"
            "2. Attempt Next/Continue.",
            "1. Step visible.\n2. Clear validation; cannot proceed.",
            "Required onboarding fields block progress until valid.",
            priority="P1", severity="Major", test_type="Negative", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-003", "Onboarding", "Optional fields skippable",
            "1. Reach optional setup step if present.\n"
            "2. Skip or leave optional fields blank.\n"
            "3. Continue.",
            "1. Optional step identifiable.\n2. Skip allowed.\n3. Progress continues.",
            "Optional onboarding can be skipped.",
            priority="P2", severity="Minor", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-004", "Onboarding", "Back / Next navigation",
            "1. Move forward one step.\n"
            "2. Use Back/Previous.\n"
            "3. Confirm prior values retained if product preserves them.",
            "1. Next advances.\n2. Back returns.\n3. Data retention matches product behavior (document actual).",
            "Onboarding step navigation works without losing the flow.",
            priority="P2", severity="Minor", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-005", "Onboarding", "Refresh mid-onboarding",
            "1. Fill a step partially.\n"
            "2. Refresh browser.\n"
            "3. Observe resume behavior.",
            "1. Partial data entered.\n2. Page reloads.\n3. Either resumes safely or restarts with clear state — no crash/blank.",
            "Refresh during onboarding fails gracefully.",
            priority="P1", severity="Major", test_type="Persistence", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-006", "Onboarding", "Browser back during onboarding",
            "1. Advance two steps.\n"
            "2. Use browser Back button.\n"
            "3. Continue forward again.",
            "1. Progressed.\n2. Returns to prior step or safe state.\n3. Can continue without stuck loop.",
            "Browser back does not permanently trap the user.",
            priority="P2", severity="Minor", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-007", "Onboarding", "Incomplete onboarding cannot access app modules",
            f"1. As incomplete onboarding user, paste {B}/app/live.\n"
            "2. Observe gate.",
            "1. Forced back to onboarding or blocked with message.\n2. Live module not usable.",
            "App modules blocked until onboarding complete.",
            priority="P0", severity="Critical", test_type="Security", account="NEW_USER_01",
        ),
        tc(
            "TC-ONB-008", "Onboarding", "Completed user does not see onboarding again",
            f"1. Login as FREE_USER_01 (fully onboarded).\n"
            f"2. Open {B}/onboarding if linked.\n"
            "3. Confirm behavior is redirect or completed state.",
            "1. Lands on app.\n2. Onboarding not forced again.\n3. No broken wizard.",
            "Completed onboarding is not re-forced on normal login.",
            priority="P1", severity="Major", account="FREE_USER_01",
        ),
    ]


def dashboard_cases() -> list[dict]:
    return [
        tc(
            "TC-DASH-001", "Dashboard", "Dashboard loads",
            f"1. Login FREE_USER_01.\n2. Open {B}/app/dashboard.\n3. Wait for widgets.",
            "1. Authenticated.\n2. Dashboard route loads.\n3. Widgets/KPIs/shortcuts visible or honest empty states.",
            "Dashboard renders without infinite loading.",
            priority="P0", severity="Critical", account="FREE_USER_01",
        ),
        tc(
            "TC-DASH-002", "Dashboard", "Credits / plan visible",
            "1. On dashboard, locate credits/plan indicators.\n"
            "2. Open Usage/Billing and compare visible balance roughly.",
            "1. Credits/plan shown if product displays them.\n2. No contradictory impossible values without explanation.",
            "Dashboard credit/plan display is user-consistent.",
            priority="P1", severity="Major", account="PRO_USER_01",
        ),
        tc(
            "TC-DASH-003", "Dashboard", "Recent sessions / activity",
            "1. As HISTORY_USER_01 open dashboard.\n"
            "2. Open a recent session shortcut if present.\n"
            "3. As NO_HISTORY_01 confirm empty state.",
            "1. Recent items appear when history exists.\n2. Navigation works.\n3. Empty state clear — not an error.",
            "Recent activity and empty states behave correctly.",
            priority="P1", severity="Major", account="HISTORY_USER_01",
        ),
        tc(
            "TC-DASH-004", "Dashboard", "Shortcuts / CTAs",
            "1. Click each primary dashboard shortcut (Practice Coach, Mock, Gov Exams, Prep, etc.).\n"
            "2. Confirm destination module loads.",
            "1. Each shortcut navigates.\n2. Destination is the expected module (or plan gate / coming soon — honest).",
            "Dashboard shortcuts navigate to real modules.",
            priority="P1", severity="Major", account="PRO_USER_01",
            notes="Do not Pass a shortcut that only opens a dead page.",
        ),
        tc(
            "TC-DASH-005", "Dashboard", "Loading and error retry",
            "1. Throttle network to Slow 3G (DevTools) if permitted.\n"
            "2. Reload dashboard.\n"
            "3. Restore network; use Retry if shown.",
            "1. Network slowed.\n2. Loading indicators appear; eventual error or success.\n3. Retry recovers or shows clear failure.",
            "Dashboard handles slow/error network gracefully.",
            priority="P2", severity="Minor", test_type="Negative", account="FREE_USER_01",
        ),
        tc(
            "TC-DASH-006", "Dashboard", "Interview Day page",
            f"1. Open {B}/app/interview-day.\n2. Verify layout and any scheduled items/empty state.",
            "1. Page loads.\n2. Content or empty state; no crash.",
            "Interview Day page is usable.",
            priority="P2", severity="Minor", account="FREE_USER_01",
        ),
        tc(
            "TC-DASH-007", "Dashboard", "Notifications entry",
            "1. From dashboard/header open Notifications.\n"
            "2. Verify list or empty state.",
            "1. Notifications page/panel opens.\n2. Readable list or empty state.",
            "Notifications reachable from chrome.",
            priority="P2", severity="Minor", account="FREE_USER_01",
        ),
        tc(
            "TC-DASH-008", "Dashboard", "Referrals page",
            f"1. Open {B}/app/referrals.\n2. Copy referral code/link if shown.\n3. Refresh; confirm code persists.",
            "1. Page loads.\n2. Code/link usable.\n3. Persists after refresh.",
            "Referrals page works and persists codes.",
            priority="P2", severity="Minor", test_type="Persistence", account="FREE_USER_01",
        ),
    ]


def module_index_cases() -> list[dict]:
    """High-level smoke that each authenticated module route opens (not proof of full function)."""
    routes = [
        ("TC-MOD-001", "Practice Coach", "/app/live"),
        ("TC-MOD-002", "Mock Interview", "/app/mock"),
        ("TC-MOD-003", "Gov Exams hub", "/app/mock-test"),
        ("TC-MOD-004", "Prep Lab", "/app/prep"),
        ("TC-MOD-005", "Sessions", "/app/sessions"),
        ("TC-MOD-006", "Documents", "/app/documents"),
        ("TC-MOD-007", "Answer Bank", "/app/answers"),
        ("TC-MOD-008", "Interviews scheduler", "/app/interviews"),
        ("TC-MOD-009", "Companies", "/app/companies"),
        ("TC-MOD-010", "Analytics", "/app/analytics"),
        ("TC-MOD-011", "Debriefs", "/app/debriefs"),
        ("TC-MOD-012", "Learning Hub", "/app/learn"),
        ("TC-MOD-013", "Community", "/app/community"),
        ("TC-MOD-014", "Coding Lab", "/app/coding"),
        ("TC-MOD-015", "Practice workspace", "/app/practice-workspace"),
        ("TC-MOD-016", "Practice plan", "/app/plan"),
        ("TC-MOD-017", "Question bank", "/app/question-bank"),
        ("TC-MOD-018", "Assessments", "/app/assessments"),
        ("TC-MOD-019", "Document library", "/app/library"),
        ("TC-MOD-020", "Usage", "/app/usage"),
        ("TC-MOD-021", "Settings", "/app/settings/profile"),
        ("TC-MOD-022", "Guide", "/app/guide"),
    ]
    out = []
    for tid, name, path in routes:
        out.append(
            tc(
                tid, "Module Smoke", name,
                f"1. Login PRO_USER_01.\n"
                f"2. Navigate to {B}{path} via sidebar or URL.\n"
                f"3. Wait up to 15s.\n"
                f"4. Classify: Fully Working UI load / Plan gate / Feature flag / Error / Empty.",
                "1. Authenticated.\n"
                "2. Route resolves.\n"
                "3. Page shows real UI, plan upgrade, disabled feature message, or clear error — not infinite spinner.\n"
                "4. Classification recorded in Notes + Application Inventory.",
                f"{name} surface is reachable and classifiable from user perspective.",
                priority="P1", severity="Major", account="PRO_USER_01",
                notes="Opening a page ≠ feature works. Follow module sheets for functional depth.",
            )
        )
    return out
