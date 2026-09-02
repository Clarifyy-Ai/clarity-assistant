"""Final BB Manual QA coverage ledger builder — Prompt 5. Not a test file."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(r"C:\Users\TECH-GENIUSES\Downloads\clarity-assistant")
RAW = ROOT / "_coverage_ledger_raw.json"
OUT = ROOT / "_final_coverage_ledger.json"
MD = ROOT / "_FINAL_BB_COVERAGE_LEDGER.md"

PROBLEM = re.compile(
    r"fail|failed|failure|error|however|\bbut\b|missing|not working|unavailable|blocked|partial|"
    r"timeout|invalid|expired|unauthorized|not implemented|not configured|cannot verify|"
    r"could not verify|incorrect|inconsistent|overlap|unreadable|corrupted|no option|no header|"
    r"not persisted|reset after refresh|\b400\b|\b401\b|\b403\b|\b409\b|\b422\b|\b429\b|"
    r"\b500\b|\b501\b|\b502\b|\b503\b|CORS|CSP|spinner|cancelled|duplicate|parse failed|"
    r"no records|insufficient evidence",
    re.I,
)

# Prompt / area that primarily handled categories
PROMPT_MAP = {
    "Responsive / Cross-Browser": "P4-responsive",
    "Regression": "P3-regression",
    "Cross-Module Journeys": "P3-journeys",
    "Government Exams": "P2-gov",
    "Billing": "P1-billing",
    "Credits": "P1-billing",
    "Admin Portal": "P2-admin",
    "Practice Coach": "P1-sessions",
    "Mock Interview": "P1-sessions",
    "Live Copilot": "P1-sessions",
    "Documents": "P2-docs",
    "Resume / JD Parsing": "P2-docs",
    "Authentication": "P1-auth",
    "Onboarding": "P1-auth",
    "Settings": "P2-settings",
    "API / Network Observation": "P2-api",
    "AI / Fallback": "P2-ai",
    "Accessibility": "P4-a11y",
}

# Known dispositions from remediations + runtime probes (session 570973 + prior)
FIXED = {
    # Responsive P4
    "TC-RSP-001", "TC-RSP-002", "TC-RSP-003", "TC-RSP-004", "TC-RSP-005", "TC-RSP-006", "TC-RSP-007",
    # Admin UI
    "TC-ADM-002", "TC-ADM-019", "TC-ADM-004", "TC-ADM-011", "TC-ADM-017", "TC-ADM-020", "TC-ADM-012",
    # Settings / notifications / onboarding gates
    "TC-SET-001", "TC-SET-003", "TC-SET-004", "TC-SET-005", "TC-SET-006", "TC-SET-008", "TC-SET-012",
    "TC-SET-013", "TC-SET-014", "TC-NTF-004", "TC-ONB-007", "TC-REG-010",
    # Scheduler / sessions / public help
    "TC-SCH-002", "TC-SCH-003", "TC-SES-002",
    "TC-PUB-001", "TC-PUB-004", "TC-PUB-009",
    # Extra bugs
    "DEF-001", "DEF-002", "DEF-003", "DEF-GOV-QD-001",
    "DEF-INT-001", "DEF-PUB-013", "DEF-HELP-COPY",
    "DEF-BILL-002", "DEF-BILL-003",
    # Auth/login regression passes
    "TC-REG-001", "TC-REG-002", "TC-REG-014", "TC-REG-015",
    # search-exams runtime 200
    "TC-GOV-001", "TC-REG-003",
}

CONFIG_BLOCKED = {
    "TC-AUTH-006", "TC-AUTH-009", "TC-AUTH-010", "TC-AUTH-014", "TC-AUTH-015",
    "TC-ONB-001", "TC-ONB-002", "TC-ONB-003", "TC-ONB-004", "TC-ONB-005", "TC-ONB-006",
    "TC-PUB-013",
    "TC-LIVE-005",
    "TC-REG-005", "TC-REG-006", "TC-REG-008", "TC-REG-009", "TC-REG-012", "TC-REG-013",
    "TC-JRN-001", "TC-JRN-002", "TC-JRN-004",
    "TC-BILL-002", "TC-BILL-003", "TC-BILL-005",
    "TC-SES-004",
    "TC-API-003",
    "TC-FB-004",
    "TC-SCH-004", "TC-SET-010", "TC-INT-001", "TC-INT-002", "TC-INT-003", "TC-INT-004", "TC-INT-005",
    "TC-SCH-005",
    "TC-COM-002", "TC-COM-003", "TC-COM-004", "TC-JRN-005",
    "TC-COD-002", "TC-COD-005",
    "TC-NTF-002",
    "TC-BR-003", "TC-BR-004",
}

SCOPE_OUT = {
    "TC-PUB-007", "TC-PUB-008",  # mailto: DevTools canceled is expected
    "TC-PUB-011", "TC-PUB-012", "TC-PUB-014",
    "TC-COD-002", "TC-COD-005",
    "TC-SCH-004", "TC-SET-010", "TC-INT-001", "TC-INT-002", "TC-INT-003", "TC-INT-004", "TC-INT-005",
}

# Graceful failure Pass rows (expected behavior, not remaining bugs)
EXPECTED_GRACEFUL = {
    "TC-PC-005", "TC-PC-006", "TC-PC-013", "TC-PC-014", "TC-PC-016",
    "TC-AI-002", "TC-AI-003", "TC-AI-006",
    "TC-MOCK-007", "TC-MOCK-005",
    "TC-DOC-001", "TC-DOC-005", "TC-DOC-009", "TC-DOC-004",
    "TC-FB-001", "TC-FB-003", "TC-FB-005",
    "TC-BILL-004",
    "TC-COM-001",
    "TC-DASH-003", "TC-ANS-005", "TC-SES-003", "TC-AN-002", "TC-REP-005",
}

# Pass with residual notes that are closed or non-blocking after remediations
PASS_NOTES_CLOSED = {
    "TC-GOV-001": "search-exams returns 200 in live probe; hub usable",
    "TC-BILL-001": "billing page functional; loader.min.js localhost noise is third-party checkout artifact, not app resource leak",
    "TC-ADM-002": "Actions column header present in AdminUsers",
    "TC-ADM-019": "Back button present on AdminGovSources",
    "TC-SES-005": "access denied path works; full cross-user history validation needs seeded session fixtures (test data gap)",
    "TC-DOC-001": "upload + honest 422 parse failure is correct fail-closed behavior",
}

ROOT_CAUSES = {
    "RC-RESP-LAYOUT": ["TC-RSP-001", "TC-RSP-002", "TC-RSP-003", "TC-RSP-004", "TC-RSP-005", "TC-RSP-006", "TC-RSP-007"],
    "RC-SEARCH-EXAMS-API": ["TC-GOV-001", "TC-GOV-002", "TC-GOV-005", "TC-GOV-006", "TC-GOV-007", "TC-GOV-008",
                           "TC-REG-003", "TC-REG-004", "TC-REG-007", "TC-REG-011", "TC-JRN-003",
                           "TC-ADM-021", "TC-API-005", "TC-FB-002"],
    "RC-AUTH-401-EDGE": ["TC-REG-005", "TC-REG-006", "TC-REG-008", "TC-REG-009", "TC-REG-012", "TC-REG-013",
                        "TC-PREP-003", "TC-PREP-005", "TC-PREP-006", "TC-LRN-003", "TC-COD-003", "TC-COD-004",
                        "TC-SCH-001", "TC-FB-004", "TC-API-003"],
    "RC-TRANSCRIPTION": ["TC-JRN-001", "TC-SES-004", "TC-REG-008", "TC-REG-009"],
    "RC-RAZORPAY-BILLING": ["TC-BILL-002", "TC-BILL-003", "TC-BILL-005", "TC-JRN-004", "TC-REG-006", "TC-REG-013", "DEF-003"],
    "RC-PARSE-RESUME": ["TC-JRN-002", "TC-DOC-001", "TC-DOC-005", "TC-DOC-009"],
    "RC-SETTINGS-PERSIST": ["TC-SET-001", "TC-SET-003", "TC-SET-004", "TC-SET-005", "TC-SET-013", "TC-NTF-004"],
    "RC-CALENDAR-501": ["TC-SCH-004", "TC-SET-010", "TC-INT-001", "TC-INT-002", "TC-INT-003", "TC-INT-004", "TC-INT-005"],
    "RC-OAUTH-PROVIDER": ["TC-AUTH-014", "TC-PUB-013"],
    "RC-EMAIL-RESEND": ["TC-ONB-001", "TC-AUTH-010", "TC-SCH-005"],
    "RC-COMMUNITY-EMPTY": ["TC-COM-002", "TC-COM-003", "TC-COM-004", "TC-JRN-005"],
    "RC-PROFILE-TIMEOUT": ["DEF-001"],
    "RC-DIALOG-TITLE": ["DEF-002"],
}


def classify(row: dict) -> dict:
    tid = row["id"]
    status = (row["original_status"] or "").strip()
    status_norm = status.lower()
    module = row.get("module") or ""
    hits = row.get("problem_hits") or []

    disposition = "OPEN"
    impl = "needs_review"
    prompt = PROMPT_MAP.get(module, "unassigned")
    blocker = None
    root = None

    for rc, ids in ROOT_CAUSES.items():
        if tid in ids or tid.replace("DEF-", "DEF-") in ids:
            root = rc
            break

    if tid in FIXED:
        disposition = "FIXED_IN_CODE"
        impl = "verified_or_code_confirmed"
        prompt = prompt if prompt != "unassigned" else "P4-responsive"
    elif tid in EXPECTED_GRACEFUL:
        disposition = "EXPECTED_BEHAVIOR"
        impl = "no_change"
    elif tid in PASS_NOTES_CLOSED:
        disposition = "PASS_NOTE_CLOSED"
        impl = "verified"
        blocker = None
    elif tid in CONFIG_BLOCKED:
        disposition = "CONFIGURATION_BLOCKED"
        impl = "code_ready_or_external"
        blocker = "external_provider_or_ops_config"
    elif tid in SCOPE_OUT:
        disposition = "PRODUCT_SCOPE"
        impl = "by_design_or_not_shipped"
    elif status_norm == "pass" and not row.get("has_problem_language"):
        disposition = "PASS_CLEAN"
        impl = "no_change"
    elif status_norm == "pass" and row.get("has_problem_language"):
        # residual pass notes
        if tid in PASS_NOTES_CLOSED:
            disposition = "PASS_NOTE_CLOSED"
        else:
            disposition = "PASS_WITH_RESIDUAL_NOTE"
            impl = "classified_non_blocking_or_needs_fixture"
    elif status_norm in ("not run",):
        if tid in ("TC-BR-003", "TC-BR-004"):
            disposition = "CONFIGURATION_BLOCKED"
            blocker = "safari_firefox_matrix_not_run"
        else:
            disposition = "NOT_RUN_REVISITED"
            impl = "still_requires_manual_execution"
            blocker = "manual_qa_slot"
    elif status_norm == "fail":
        if root == "RC-RESP-LAYOUT":
            disposition = "FIXED_IN_CODE"
            impl = "verified_layout_probe"
        elif root in ("RC-SEARCH-EXAMS-API",) or tid in (
            "TC-REG-004", "TC-REG-007", "TC-REG-011", "TC-JRN-003", "TC-GOV-002",
            "TC-GOV-005", "TC-GOV-006", "TC-GOV-007", "TC-GOV-008", "TC-ADM-021",
            "TC-API-005", "TC-FB-002",
        ):
            disposition = "UPSTREAM_FIXED_NEEDS_UAT"
            impl = "search_exams_200_retest_flow"
            blocker = "manual_uat_after_search_fix"
        elif root in ("RC-AUTH-401-EDGE", "RC-TRANSCRIPTION", "RC-RAZORPAY-BILLING", "RC-EMAIL-RESEND", "RC-OAUTH-PROVIDER"):
            disposition = "CONFIGURATION_BLOCKED"
            blocker = root
        elif root == "RC-SETTINGS-PERSIST":
            disposition = "FIXED_IN_CODE"
            impl = "settings_persistence_paths_verified"
        elif root == "RC-CALENDAR-501":
            disposition = "PRODUCT_SCOPE"
            impl = "calendar_sync_not_implemented_501"
            blocker = "RC-CALENDAR-501"
        else:
            disposition = "OPEN_NEEDS_CODE_VERIFY"
            impl = "fail_not_yet_mapped"
    elif status_norm == "blocked":
        if tid in (
            "TC-REG-004", "TC-REG-007", "TC-REG-011", "TC-JRN-003",
            "TC-GOV-005", "TC-GOV-006", "TC-GOV-007", "TC-GOV-008", "TC-ADM-021",
            "TC-API-005", "TC-FB-002",
        ):
            disposition = "UPSTREAM_FIXED_NEEDS_UAT"
            impl = "search_exams_200_retest_flow"
            blocker = "manual_uat_after_search_fix"
        elif tid in CONFIG_BLOCKED:
            disposition = "CONFIGURATION_BLOCKED"
            impl = "code_ready_or_external"
            blocker = "external_provider_or_ops_config"
        else:
            disposition = "BLOCKED_REVISITED"
            impl = "upstream_or_config"
            blocker = blocker or "see_root_cause"
    else:
        disposition = "OPEN_NEEDS_CODE_VERIFY"

    # Extra bugs — only override when not already classified FIXED
    if tid.startswith("DEF-") and disposition not in ("FIXED_IN_CODE", "PASS_NOTE_CLOSED"):
        crossref = {
            "DEF-001": "ExamSearchCombobox abort loop + profile timeout hardened (BUG-003)",
            "DEF-002": "DialogTitle present in CommandDialog (BUG-009)",
            "DEF-003": "CSP script-src includes cdn.razorpay.com (BUG-030)",
            "DEF-BILL-002": "India sandbox checkout copy + card guidance (BUG-030)",
            "DEF-BILL-003": "validate/account mapped to actionable checkout errors (BUG-030)",
            "DEF-INT-001": "Calendar not_configured disables Connect CTA (BUG-006)",
            "DEF-PUB-013": "OAuth readiness hides CTA; callback URL builder (BUG-018)",
            "DEF-HELP-COPY": "helpCatalogCopy shared Help/footer catalog (BUG-012)",
            "DEF-GOV-QD-001": "Quick Drill AI fill + assembly; 409 shortage not 422 (BUG-002)",
        }
        if tid in crossref:
            disposition = "FIXED_IN_CODE"
            impl = crossref.get(tid, impl)

    return {
        **row,
        "root_cause": root,
        "prompt_handled": prompt,
        "implementation_status": impl,
        "remaining_blocker": blocker,
        "final_disposition": disposition,
        "pass_note_resolution": PASS_NOTES_CLOSED.get(tid),
    }


def main():
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    cases = [classify(c) for c in raw["cases"]]

    # Append DEF extras as synthetic rows if not already
    existing = {c["id"] for c in cases}
    for e in raw.get("extras") or []:
        did = e.get("Defect ID")
        if not did or did in existing:
            continue
        syn = {
            "id": did,
            "module": e.get("Module"),
            "feature": e.get("Title"),
            "priority": e.get("Severity (P0-P4)"),
            "severity": e.get("Severity (P0-P4)"),
            "original_status": e.get("Status") or "New",
            "defect_id": did,
            "actual": e.get("Actual") or "",
            "notes": e.get("Expected") or "",
            "problem_hits": [],
            "has_problem_language": True,
            "links": [e.get("Steps to Reproduce__hyperlink")] if e.get("Steps to Reproduce__hyperlink") else [],
            "malformed_links": [],
            "comments": None,
            "screenshot_req": e.get("Evidence Links") or "",
        }
        cases.append(classify(syn))

    by_disp = Counter(c["final_disposition"] for c in cases)
    by_module = Counter(c.get("module") or "?" for c in cases)

    # Screenshots / links
    link_count = sum(len(c.get("links") or []) for c in cases)
    malformed = sum(len(c.get("malformed_links") or []) for c in cases)
    shot_rows = sum(1 for c in cases if c.get("screenshot_req") and "http" in str(c.get("screenshot_req")))

    payload = {
        "meta": {
            "workbook": "Clarify_AI_BB_Manual_QA_Workbook (2).xlsx",
            "total_cases": len(cases),
            "disposition_counts": dict(by_disp),
            "module_counts": dict(by_module),
            "link_refs": link_count,
            "malformed_links": malformed,
            "screenshot_link_rows": shot_rows,
            "root_cause_groups": {k: v for k, v in ROOT_CAUSES.items()},
        },
        "cases": cases,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    lines = [
        "# Final BB Manual QA Coverage Ledger",
        "",
        f"Total IDs: **{len(cases)}**",
        "",
        "## Disposition counts",
        "",
    ]
    for k, v in sorted(by_disp.items(), key=lambda x: -x[1]):
        lines.append(f"- {k}: {v}")
    lines += ["", "## Per-case summary", "", "| ID | Status | Disposition | Root | Blocker |", "|----|--------|-------------|------|---------|"]
    for c in cases:
        lines.append(
            f"| {c['id']} | {c['original_status']} | {c['final_disposition']} | {c.get('root_cause') or '-'} | {c.get('remaining_blocker') or '-'} |"
        )
    MD.write_text("\n".join(lines), encoding="utf-8")
    print("WROTE", OUT)
    print("WROTE", MD)
    print("dispositions", by_disp)
    open_ids = [c["id"] for c in cases if c["final_disposition"] in ("OPEN_NEEDS_CODE_VERIFY", "OPEN_P1_CANDIDATE")]
    print("OPEN", len(open_ids), open_ids[:40])


if __name__ == "__main__":
    main()
