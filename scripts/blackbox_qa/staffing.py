"""QA staffing, credentials loader, module ownership, calendar slots."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from pathlib import Path

# High → Low ownership (Raj Balani first)
TESTERS = [
    "Raj Balani",   # 1 — highest priority / critical systems
    "Anushka",      # 2 — core product sessions
    "Sultana",      # 3 — prep / history / secondary modules
    "Venkat",       # 4 — public, polish, responsive, a11y
]

# Module name (from case["Module"]) → assigned tester (high→low)
MODULE_OWNER: dict[str, str] = {
    "Authentication": "Raj Balani",
    "Onboarding": "Raj Balani",
    "Security": "Raj Balani",
    "Admin Portal": "Raj Balani",
    "Billing": "Raj Balani",
    "Credits": "Raj Balani",
    "Government Exams": "Raj Balani",
    "AI / Fallback": "Raj Balani",
    "API / Network Observation": "Raj Balani",
    "Regression": "Raj Balani",
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

# Sheet title prefix → owner (for section gate / calendar)
SHEET_OWNER: dict[str, str] = {
    "05 Module Test Cases": "Anushka",
    "06 Public Pages": "Venkat",
    "07 Authentication": "Raj Balani",
    "08 Onboarding": "Raj Balani",
    "09 Dashboard": "Sultana",
    "10 Practice Coach": "Anushka",
    "11 Live Copilot": "Anushka",
    "12 Mock Interview": "Anushka",
    "13 Government Exams": "Raj Balani",
    "14 AI Coach Chatbot": "Anushka",
    "15 Prep Lab": "Sultana",
    "16 Documents": "Anushka",
    "17 Resume JD Parsing": "Anushka",
    "18 Answer Bank": "Sultana",
    "19 Interview Scheduler": "Venkat",
    "20 Sessions": "Sultana",
    "21 Reports": "Sultana",
    "22 Analytics": "Sultana",
    "23 Billing": "Raj Balani",
    "24 Credits": "Raj Balani",
    "25 Settings": "Venkat",
    "26 Notifications": "Sultana",
    "27 Integrations": "Venkat",
    "28 Learning Hub": "Sultana",
    "29 Community": "Sultana",
    "30 Coding Lab": "Sultana",
    "31 Admin Portal": "Raj Balani",
    "32 Security": "Raj Balani",
    "33 Accessibility": "Venkat",
    "34 Responsive Cross-Browser": "Venkat",
    "35 API Network Observation": "Raj Balani",
    "36 AI Fallback": "Raj Balani",
    "37 Regression": "Raj Balani",
    "38 Cross-Module Journeys": "Sultana",
}

PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2, "P3": 3, "P4": 4}

TIME_SLOTS = [
    "09:00–11:00",
    "11:00–13:00",
    "14:00–16:00",
    "16:00–18:00",
]

TIME_SLOT_LIST = '"' + ",".join(TIME_SLOTS) + '"'
TESTER_LIST = '"' + ",".join(TESTERS) + '"'

SECTION_STATUS_LIST = (
    '"Not Started,In Progress,Blocked,'
    'ALL FILLED — READY TO CLOSE"'
)


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
    # (Account ID, Role, Plan, Purpose, Email key, Password key, Credits key, Restrictions, Permissions)
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
         "Reset onboarding state between runs if needed", "Onboarding flows"),
        ("DISPOSABLE_01", "Disposable", "free", "Destructive tests (delete account)",
         "QA_DISPOSABLE_EMAIL", "QA_DISPOSABLE_PASSWORD", "QA_DISPOSABLE_CREDITS",
         "May be deleted — re-seed after", "Destructive only"),
        ("BANNED_USER_01", "Banned", "free", "Ban enforcement",
         "QA_BANNED_EMAIL", "QA_BANNED_PASSWORD", "QA_BANNED_CREDITS",
         "Must remain banned", "Login denied"),
        ("ZERO_CREDIT_01", "Zero credits", "pro", "Credit exhaustion UX",
         "QA_ZERO_CREDIT_EMAIL", "QA_ZERO_CREDIT_PASSWORD", "QA_ZERO_CREDIT_CREDITS",
         "Keep balance at 0", "AI actions blocked"),
        ("LOW_CREDIT_01", "Low credits", "pro", "Low-credit boundary",
         "QA_PAST_DUE_EMAIL", "QA_PAST_DUE_PASSWORD", "QA_PAST_DUE_CREDITS",
         "Treat as low-credit / past-due sandbox account", "Warnings + limited actions"),
        ("SUFFICIENT_CREDIT_01", "Sufficient credits", "pro", "Happy-path AI consume",
         "QA_PRO_EMAIL", "QA_PRO_PASSWORD", "QA_PRO_CREDITS",
         "Same as PRO — do not drain to zero", "Successful AI flows"),
        ("HISTORY_USER_01", "User with history", "pro", "Sessions/reports/compare",
         "QA_PRO_EMAIL", "QA_PRO_PASSWORD", "QA_PRO_CREDITS",
         "Ensure prior sessions exist or create once", "History present"),
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
            "Assigned Testers (shared)": "Raj Balani, Anushka, Sultana, Venkat",
        })
    return rows


def assign_tester(case: dict) -> dict:
    module = case.get("Module", "")
    owner = MODULE_OWNER.get(module, "Venkat")
    # Journeys: split by feature text
    feature = (case.get("Feature") or "").lower()
    if module == "Cross-Module Journeys":
        if "journey 3" in feature or "journey 4" in feature or "journey 5" in feature or "gov" in feature or "purchase" in feature or "admin" in feature:
            owner = "Raj Balani"
        elif "journey 2" in feature or "resume" in feature:
            owner = "Anushka"
        else:
            owner = "Sultana"
    if module == "Regression":
        # Keep Raj for critical regression; push UI regression notes stay Raj as owner of sheet
        owner = "Raj Balani"
    case["Tester"] = owner
    case["Pass / Fail"] = "Not Run"
    case["Actual Result"] = ""
    case["Defect ID"] = ""
    case["Execution Date"] = ""
    # Ensure test data points at accounts sheet
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


def calendar_rows(start: date | None = None) -> list[dict]:
    """Build a 5-day execution calendar with time-slot selection columns."""
    start = start or date(2026, 8, 24)
    # Day plans: date, tester, focus sheets, default slot
    plan = [
        (0, "Raj Balani", "07 Authentication, 08 Onboarding, 32 Security", "09:00–11:00"),
        (0, "Raj Balani", "23 Billing, 24 Credits", "11:00–13:00"),
        (0, "Anushka", "10 Practice Coach, 11 Live Copilot", "14:00–16:00"),
        (0, "Anushka", "12 Mock Interview", "16:00–18:00"),
        (1, "Raj Balani", "13 Government Exams (generate + runner)", "09:00–11:00"),
        (1, "Raj Balani", "13 Government Exams (submit + isolation) + 36 AI Fallback", "11:00–13:00"),
        (1, "Anushka", "16 Documents, 17 Resume JD Parsing, 14 AI Coach", "14:00–16:00"),
        (1, "Sultana", "09 Dashboard, 15 Prep Lab", "16:00–18:00"),
        (2, "Sultana", "20 Sessions, 21 Reports, 22 Analytics", "09:00–11:00"),
        (2, "Sultana", "18 Answer Bank, 26 Notifications, Journey 1", "11:00–13:00"),
        (2, "Venkat", "06 Public Pages, 25 Settings", "14:00–16:00"),
        (2, "Venkat", "27 Integrations, 19 Interview Scheduler", "16:00–18:00"),
        (3, "Raj Balani", "31 Admin Portal + TC-ADM-027 security", "09:00–11:00"),
        (3, "Raj Balani", "35 API Network, 37 Regression (P0)", "11:00–13:00"),
        (3, "Anushka", "05 Module Smoke + Journey 2", "14:00–16:00"),
        (3, "Sultana", "28 Learning, 29 Community, 30 Coding, Journey 1 wrap", "16:00–18:00"),
        (4, "Venkat", "33 Accessibility, 34 Responsive / Cross-Browser", "09:00–11:00"),
        (4, "Sultana", "38 Journeys 1–2 verify + Execution Summary", "11:00–13:00"),
        (4, "Raj Balani", "Journeys 3–5 + Release Checklist recommendation", "14:00–16:00"),
        (4, "All", "Defect triage + Section Completion Gate close-out", "16:00–18:00"),
    ]
    rows = []
    for day_offset, tester, focus, default_slot in plan:
        d = start + timedelta(days=day_offset)
        rows.append({
            "Date": d.isoformat(),
            "Weekday": d.strftime("%A"),
            "Tester": tester,
            "Assigned Focus (sheets / work)": focus,
            "Time Slot (select)": default_slot,
            "Custom Start Time": default_slot.split("–")[0],
            "Custom End Time": default_slot.split("–")[1],
            "Location / URL": "https://clarify.ai.sltfinanceindia.com",
            "Status": "Scheduled",
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
