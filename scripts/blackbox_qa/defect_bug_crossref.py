"""Defect log ↔ engineering bug cross-reference (consolidated fixes)."""
from __future__ import annotations

# Used by workbook generators and coverage ledger classification.
DEFECT_BUG_CROSSREF: list[dict] = [
    {
        "Defect ID": "DEF-001",
        "Consolidated fix": "BUG-003",
        "Title": "Infinite search spinner / profile timeout on /app/mock-test",
        "Primary tests": "TC-MOD-003 / TC-GOV-001",
        "Code touchpoints": "ExamSearchCombobox, searchLifecycle, profile timeout hardening",
        "Retest": "Search completes or shows honest error; no infinite Searching…",
    },
    {
        "Defect ID": "DEF-002",
        "Consolidated fix": "BUG-009",
        "Title": "Missing DialogTitle on global search modal",
        "Primary tests": "TC-MOD-022",
        "Code touchpoints": "src/components/ui/command.tsx (CommandDialog DialogTitle)",
        "Retest": "No Radix DialogTitle console warnings",
    },
    {
        "Defect ID": "DEF-INT-001",
        "Consolidated fix": "BUG-006",
        "Title": "Calendar sync 501 with live Connect CTA",
        "Primary tests": "TC-INT-001 / TC-SCH-004",
        "Code touchpoints": "useCalendarSync, SettingsIntegrations not_configured gate",
        "Retest": "Not configured → disabled CTA; configured → OAuth works",
    },
    {
        "Defect ID": "DEF-PUB-013",
        "Consolidated fix": "BUG-018",
        "Title": "Continue with Google 400 validation_failed",
        "Primary tests": "TC-PUB-013 / TC-AUTH-014",
        "Code touchpoints": "oauthCallbackUrl, oauthReadiness, OAuthProviderSection",
        "Retest": "CTA hidden when unconfigured; valid redirect when configured",
    },
    {
        "Defect ID": "DEF-HELP-COPY",
        "Consolidated fix": "BUG-012",
        "Title": "Help FAQ vs footer status copy mismatch",
        "Primary tests": "TC-PUB-004 / DOCX-30-001",
        "Code touchpoints": "helpCatalogCopy, MarketingLayout footer, help_articles migration",
        "Retest": "Help + footer use same catalog strings",
    },
    {
        "Defect ID": "DEF-003",
        "Consolidated fix": "BUG-030",
        "Title": "Razorpay risk-detection script blocked by CSP",
        "Primary tests": "TC-BILL-002",
        "Code touchpoints": "index.html CSP, billingCsp.test.ts",
        "Retest": "No script-src CSP block on cdn.razorpay.com",
    },
    {
        "Defect ID": "DEF-BILL-002",
        "Consolidated fix": "BUG-030",
        "Title": "Razorpay test card treated as unsupported international",
        "Primary tests": "TC-BILL-002",
        "Code touchpoints": "razorpayCheckout.ts user-facing errors",
        "Retest": "India sandbox card/UPI guidance; no Stripe 4242 confusion",
    },
    {
        "Defect ID": "DEF-BILL-003",
        "Consolidated fix": "BUG-030",
        "Title": "Razorpay payments/validate/account 500",
        "Primary tests": "TC-BILL-003",
        "Code touchpoints": "razorpayCheckout.ts, razorpay-verify-payment edge",
        "Retest": "Actionable error or successful grant; redeploy edge + sandbox keys",
    },
    {
        "Defect ID": "DEF-GOV-QD-001",
        "Alias": "Anushka DEF-002",
        "Consolidated fix": "BUG-002",
        "Title": "Quick Drill: 0 of 10 questions after bank + AI fill (422)",
        "Primary tests": "TC-GOV Quick Drill / select-test-questions",
        "Code touchpoints": "select-test-questions, selectTestQuestionAssembly, TestConfigure quick_drill",
        "Retest": "10/10 or honest shortage 409; no false 422 on AI fill path",
    },
]

DEFECT_STATUS_FIXED_IN_CODE = {
    "DEF-001",
    "DEF-002",
    "DEF-INT-001",
    "DEF-PUB-013",
    "DEF-HELP-COPY",
    "DEF-003",
    "DEF-BILL-002",
    "DEF-BILL-003",
    "DEF-GOV-QD-001",
}
