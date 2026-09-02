"""QA environment gaps — workbook classification, not product defects."""
from __future__ import annotations

QA_ENVIRONMENT_GAPS: list[dict] = [
    {
        "Gap ID": "QA-GAP-001",
        "Source cases": "TC-LIVE-005",
        "Classification": "Blocked by Environment",
        "Owner": "Desktop / Release",
        "Resolution": "Provide signed Electron build OR mark web QA out of scope. See docs/ELECTRON_SMOKE_CHECKLIST.md.",
        "Runnable on web?": "No — overlay desktop path only",
    },
    {
        "Gap ID": "QA-GAP-002",
        "Source cases": "TC-AUTH-015",
        "Classification": "Blocked — fixture",
        "Owner": "QA Ops",
        "Resolution": "npm run qa:seed-accounts && npm run qa:seed-mfa → use MFA_USER_01 + QA_MFA_TOTP_SECRET",
        "Runnable on web?": "Yes after seed-mfa",
    },
    {
        "Gap ID": "QA-GAP-003",
        "Source cases": "TC-ONB-001, TC-JRN-001",
        "Classification": "Blocked — stale fixture",
        "Owner": "QA Ops",
        "Resolution": "npm run qa:reset-fixtures before journey (qa.onboarding@ must have onboarding_completed=false)",
        "Runnable on web?": "Yes after reset",
    },
    {
        "Gap ID": "QA-GAP-004",
        "Source cases": "LOW_CREDIT_01, EXACT_CREDIT_01, ZERO_CREDIT_01 boundary tests",
        "Classification": "Blocked — missing .env keys",
        "Owner": "QA Ops",
        "Resolution": "Re-run npm run qa:seed-accounts (duplicate LOW_CREDIT/EXACT rows fixed) + qa:reset-fixtures",
        "Runnable on web?": "Yes after seed",
    },
]
