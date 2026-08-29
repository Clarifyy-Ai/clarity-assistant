"""Extract focused QA cases for remediation — not a test file."""
from __future__ import annotations

import json
from pathlib import Path

SRC = Path(r"C:\Users\TECH-GENIUSES\Downloads\clarity-assistant\_qa_cases_extract.json")
OUT = Path(r"C:\Users\TECH-GENIUSES\Downloads\clarity-assistant\_qa_focus_summary.json")

want_prefixes = ["TC-PUB-", "TC-ADM-", "TC-A11Y-", "TC-COM-", "TC-COD-", "TC-LRN-", "TC-SEC-"]
want_exact = {"TC-JRN-005", "TC-REG-002", "TC-REG-015"}

d = json.loads(SRC.read_text(encoding="utf-8"))
out = []
for tc in d["test_cases"]:
    tid = tc.get("Test Case ID") or ""
    if any(tid.startswith(p) for p in want_prefixes) or tid in want_exact:
        out.append(
            {
                "id": tid,
                "status": tc.get("Pass / Fail"),
                "module": tc.get("Module"),
                "feature": tc.get("Feature"),
                "notes": tc.get("Notes") or "",
                "actual": tc.get("Actual Result") or "",
                "defect": tc.get("Defect ID"),
                "expected": tc.get("Final Expected Result") or "",
                "steps": tc.get("Exact Steps") or "",
                "comments": tc.get("_cell_comments"),
                "urls": tc.get("_urls_in_text"),
                "hyperlinks": tc.get("_hyperlinks"),
            }
        )

OUT.write_text(json.dumps(out, indent=2, ensure_ascii=False), encoding="utf-8")
print("count", len(out))
for o in out:
    notes = (o["notes"] or "").replace("\n", " ")[:140]
    print(f"{o['id']}|{o['status']}|{notes}")
