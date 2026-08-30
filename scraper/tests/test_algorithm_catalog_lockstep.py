"""Keep algorithm catalog copies identical across repo root, Docker, and Edge."""
from __future__ import annotations

import hashlib
import hmac
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PYTHON_CATALOG = ROOT / "scraper" / "app" / "shared" / "algorithm_catalog.json"
REPO_CATALOG = ROOT / "shared" / "algorithm-catalog.json"
EDGE_CATALOG = ROOT / "supabase" / "functions" / "_shared" / "algorithmCatalog.ts"

GOLDEN_SECRET = "a" * 32
GOLDEN_BODY = b'{"job_id":"1"}'
GOLDEN_DIGEST = "00b5fec95baaef2391377f8b4bbf4d8a78f0e6f577e123dbf25516cb2385999c"
GOLDEN_SIGNATURE = "5ab85a6bbb6582b8a39d3cae81a6441f9530156adaf4e6876857e2bce5705778"


def test_python_catalog_matches_repo_root() -> None:
    root = json.loads(REPO_CATALOG.read_text(encoding="utf-8"))
    bundled = json.loads(PYTHON_CATALOG.read_text(encoding="utf-8"))
    assert bundled == root
    assert root["quality_algorithm_version"] == "gov_question_quality_v2"
    assert root["dedup_algorithm_version"] == "gov_question_dedup_v2"
    assert root["paper_blueprint_version"] == "gov_paper_v1"
    assert root["quality"]["min_bank_question_quality"] == 40


def test_edge_algorithm_catalog_versions_match() -> None:
    root = json.loads(REPO_CATALOG.read_text(encoding="utf-8"))
    source = EDGE_CATALOG.read_text(encoding="utf-8")
    expected = {
        "CREDIT_CATALOG_VERSION": root["credit_catalog_version"],
        "QUALITY_ALGORITHM_VERSION": root["quality_algorithm_version"],
        "DEDUP_ALGORITHM_VERSION": root["dedup_algorithm_version"],
        "MASTERY_ALGORITHM_VERSION": root["mastery_algorithm_version"],
        "SCORING_ALGORITHM_VERSION": root["scoring_algorithm_version"],
        "PAPER_BLUEPRINT_VERSION": root["paper_blueprint_version"],
    }
    for name, value in expected.items():
        match = re.search(rf'export const {name} = "([^"]+)"', source)
        assert match, f"{name} missing from Edge catalog"
        assert match.group(1) == value
    min_match = re.search(r"export const MIN_BANK_QUESTION_QUALITY = (\d+)", source)
    assert min_match
    assert int(min_match.group(1)) == root["quality"]["min_bank_question_quality"]


def test_hmac_headers_match_edge_fixture() -> None:
    """Same inputs as src/test/lib/edge/pythonHmacLockstep.test.ts."""
    digest = hashlib.sha256(GOLDEN_BODY).hexdigest()
    message = (
        "POST\n/internal/gov-exams/availability\n1700000000\nedge-testreq01\n" + digest
    )
    signature = hmac.new(GOLDEN_SECRET.encode(), message.encode(), hashlib.sha256).hexdigest()
    assert digest == GOLDEN_DIGEST
    assert signature == GOLDEN_SIGNATURE
