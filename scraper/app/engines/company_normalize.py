"""Deterministic company identity normalization from provided facts only."""

from __future__ import annotations

import re
from typing import Any
from urllib.parse import urlparse

from app.core.logger import get_logger
from app.engines.schemas import EngineError

log = get_logger("engines.company_normalize")


def _looks_like_url(value: str) -> bool:
    trimmed = value.strip()
    if re.match(r"^https?://", trimmed, re.I):
        return True
    if re.match(r"^www\.", trimmed, re.I):
        return True
    return bool(
        re.match(r"^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}(/.*)?$", trimmed, re.I)
        and " " not in trimmed
    )


def normalize_company_name(name: str | None) -> str:
    value = str(name or "").strip()
    if _looks_like_url(value):
        value = value.lower()
        value = re.sub(r"^https?://", "", value, flags=re.I)
        value = re.sub(r"^www\.", "", value, flags=re.I)
        value = value.rstrip("/")
        slash = value.find("/")
        if slash > 0:
            value = value[:slash]
    return re.sub(r"\s+", " ", value).strip().lower()


def _normalize_website(website: str | None) -> str | None:
    if not website or not str(website).strip():
        return None
    raw = str(website).strip()
    if not re.match(r"^https?://", raw, re.I):
        raw = f"https://{raw}"
    parsed = urlparse(raw)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    host = parsed.netloc.lower().removeprefix("www.")
    return f"https://{host}"


def run_company_normalize(payload: dict[str, Any], *, operation_id: str, correlation_id: str) -> dict[str, Any]:
    company_name = payload.get("company_name")
    if not isinstance(company_name, str) or not company_name.strip():
        raise EngineError("COMPANY_NAME_REQUIRED", retryable=False)

    log.info(
        "[COMPANY] normalize",
        operation_id=operation_id,
        correlation_id=correlation_id,
    )

    known_facts = payload.get("known_facts")
    facts: dict[str, Any] = dict(known_facts) if isinstance(known_facts, dict) else {}

    normalized_name = normalize_company_name(company_name)
    website = _normalize_website(payload.get("website") or facts.get("website"))

    profile: dict[str, Any] = {
        "company_name": company_name.strip(),
        "company_name_normalized": normalized_name,
        "website": website,
    }

    passthrough_fields = (
        "industry",
        "headquarters",
        "employee_count_range",
        "founded_year",
        "description",
        "products",
        "tech_stack",
        "interview_focus",
        "sources",
    )
    for field in passthrough_fields:
        if field in facts and facts[field] not in (None, "", [], {}):
            profile[field] = facts[field]

    fields_missing = [field for field in passthrough_fields if field not in profile]
    enrichment_recommended = len(fields_missing) >= 3

    log.info("[COMPANY] completed", operation_id=operation_id, correlation_id=correlation_id)
    return {
        "profile": profile,
        "fields_missing": fields_missing,
        "enrichment_recommended": enrichment_recommended,
    }
