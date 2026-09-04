"""QA staffing, credentials loader, module ownership, 2-day execution window."""
from __future__ import annotations

from datetime import date
from pathlib import Path

TESTERS = [
    "Anushka",
    "Sultana",
    "Venkat",
]

# Module name (from case["Module"]) → assigned tester
MODULE_OWNER: dict[str, str] = {
    "Authentication": "Venkat",
    "Onboarding": "Venkat",
    "Security": "Venkat",
    "Admin Portal": "Sultana",
    "Billing": "Sultana",
    "Credits": "Sultana",
    "Government Exams": "Anushka",
    "AI / Fallback": "Anushka",
    "API / Network Observation": "Sultana",
    "Regression": "Sultana",
    "Practice Coach": "Anushka",
    "Live Copilot": "Anushka",
    "Mock Interview": "Anushka",
    "Documents": "Anushka",
    "Resume / JD Parsing": "Anushka",
    "AI Coach / Chatbot": "Anushka",
    "Module Smoke": "Anushka",
    "Dashboard": "Sultana",
    "Prep Lab": "Sultana",
    "Sessions": "Sultana",
    "Reports": "Sultana",
    "Analytics": "Sultana",
    "Answer Bank": "Sultana",
    "Notifications": "Sultana",
    "Learning Hub": "Sultana",
    "Community": "Sultana",
    "Coding Lab": "Sultana",
    "Cross-Module Journeys": "Sultana",
    "Public Pages": "Venkat",
    "Settings": "Venkat",
    "Integrations": "Venkat",
    "Interview Scheduler": "Venkat",
    "Responsive / Cross-Browser": "Venkat",
    "Accessibility": "Venkat",
}

SHEET_OWNER: dict[str, str] = {
    "05 Module Test Cases": "Anushka",
    "06 Public Pages": "Venkat",
    "07 Authentication": "Venkat",
    "08 Onboarding": "Venkat",
    "09 Dashboard": "Sultana",
    "10 Practice Coach": "Anushka",
    "11 Live Copilot": "Anushka",
    "12 Mock Interview": "Anushka",
    "13 Government Exams": "Anushka",
    "14 AI Coach Chatbot": "Anushka",
    "15 Prep Lab": "Sultana",
    "16 Documents": "Anushka",
    "17 Resume JD Parsing": "Anushka",
    "18 Answer Bank": "Sultana",
    "19 Interview Scheduler": "Venkat",
    "20 Sessions": "Sultana",
    "21 Reports": "Sultana",
    "22 Analytics": "Sultana",
    "23 Billing": "Sultana",
    "24 Credits": "Sultana",
    "25 Settings": "Venkat",
    "26 Notifications": "Sultana",
    "27 Integrations": "Venkat",
    "28 Learning Hub": "Sultana",
    "29 Community": "Sultana",
    "30 Coding Lab": "Sultana",
    "31 Admin Portal": "Sultana",
    "32 Security": "Venkat",
    "33 Accessibility": "Venkat",
    "34 Responsive Cross-Browser": "Venkat",
    "35 API Network Observation": "Sultana",
    "36 AI Fallback": "Anushka",
    "37 Regression": "Sultana",
    "38 Cross-Module Journeys": "Sultana",
    "00d Live Gov Exam Proof": "Anushka",
}

GOV_ADMIN_IDS = {
    "TC-ADM-019",
    "TC-ADM-020",
    "TC-ADM-021",
    "TC-ADM-022",
    "TC-ADM-023",
    "TC-ADM-024",
}

PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}

CYCLE_START = date(2026, 8, 31)
CYCLE_END = date(2026, 9, 1)
WINDOW_LABEL = "Complete within 2 days (31 Aug – 1 Sep 2026, IST)"
SITE_URL = "https://clarify.ai.sltfinanceindia.com"

TESTER_FOCUS = {
    "Anushka": (
        "05 Module Smoke; 10 Practice Coach; 11 Live Copilot; 12 Mock Interview; "
        "13 Government Exams; 00d Live Gov Exam Proof; 14 AI Coach; 16 Documents; "
        "17 Resume/JD; 36 AI Fallback; Admin gov TC-ADM-019–024; Journey 2; "
        "00c Gov remediations"
    ),
    "Sultana": (
        "09 Dashboard; 15 Prep Lab; 18 Answer Bank; 20 Sessions; 21 Reports; "
        "22 Analytics; 23 Billing; 24 Credits; 26 Notifications; 28–30 Learning/"
        "Community/Coding; 31 Admin (non-gov); 35 API; 37 Regression; "
        "Journeys 1, 4–5; 00c credits/sessions remediations"
    ),
    "Venkat": (
        "06 Public Pages; 07 Authentication; 08 Onboarding; 19 Scheduler; "
        "25 Settings; 27 Integrations; 32 Security; 33 Accessibility; "
        "34 Responsive; 00c auth/public/settings remediations"
    ),
}

TESTER_LIST = '"' + ",".join(TESTERS) + '"'

SECTION_STATUS_LIST = (
    '"Not Started,In Progress,Blocked,'
    'ALL FILLED — READY TO CLOSE"'
)

WINDOW_STATUS_LIST = '"Not Started,In Progress,Done,Blocked"'


def load_qa_env(root: Path) -> dict[str, str]:
    """Load key=value from .env.qa.local (gitignored)."""
    path = root / ".env.qa.local"
    env: dict[str, str] = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def build_credential_rows(env: dict[str, str]) -> list[dict]:
    """Full Test Accounts rows including email + password from local env."""
    shared = "Anushka, Sultana, Venkat"
    specs = [
        ("GUEST", "Guest", "none", "Public browsing — no login", None, None, None,
         "No credentials", "Public pages only"),
        ("FREE_USER_01", "Free User", "free", "Free-plan feature testing",
         "QA_FREE_EMAIL", "QA_FREE_PASSWORD", "QA_FREE_CREDITS",
         "Do not upgrade permanently", "Free entitlements"),
        ("FREE_USER_02", "Free User (empty history)", "free", "Empty-state testing",
         "QA_FREE_EMAIL", "QA_FREE_PASSWORD", "QA_FREE_CREDITS",
         "Prefer a clean/empty profile if available; else use FREE and skip history asserts",
         "Empty states"),
        ("PRO_USER_01", "Pro User", "pro", "Pro features & credits",
         "QA_PRO_EMAIL", "QA_PRO_PASSWORD", "QA_PRO_CREDITS",
         "Primary product testing account", "Pro entitlements"),
        ("MAX_USER_01", "Max/Enterprise User", "enterprise", "Max plan features",
         "QA_MAX_EMAIL", "QA_MAX_PASSWORD", "QA_MAX_CREDITS",
         "Highest plan", "Max entitlements"),
        ("ADMIN_USER_01", "Admin", "enterprise", "Admin portal testing",
         "QA_ADMIN_EMAIL", "QA_ADMIN_PASSWORD", "QA_ADMIN_CREDITS",
         "Staff only — do not share outside QA team", "Admin + user app"),
        ("UNVERIFIED_01", "Unverified", "free", "Email verification gate",
         "QA_UNVERIFIED_EMAIL", "QA_UNVERIFIED_PASSWORD", "QA_UNVERIFIED_CREDITS",
         "Must remain unverified until AUTH-VERIFY cases done", "Verify-email only"),
        ("NEW_USER_01", "Newly Registered / Onboarding", "free", "Signup + onboarding",
         "QA_ONBOARDING_EMAIL", "QA_ONBOARDING_PASSWORD", "QA_ONBOARDING_CREDITS",
         "Reset onboarding state between runs if needed. Prefer qa.onboarding@",
         "Onboarding flows"),
        ("DISPOSABLE_01", "Disposable", "free", "Destructive tests (delete account)",
         "QA_DISPOSABLE_EMAIL", "QA_DISPOSABLE_PASSWORD", "QA_DISPOSABLE_CREDITS",
         "May be deleted — re-seed after", "Destructive only"),
        ("BANNED_USER_01", "Banned", "free", "Ban enforcement",
         "QA_BANNED_EMAIL", "QA_BANNED_PASSWORD", "QA_BANNED_CREDITS",
         "Must remain banned", "Login denied"),
        ("ZERO_CREDIT_01", "Zero credits", "pro", "Credit exhaustion UX",
         "QA_ZERO_CREDIT_EMAIL", "QA_ZERO_CREDIT_PASSWORD", "QA_ZERO_CREDIT_CREDITS",
         "Keep balance at 0", "AI actions blocked"),
        ("LOW_CREDIT_01", "Low credits", "pro", "Low-credit boundary (qa.lowcredit@)",
         "QA_LOW_CREDIT_EMAIL", "QA_LOW_CREDIT_PASSWORD", "QA_LOW_CREDIT_CREDITS",
         "Use qa.lowcredit@ only. Do NOT reuse the past-due account for this case.",
         "Warnings + limited actions"),
        ("EXACT_CREDIT_01", "Exact credits", "pro", "Exact remaining-credit boundary (qa.exactcredit@)",
         "QA_EXACT_CREDIT_EMAIL", "QA_EXACT_CREDIT_PASSWORD", "QA_EXACT_CREDIT_CREDITS",
         "Keep balance at exact tool cost. Do not drain to zero until TC-CR-005.",
         "Exact-spend then block"),
        ("MFA_USER_01", "MFA enrolled", "pro", "TOTP login challenge (TC-AUTH-015)",
         "QA_MFA_EMAIL", "QA_MFA_PASSWORD", "QA_MFA_CREDITS",
         "Run npm run qa:seed-mfa; OTP from QA_MFA_TOTP_SECRET in .env.qa.local",
         "AAL2 challenge after password"),
        ("SUFFICIENT_CREDIT_01", "Sufficient credits", "pro", "Happy-path AI consume",
         "QA_PRO_EMAIL", "QA_PRO_PASSWORD", "QA_PRO_CREDITS",
         "Same as PRO — do not drain to zero", "Successful AI flows"),
        ("HISTORY_USER_01", "User with history", "pro", "Sessions/reports/compare",
         "QA_HISTORY_EMAIL", "QA_HISTORY_PASSWORD", "QA_HISTORY_CREDITS",
         "npm run qa:seed-accounts && npm run qa:seed-compare (2 scored + 1 unscored)", "History present"),
        ("NO_HISTORY_01", "User with no history", "free", "Empty sessions/analytics",
         "QA_FREE_EMAIL", "QA_FREE_PASSWORD", "QA_FREE_CREDITS",
         "Use free account with no sessions if possible", "Empty states"),
        ("USER_A_01", "User A (isolation)", "pro", "Cross-user resource isolation",
         "QA_USER_A_EMAIL", "QA_USER_A_PASSWORD", "QA_USER_A_CREDITS",
         "Pair with USER_B_01", "Own data only"),
        ("USER_B_01", "User B (isolation)", "pro", "Cross-user resource isolation",
         "QA_USER_B_EMAIL", "QA_USER_B_PASSWORD", "QA_USER_B_CREDITS",
         "Pair with USER_A_01", "Own data only"),
        ("EXPIRED_SESSION_01", "Any valid user", "any", "Session expiry testing",
         "QA_FREE_EMAIL", "QA_FREE_PASSWORD", "QA_FREE_CREDITS",
         "Expire session per playbook after login", "Re-auth required"),
        ("MOD_USER_01", "Moderator (if available)", "pro", "Moderation UI if provisioned",
         None, None, None,
         "Skip / N/A if role not seeded", "Moderation only"),
    ]

    rows = []
    for spec in specs:
        aid, role, plan, purpose, ek, pk, ck, restrictions, perms = spec
        email = env.get(ek, "") if ek else "N/A — no login"
        password = env.get(pk, "") if pk else "N/A"
        credits = env.get(ck, "") if ck else "—"
        if ek and not email:
            email = f"(missing {ek} in .env.qa.local)"
            password = "(missing — run npm run qa:seed-accounts)"
        rows.append({
            "Test Account ID": aid,
            "Role": role,
            "Plan": plan,
            "Purpose": purpose,
            "Email / Username": email,
            "Password": password,
            "Credits (seed)": credits,
            "Credential Location": ".env.qa.local (also copied here for closed-beta QA team only)",
            "Environment": "Closed Beta / QA Target",
            "Restrictions": restrictions,
            "Expected Permissions": perms,
            "Assigned Testers (shared)": shared,
        })
    return rows


def assign_tester(case: dict) -> dict:
    module = case.get("Module", "")
    owner = MODULE_OWNER.get(module, "Venkat")
    feature = (case.get("Feature") or "").lower()
    tid = case.get("Test Case ID", "")

    if module == "Cross-Module Journeys":
        if "journey 2" in feature or "resume" in feature:
            owner = "Anushka"
        elif "journey 3" in feature or "gov" in feature:
            owner = "Anushka"
        else:
            owner = "Sultana"

    if module == "Regression":
        owner = "Sultana"

    if module == "Admin Portal" and tid in GOV_ADMIN_IDS:
        owner = "Anushka"

    if case.get("Tester") in TESTERS:
        owner = case["Tester"]

    case["Tester"] = owner
    case["Pass / Fail"] = "Not Run"
    case["Actual Result"] = ""
    case["Defect ID"] = ""
    case["Execution Date"] = ""
    if "Test Data" in case and "credential" not in case["Test Data"].lower():
        case["Test Data"] = (
            case["Test Data"]
            + " | Login email/password: see sheet 03 Test Accounts for Account ID "
            + case.get("Account ID", "")
        )
    return case


def assign_all(cases: list[dict]) -> list[dict]:
    out = [assign_tester(dict(c)) for c in cases]
    out.sort(key=lambda c: (PRIORITY_RANK.get(c.get("Priority", "P4"), 9), c.get("Test Case ID", "")))
    return out


def execution_window_rows() -> list[dict]:
    """One row per tester. No day-by-day or time-slot grid."""
    rows = []
    for tester in TESTERS:
        rows.append({
            "Tester": tester,
            "Assigned sheets / work": TESTER_FOCUS[tester],
            "Window": WINDOW_LABEL,
            "Cycle start": CYCLE_START.isoformat(),
            "Cycle end": CYCLE_END.isoformat(),
            "Location / URL": SITE_URL,
            "Status": "Not Started",
            "Section Gate Link": "See 00b Section Completion Gate",
            "Notes / blockers": "",
            "Updated By": "",
            "Updated At": "",
        })
    return rows


def stripe_sandbox_note(env: dict[str, str]) -> list[tuple[str, str]]:
    return [
        ("Stripe test card", env.get("QA_STRIPE_TEST_CARD", "4242424242424242")),
        ("Stripe test expiry", env.get("QA_STRIPE_TEST_EXP", "12/34")),
        ("Stripe test CVC", env.get("QA_STRIPE_TEST_CVC", "123")),
        ("Payment mode", "SANDBOX / TEST ONLY — never live charges unless explicitly approved"),
    ]
