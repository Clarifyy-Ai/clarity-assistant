"""AI-driven government exam paper factory.

Plans a paper from the approved exam pattern and syllabus, reuses approved bank items,
generates the remainder with AI, validates every candidate, and publishes a complete
mock paper that matches the blueprint exactly.
"""
from app.paper_factory.blueprint import build_blueprint, validate_assembled_paper
from app.paper_factory.config import FactorySettings, get_factory_settings
from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import (
    AI_PAPER_DISCLAIMER,
    ExamContext,
    PaperBlueprint,
    PaperFactoryError,
    PaperQuestion,
    PaperResult,
)
from app.paper_factory.repository import PaperRepository

__all__ = [
    "AI_PAPER_DISCLAIMER",
    "ExamContext",
    "FactorySettings",
    "GenerationRequest",
    "PaperBlueprint",
    "PaperFactory",
    "PaperFactoryError",
    "PaperQuestion",
    "PaperRepository",
    "PaperResult",
    "build_blueprint",
    "get_factory_settings",
    "validate_assembled_paper",
]
