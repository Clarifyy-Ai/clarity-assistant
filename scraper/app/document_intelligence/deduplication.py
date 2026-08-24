"""Deterministic Question Deduplication, Multi-Signal Similarity, and Current Affairs Lifecycle."""
from __future__ import annotations

from datetime import date, datetime
import hashlib
import re
from typing import Any
from app.shared.algorithm_catalog import dedup_spec


def normalize_text(text: str) -> str:
    """Normalizes whitespace, casing, and punctuation for robust comparison."""
    t = text.lower()
    t = re.sub(r"[^\w\s]", " ", t)
    t = re.sub(r"\s+", " ", t)
    return t.strip()


def compute_normalized_hash(text: str, options: list[str] | None = None) -> str:
    """Computes SHA-256 over normalized stem and sorted normalized options."""
    norm_stem = normalize_text(text)
    norm_opts = sorted([normalize_text(o) for o in (options or [])])
    payload = f"{norm_stem}::" + "|".join(norm_opts)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def compute_template_fingerprint(text: str) -> str:
    """Replaces numeric literals, dates, and named entity markers with tokens to detect template clones."""
    norm = normalize_text(text)
    norm = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2", norm)
    # Replace numbers/floats with <NUM>
    norm = re.sub(r"\b\d+(?:\.\d+)?\b", "<NUM>", norm)
    # Replace common variable letters
    norm = re.sub(r"\b[xyzabc]\b", "<VAR>", norm)
    return norm


def char_ngrams(text: str, n: int = 3) -> set[str]:
    """Extracts character n-grams from normalized text."""
    s = normalize_text(text).replace(" ", "")
    if len(s) < n:
        return {s} if s else set()
    return {s[i : i + n] for i in range(len(s) - n + 1)}


def ngram_jaccard_similarity(text_a: str, text_b: str, n: int = 3) -> float:
    """Computes Jaccard index between character n-gram sets."""
    set_a = char_ngrams(text_a, n)
    set_b = char_ngrams(text_b, n)
    if not set_a and not set_b:
        return 1.0
    if not set_a or not set_b:
        return 0.0
    intersection = len(set_a & set_b)
    union = len(set_a | set_b)
    return intersection / union if union > 0 else 0.0


def token_jaccard_similarity(text_a: str, text_b: str) -> float:
    """Computes token-level Jaccard similarity."""
    clean_a = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2", normalize_text(text_a))
    clean_b = re.sub(r"(\d+)([a-zA-Z]+)", r"\1 \2", normalize_text(text_b))
    tokens_a = set(clean_a.split())
    tokens_b = set(clean_b.split())
    if not tokens_a and not tokens_b:
        return 1.0
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = len(tokens_a & tokens_b)
    union = len(tokens_a | tokens_b)
    return intersection / union if union > 0 else 0.0


def compute_option_set_fingerprint(options: list[str]) -> str:
    """Generates a stable option-set fingerprint."""
    norm_opts = sorted([normalize_text(o) for o in options if normalize_text(o)])
    return hashlib.md5("|".join(norm_opts).encode("utf-8")).hexdigest()


class QuestionDeduplicationEngine:
    """Multi-signal question similarity and duplicate decision engine."""

    def __init__(
        self,
        exact_threshold: float | None = None,
        near_dup_threshold: float | None = None,
        template_clone_threshold: float | None = None,
    ) -> None:
        policy = dedup_spec()
        self.exact_threshold = 1.0 if exact_threshold is None else exact_threshold
        self.near_dup_threshold = (
            float(policy["near_duplicate_composite"])
            if near_dup_threshold is None else near_dup_threshold
        )
        self.template_clone_threshold = (
            float(policy["template_clone_similarity"])
            if template_clone_threshold is None else template_clone_threshold
        )

    def evaluate_pair(
        self,
        q1_text: str,
        q1_options: list[str],
        q2_text: str,
        q2_options: list[str],
        q2_id: str | None = None,
    ) -> dict[str, Any]:
        """Evaluates similarity between two questions across multiple signals."""
        h1 = compute_normalized_hash(q1_text, q1_options)
        h2 = compute_normalized_hash(q2_text, q2_options)

        # 1. Exact hash match
        if h1 == h2:
            return {
                "decision": "exact_duplicate",
                "similarity_score": 1.0,
                "token_jaccard": 1.0,
                "ngram_jaccard": 1.0,
                "fingerprint_match": True,
                "matching_question_id": q2_id,
            }

        # 2. Token & n-gram continuous metrics
        token_sim = token_jaccard_similarity(q1_text, q2_text)
        ngram_sim = ngram_jaccard_similarity(q1_text, q2_text, n=3)

        # Option set similarity
        opt1_set = set(normalize_text(o) for o in q1_options)
        opt2_set = set(normalize_text(o) for o in q2_options)
        opt_overlap = (
            len(opt1_set & opt2_set) / len(opt1_set | opt2_set)
            if (opt1_set or opt2_set)
            else 0.0
        )

        stem_max_sim = max(token_sim, ngram_sim)
        shorter, longer = sorted(
            (normalize_text(q1_text), normalize_text(q2_text)), key=len,
        )
        containment = (
            len(shorter) / len(longer)
            if shorter and shorter in longer
            else 0.0
        )
        weights = dedup_spec()["composite_weights"]
        composite_score = (
            token_sim * float(weights["token"])
            + ngram_sim * float(weights["ngram"])
            + opt_overlap * float(weights["option_overlap"])
        )

        # 3. Template clone check
        tpl1 = compute_template_fingerprint(q1_text)
        tpl2 = compute_template_fingerprint(q2_text)
        tpl_sim = token_jaccard_similarity(tpl1, tpl2)
        is_template_clone = (tpl1 == tpl2 or tpl_sim >= self.template_clone_threshold) and h1 != h2

        policy = dedup_spec()
        if is_template_clone:
            decision = "template_clone"
        elif (
            composite_score >= self.near_dup_threshold
            or (
                opt_overlap >= float(policy["option_overlap_near"])
                and stem_max_sim >= float(policy["stem_max_near_with_options"])
            )
            or stem_max_sim >= float(policy["stem_max_near"])
            or containment >= float(policy["stem_only_conflict"])
        ):
            decision = "near_duplicate"
        elif (
            composite_score >= float(policy["review_composite"])
            or (
                opt_overlap > float(policy["review_option_overlap"])
                and stem_max_sim >= float(policy["review_stem_max"])
            )
        ):
            decision = "flagged_for_review"
        else:
            decision = "unique"

        return {
            "decision": decision,
            "similarity_score": round(composite_score, 4),
            "token_jaccard": round(token_sim, 4),
            "ngram_jaccard": round(ngram_sim, 4),
            "template_similarity": round(tpl_sim, 4),
            "fingerprint_match": False,
            "matching_question_id": q2_id,
        }


# ── Current Affairs Lifecycle & Staleness Evaluator ───────────────────────────

def evaluate_current_affairs_staleness(
    applicable_date: date | str | None,
    cutoff_date: date | str | None,
    expiry_date: date | str | None,
    reference_date: date | None = None,
) -> dict[str, Any]:
    """Determines if a current-affairs question has become stale based on expiry and cutoff dates."""
    today = reference_date or date.today()

    def parse_dt(v: date | str | None) -> date | None:
        if v is None:
            return None
        if isinstance(v, date):
            return v
        try:
            return datetime.strptime(v[:10], "%Y-%m-%d").date()
        except Exception:
            return None

    app_dt = parse_dt(applicable_date)
    cut_dt = parse_dt(cutoff_date)
    exp_dt = parse_dt(expiry_date)

    is_stale = False
    reason = None

    if exp_dt and exp_dt < today:
        is_stale = True
        reason = f"Current affairs content expired on {exp_dt.isoformat()} (today is {today.isoformat()})."
    elif cut_dt:
        days_since_cutoff = (today - cut_dt).days
        if days_since_cutoff > 365:
            is_stale = True
            reason = f"Current affairs content exceeds 1-year relevancy window (cutoff: {cut_dt.isoformat()})."

    return {
        "is_stale": is_stale,
        "reason": reason,
        "applicable_date": app_dt.isoformat() if app_dt else None,
        "cutoff_date": cut_dt.isoformat() if cut_dt else None,
        "expiry_date": exp_dt.isoformat() if exp_dt else None,
    }
