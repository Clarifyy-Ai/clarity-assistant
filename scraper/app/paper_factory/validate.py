"""Candidate normalisation, validation, deduplication and quality scoring.

Uses the shared machine-readable catalog (`gov_question_quality_v2` /
`gov_question_dedup_v2`). Provenance is not a quality score.
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
from app.shared.algorithm_catalog import (
    dedup_algorithm_version,
    dedup_spec,
    quality_algorithm_version,
    quality_spec,
)

_QUALITY = quality_spec()
_DEDUP = dedup_spec()
MIN_QUALITY_SCORE = float(_QUALITY["min_bank_question_quality"])
REQUIRED_OPTION_COUNT = 4
QUALITY_ALGORITHM_VERSION = quality_algorithm_version()
DEDUP_ALGORITHM_VERSION = dedup_algorithm_version()

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


def _clamp01(value: float) -> float:
    if value != value:  # NaN
        return 0.0
    return max(0.0, min(1.0, float(value)))


def _normalize_source_confidence(raw: float) -> float:
    """Accept 0–1 or legacy 0–100 values."""
    value = float(raw)
    if value > 1.0:
        value = value / 100.0
    return _clamp01(value)


def _stem_length_unit(stem: str) -> float:
    stem_cfg = _QUALITY["stem"]
    length = len(stem.strip())
    if length < int(stem_cfg["too_short"]):
        return float(stem_cfg["score_too_short"])
    if length < int(stem_cfg["short"]):
        return float(stem_cfg["score_short"])
    if length > int(stem_cfg["too_long"]):
        return float(stem_cfg["score_too_long"])
    return float(stem_cfg["score_ok"])


def quality_score(
    *,
    stem: str,
    options: Sequence[str],
    correct_index: int,
    explanation: str,
    max_similarity: float,
    fingerprint_unique: bool,
    source_confidence: float,
    hard_fail: bool = False,
) -> float:
    """Canonical 0-100 score — same weights as Edge gov_question_quality_v2."""
    weights = _QUALITY["weights"]
    distinct = {normalize_text(o) for o in options if normalize_text(o)}
    structure_ok = (
        len(options) == REQUIRED_OPTION_COUNT
        and len(distinct) == len(options)
        and 0 <= correct_index < len(options)
        and all(normalize_text(o) for o in options)
    )
    unique_ok = structure_ok
    sim = _clamp01(max_similarity)
    if sim >= float(_DEDUP["stem_only_conflict"]):
        hard_fail = True
        sim_unit = 0.0
    else:
        sim_unit = _clamp01(
            1.0
            - max(0.0, sim - float(_QUALITY["similarity_soft_floor"]))
            * float(_QUALITY["similarity_soft_penalty"])
        )
    expl_unit = 1.0 if explanation.strip() else float(_QUALITY["explanation_missing_score"])
    src_unit = _normalize_source_confidence(
        source_confidence if source_confidence else _QUALITY["source_confidence_default"]
    )
    fp_unit = 1.0 if fingerprint_unique else 0.0
    stem_unit = _stem_length_unit(stem)
    if len(stem.strip()) < int(_QUALITY["stem"]["too_short"]):
        hard_fail = True

    components = (
        (float(weights["mcq_structure"]), 1.0 if structure_ok else 0.0),
        (float(weights["answer_uniqueness"]), 1.0 if unique_ok else 0.0),
        (float(weights["similarity"]), sim_unit),
        (float(weights["stem_length"]), stem_unit),
        (float(weights["explanation_present"]), expl_unit),
        (float(weights["source_confidence"]), src_unit),
        (float(weights["fingerprint"]), fp_unit),
    )
    weight_sum = sum(weight for weight, _ in components) or 1.0
    weighted = sum(weight * score for weight, score in components) / weight_sum
    if hard_fail or not structure_ok:
        return 0.0
    return round(weighted * 100.0, 1)


def score_assembled_question(
    *,
    stem: str,
    options: Sequence[str],
    correct_index: int,
    explanation: str = "",
    peers: Sequence[str] = (),
    source_confidence: float = 0.7,
) -> float:
    """Score a bank/generated item with the canonical engine (not provenance)."""
    max_sim = 0.0
    for peer in peers:
        if not peer or peer == stem:
            continue
        from app.document_intelligence.deduplication import (
            ngram_jaccard_similarity,
            token_jaccard_similarity,
        )

        max_sim = max(
            max_sim,
            token_jaccard_similarity(stem, peer),
            ngram_jaccard_similarity(stem, peer, n=3),
        )
    fingerprint = compute_normalized_hash(stem, [str(o) for o in options])
    return quality_score(
        stem=stem,
        options=options,
        correct_index=correct_index,
        explanation=explanation,
        max_similarity=max_sim,
        fingerprint_unique=bool(fingerprint),
        source_confidence=source_confidence,
    )


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

    near_duplicate_threshold: float = float(_DEDUP["near_duplicate_composite"])
    template_clone_threshold: float = float(_DEDUP["template_clone_similarity"])
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
            template_similarity = _jaccard(
                candidate.template_tokens, other.template_tokens
            )
            token_similarity = _jaccard(candidate.tokens, other.tokens)
            if (
                (candidate.template == other.template
                 and token_similarity >= self.template_clone_threshold)
                or (
                    template_similarity >= self.template_clone_threshold
                    and token_similarity >= self.template_clone_threshold
                )
            ):
                return 1.0, "template_clone"

            token_sim = token_similarity
            ngram_sim = _jaccard(candidate.ngrams, other.ngrams)
            option_overlap = _jaccard(candidate.options, other.options)
            stem_max = max(token_sim, ngram_sim)
            cw = _DEDUP["composite_weights"]
            composite = (
                token_sim * float(cw["token"])
                + ngram_sim * float(cw["ngram"])
                + option_overlap * float(cw["option_overlap"])
            )
            shorter, longer = sorted(
                (candidate.stem, other.stem), key=len,
            )
            containment = (
                len(shorter) / len(longer)
                if shorter and shorter in longer
                else 0.0
            )

            if (
                composite >= self.near_duplicate_threshold
                or (
                    option_overlap >= float(_DEDUP["option_overlap_near"])
                    and stem_max >= float(_DEDUP["stem_max_near_with_options"])
                )
                or stem_max >= float(_DEDUP["stem_max_near"])
                or containment >= float(_DEDUP["stem_only_conflict"])
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
        source_confidence: float = 55.0,
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
            source_type="ai_generated_practice",
            language=language,
            quality_score=score,
        )
        self.register(question)
        return ValidationOutcome(question)
