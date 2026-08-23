"""Candidate normalisation, validation, deduplication and quality scoring.

Reuses the deterministic validators and the multi-signal dedup engine already used by
the document-intelligence pipeline, and mirrors the Edge quality floor
(`MIN_BANK_QUESTION_QUALITY = 40` in `_shared/govQualityScore.ts`).
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Any, Iterable, Sequence

from app.document_intelligence.deduplication import (
    char_ngrams,
    compute_normalized_hash,
    compute_template_fingerprint,
    normalize_text,
)
from app.document_intelligence.question_validators import validate_question_integrity
from app.paper_factory.models import Difficulty, GenerationSlot, PaperQuestion

MIN_QUALITY_SCORE = 40.0
REQUIRED_OPTION_COUNT = 4

_LETTER_RE = re.compile(r"^\(?\s*([A-Za-z])\s*\)?$")
_BANNED_PATTERNS = (
    re.compile(r"!\[[^\]]*\]\([^)]*\)"),
    re.compile(r"reference\s+image", re.I),
    re.compile(r"https?://\S+\.(?:png|jpe?g|gif|webp|svg)", re.I),
)


def normalize_options(raw: Any) -> list[str]:
    """Coerce a model's option payload into an ordered list of option texts."""
    if not isinstance(raw, (list, tuple)):
        return []
    options: list[str] = []
    for item in raw:
        if isinstance(item, dict):
            text = item.get("text") or item.get("value") or item.get("option") or ""
        else:
            text = item
        cleaned = re.sub(r"\s+", " ", str(text or "")).strip()
        cleaned = re.sub(r"^\(?[A-Da-d]\)?[.):\-]\s+", "", cleaned)
        options.append(cleaned)
    return options


def resolve_correct_index(value: Any, option_count: int) -> int | None:
    """Resolve a letter (`B`), 1-based number (`2`) or 0-based index into an index."""
    if value is None or option_count <= 0:
        return None
    raw = str(value).strip()
    if not raw:
        return None

    match = _LETTER_RE.match(raw)
    if match:
        index = ord(match.group(1).upper()) - 65
        return index if 0 <= index < option_count else None

    if raw.isdigit():
        number = int(raw)
        if 1 <= number <= option_count:
            return number - 1
        if 0 <= number < option_count:
            return number
    return None


def _stem_length_score(stem: str) -> float:
    length = len(stem.strip())
    if length < 20:
        return 20.0
    if length < 40:
        return 60.0
    if length <= 600:
        return 100.0
    if length <= 900:
        return 70.0
    return 40.0


def quality_score(
    *,
    stem: str,
    options: Sequence[str],
    correct_index: int,
    explanation: str,
    max_similarity: float,
    fingerprint_unique: bool,
    source_confidence: float,
) -> float:
    """Weighted 0-100 score mirroring the Edge scoring components."""
    distinct = len({normalize_text(o) for o in options if normalize_text(o)})
    structure = 100.0
    if len(options) != REQUIRED_OPTION_COUNT:
        structure -= 40.0
    if distinct != len(options):
        structure -= 40.0
    if not 0 <= correct_index < len(options):
        structure = 0.0
    structure = max(0.0, structure)

    similarity = max(0.0, 100.0 * (1.0 - max(0.0, min(1.0, max_similarity))))
    explanation_score = 100.0 if len(explanation.strip()) >= 40 else (
        60.0 if explanation.strip() else 0.0
    )

    score = (
        structure * 0.30
        + similarity * 0.25
        + _stem_length_score(stem) * 0.15
        + explanation_score * 0.10
        + max(0.0, min(100.0, source_confidence)) * 0.10
        + (100.0 if fingerprint_unique else 0.0) * 0.10
    )
    return round(score, 2)


@dataclass
class ValidationOutcome:
    question: PaperQuestion | None
    reason: str | None = None

    @property
    def accepted(self) -> bool:
        return self.question is not None


def _jaccard(left: set[str], right: set[str]) -> float:
    if not left and not right:
        return 1.0
    if not left or not right:
        return 0.0
    union = len(left | right)
    return len(left & right) / union if union else 0.0


@dataclass(frozen=True)
class _Signature:
    """Precomputed similarity signals for one question.

    Comparing a candidate against a 100-question paper is quadratic, so every set is
    computed once when the question is accepted rather than on each comparison.
    """

    stem: str
    tokens: frozenset[str]
    ngrams: frozenset[str]
    template: str
    template_tokens: frozenset[str]
    options: frozenset[str]


def _tokenize(text: str) -> frozenset[str]:
    # Matches `token_jaccard_similarity`: split digits from trailing letters first.
    cleaned = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2", normalize_text(text))
    return frozenset(cleaned.split())


def build_signature(stem: str, options: Sequence[str]) -> _Signature:
    template = compute_template_fingerprint(stem)
    return _Signature(
        stem=stem,
        tokens=_tokenize(stem),
        ngrams=frozenset(char_ngrams(stem, 3)),
        template=template,
        template_tokens=_tokenize(template),
        options=frozenset(
            normalize_text(option) for option in options if normalize_text(option)
        ),
    )


@dataclass
class CandidateValidator:
    """Stateful validator that rejects duplicates against the whole paper and bank."""

    near_duplicate_threshold: float = 0.85
    template_clone_threshold: float = 0.85
    _fingerprints: set[str] = field(default_factory=set)
    _signatures: list[_Signature] = field(default_factory=list)

    def seed_existing(self, items: Iterable[tuple[str, Sequence[str]]]) -> None:
        """Register already-known questions (bank items) so AI output cannot clone them."""
        for stem, options in items:
            option_list = [str(o) for o in options]
            self._fingerprints.add(compute_normalized_hash(stem, option_list))
            self._signatures.append(build_signature(stem, option_list))

    def register(self, question: PaperQuestion) -> None:
        self._fingerprints.add(
            compute_normalized_hash(question.question_text, question.options)
        )
        self._signatures.append(
            build_signature(question.question_text, question.options)
        )

    @property
    def accepted_stems(self) -> list[str]:
        return [signature.stem for signature in self._signatures]

    def _max_similarity(
        self, stem: str, options: Sequence[str]
    ) -> tuple[float, str | None]:
        """Return (worst composite similarity, rejection verdict or None).

        Mirrors the decision thresholds of `QuestionDeduplicationEngine.evaluate_pair`
        using cached signatures.
        """
        candidate = build_signature(stem, [str(option) for option in options])
        worst = 0.0

        for other in self._signatures:
            if (
                candidate.template == other.template
                or _jaccard(candidate.template_tokens, other.template_tokens)
                >= self.template_clone_threshold
            ):
                return 1.0, "template_clone"

            token_sim = _jaccard(candidate.tokens, other.tokens)
            ngram_sim = _jaccard(candidate.ngrams, other.ngrams)
            option_overlap = _jaccard(candidate.options, other.options)
            stem_max = max(token_sim, ngram_sim)
            composite = token_sim * 0.4 + ngram_sim * 0.4 + option_overlap * 0.2

            if (
                composite >= self.near_duplicate_threshold
                or (option_overlap >= 0.8 and stem_max >= 0.6)
                or stem_max >= 0.85
            ):
                return 1.0, "near_duplicate"

            if composite > worst:
                worst = composite

        return worst, None

    def evaluate(
        self,
        candidate: dict[str, Any],
        *,
        slot: GenerationSlot,
        marks_positive: float,
        marks_negative: float,
        language: str = "en",
        source_confidence: float = 60.0,
    ) -> ValidationOutcome:
        """Normalise and validate one AI candidate against every hard rule."""
        stem = re.sub(r"\s+", " ", str(candidate.get("question_text") or "")).strip()
        if len(stem) < 15:
            return ValidationOutcome(None, "stem_too_short")

        for pattern in _BANNED_PATTERNS:
            if pattern.search(stem):
                return ValidationOutcome(None, "banned_media_reference")

        options = normalize_options(candidate.get("options"))
        if len(options) != REQUIRED_OPTION_COUNT:
            return ValidationOutcome(None, "option_count_not_four")
        if any(not option for option in options):
            return ValidationOutcome(None, "empty_option")
        if len({normalize_text(o) for o in options}) != len(options):
            return ValidationOutcome(None, "duplicate_options")

        correct_index = resolve_correct_index(candidate.get("correct_answer"), len(options))
        if correct_index is None:
            return ValidationOutcome(None, "unresolvable_correct_answer")

        explanation = re.sub(
            r"\s+", " ", str(candidate.get("explanation") or "")
        ).strip()

        integrity = validate_question_integrity(
            {
                "question_text": stem,
                "options": [{"text": option} for option in options],
                "correct_answer": chr(65 + correct_index),
                "marks_positive": marks_positive,
                "marks_negative": marks_negative,
                "language": language,
                "source": "AI_GENERATED",
            }
        )
        if not integrity["is_valid"]:
            first = str(integrity["errors"][0]) if integrity["errors"] else "integrity_failed"
            return ValidationOutcome(None, f"integrity: {first}")

        fingerprint = compute_normalized_hash(stem, options)
        if fingerprint in self._fingerprints:
            return ValidationOutcome(None, "exact_duplicate")

        max_similarity, verdict = self._max_similarity(stem, options)
        if verdict is not None:
            return ValidationOutcome(None, verdict)
        if max_similarity >= self.near_duplicate_threshold:
            return ValidationOutcome(None, "near_duplicate")

        score = quality_score(
            stem=stem,
            options=options,
            correct_index=correct_index,
            explanation=explanation,
            max_similarity=max_similarity,
            fingerprint_unique=True,
            source_confidence=source_confidence,
        )
        if score < MIN_QUALITY_SCORE:
            return ValidationOutcome(None, f"quality_below_floor:{score}")

        difficulty = str(candidate.get("difficulty") or slot.difficulty).strip().upper()
        if difficulty not in ("EASY", "MEDIUM", "HARD"):
            difficulty = slot.difficulty

        question = PaperQuestion(
            question_text=stem,
            options=options,
            correct_index=correct_index,
            section_code=slot.section_code,
            subject=slot.section_name,
            topic=slot.topic,
            difficulty=difficulty,
            explanation=explanation,
            marks_positive=marks_positive,
            marks_negative=marks_negative,
            source_class="generated",
            quality_score=score,
        )
        self.register(question)
        return ValidationOutcome(question)
