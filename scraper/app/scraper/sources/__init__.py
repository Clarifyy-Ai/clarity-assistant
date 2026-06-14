"""Registry of source-specific scrapers, keyed by exam_type id."""
from __future__ import annotations

from typing import Type

from app.scraper.base import BaseScraper
from app.scraper.sources.upsc import UpscScraper


class _NotImplementedScraper(BaseScraper):
    """Placeholder for sources that are listed but not yet implemented.

    Returns a clear admin-visible error instead of a 500 stack trace.
    """

    exam_type = "PENDING"

    async def discover(self, year_from, year_to):  # type: ignore[override]
        raise NotImplementedError(
            f"Scraper for '{self.exam_type}' is not yet implemented. "
            "Add a source module under app/scraper/sources/."
        )
        if False:  # pragma: no cover
            yield  # type: ignore[unreachable]

    async def parse(self, paper):  # type: ignore[override]
        raise NotImplementedError(self.exam_type)


def _stub(name: str) -> Type[BaseScraper]:
    return type(f"{name}Scraper", (_NotImplementedScraper,), {"exam_type": name})


_REGISTRY: dict[str, Type[BaseScraper]] = {
    "UPSC": UpscScraper,
    "SSC_CGL": _stub("SSC_CGL"),
    "IBPS_PO": _stub("IBPS_PO"),
    "GATE": _stub("GATE"),
    "NEET": _stub("NEET"),
    "JEE_MAIN": _stub("JEE_MAIN"),
    "JEE_ADVANCED": _stub("JEE_ADVANCED"),
    "NDA": _stub("NDA"),
}


def get_scraper_for(exam_type: str) -> Type[BaseScraper] | None:
    return _REGISTRY.get(exam_type.upper())


def supported_exam_types() -> list[str]:
    return sorted(_REGISTRY.keys())
