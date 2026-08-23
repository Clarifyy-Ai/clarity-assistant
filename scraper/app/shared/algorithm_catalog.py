"""Load the shared algorithm catalog (quality + dedup versions/weights)."""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any

_HERE = Path(__file__).resolve().parent
_CANDIDATES = (
    _HERE / "algorithm_catalog.json",
    _HERE.parents[2] / "shared" / "algorithm-catalog.json",
)


@lru_cache(maxsize=1)
def load_algorithm_catalog() -> dict[str, Any]:
    for path in _CANDIDATES:
        if path.is_file():
            return json.loads(path.read_text(encoding="utf-8"))
    raise FileNotFoundError("algorithm_catalog.json is missing from the Python package")


def quality_spec() -> dict[str, Any]:
    return load_algorithm_catalog()["quality"]


def dedup_spec() -> dict[str, Any]:
    return load_algorithm_catalog()["dedup"]


def quality_algorithm_version() -> str:
    return str(load_algorithm_catalog()["quality_algorithm_version"])


def dedup_algorithm_version() -> str:
    return str(load_algorithm_catalog()["dedup_algorithm_version"])


def paper_blueprint_version() -> str:
    return str(load_algorithm_catalog()["paper_blueprint_version"])
