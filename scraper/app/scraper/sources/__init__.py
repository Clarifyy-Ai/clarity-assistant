"""Registry of source-specific scrapers, keyed by exam_type id."""
from __future__ import annotations

from typing import Type

from app.scraper.base import BaseScraper
from app.scraper.sources.upsc import UpscScraper

_REGISTRY: dict[str, Type[BaseScraper]] = {
    "UPSC": UpscScraper,
    # "SSC_CGL": SscScraper,
    # "GATE":    GateScraper,
    # "IBPS_PO": IbpsScraper,
}


def get_scraper_for(exam_type: str) -> Type[BaseScraper] | None:
    return _REGISTRY.get(exam_type.upper())


def supported_exam_types() -> list[str]:
    return sorted(_REGISTRY.keys())
