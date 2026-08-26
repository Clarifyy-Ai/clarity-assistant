"""Deterministic hybrid operation handlers — no external AI calls."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from typing import Any, Callable

from app.document_intelligence.parsers.models import PageResult, ParsedDocument
from app.document_intelligence.parsers.structured import (
    EMAIL,
    PHONE,
    parse_job_description,
    parse_resume,
)
from app.hybrid import SERVICE_VERSION, SUPPORTED_OPERATIONS

# ── helpers ──────────────────────────────────────────────────────────────────

_BULLET = re.compile(r"^[\s]*[-*•]\s*")


def _str(payload: dict[str, Any], *keys: str, default: str = "") -> str:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        text = str(value).strip()
        if text:
            return text
    return default


def _list(payload: dict[str, Any], *keys: str) -> list[str]:
    for key in keys:
        value = payload.get(key)
        if value is None:
            continue
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str) and value.strip():
            return [line.strip() for line in value.splitlines() if line.strip()]
    return []


def _thin(text: str, *, min_chars: int = 24) -> bool:
    return len(text.strip()) < min_chars


def _bulletize(label: str, text: str) -> str:
    cleaned = _BULLET.sub("", text.strip())
    if not cleaned:
        return f"{label}: (not provided)"
    return f"{label}: {cleaned}"


def _document_from_text(text: str, *, filename: str = "input.txt") -> ParsedDocument:
    return ParsedDocument(
        parser_version="hybrid-1.1.0",
        filename=filename,
        media_type="text/plain",
        pages=[
            PageResult(
                page_number=1,
                text=text,
                extraction_method="text",
            )
        ],
        text=text,
        warnings=[],
        confidence=0.85 if text.strip() else 0.1,
        review_required=False,
    )


def _regex_contact_skills(text: str) -> dict[str, Any]:
    contact: dict[str, str] = {}
    email = EMAIL.search(text)
    phone = PHONE.search(text)
    if email:
        contact["email"] = email.group(0)
    if phone:
        contact["phone"] = phone.group(0).strip()
    skills = sorted(
        {
            m.group(0).lower()
            for m in re.finditer(
                r"\b(?:python|java|javascript|typescript|react|sql|aws|docker|"
                r"kubernetes|fastapi|node\.js|machine learning|data analysis|"
                r"communication|leadership|go|rust|c\+\+|kotlin|swift)\b",
                text,
                re.I,
            )
        }
    )
    return {
        "name": None,
        "contact_details": contact,
        "skills": skills,
        "source": "regex_fallback",
        "confidence": 0.4 if contact or skills else 0.15,
    }


# ── STAR ─────────────────────────────────────────────────────────────────────

def star_format(payload: dict[str, Any]) -> dict[str, Any]:
    situation = _str(payload, "situation", "Situation")
    task = _str(payload, "task", "Task")
    action = _str(payload, "action", "Action")
    result = _str(payload, "result", "Result")
    question = _str(payload, "questionText", "question_text", "question")
    snippets = _list(payload, "resume_snippets", "resumeSnippets", "evidence")

    # Derive STAR fields from snippets when explicit fields are empty.
    if not any((situation, task, action, result)) and snippets:
        situation = snippets[0] if len(snippets) > 0 else ""
        task = snippets[1] if len(snippets) > 1 else ""
        action = snippets[2] if len(snippets) > 2 else ""
        result = snippets[3] if len(snippets) > 3 else ""

    bullets = [
        _bulletize("Situation", situation),
        _bulletize("Task", task),
        _bulletize("Action", action),
        _bulletize("Result", result),
    ]
    provided = [b for b in (situation, task, action, result) if b.strip()]
    needs_ai_polish = len(provided) < 3 or any(
        _thin(part) for part in (situation, task, action, result) if part
    ) or not provided

    return {
        "format": "STAR",
        "question": question or None,
        "bullets": bullets,
        "sections": {
            "situation": situation or None,
            "task": task or None,
            "action": action or None,
            "result": result or None,
        },
        "evidence_only": True,
        "invented_facts": False,
        "needs_ai_polish": needs_ai_polish,
        "source": "python_template",
    }


# ── System design templates ──────────────────────────────────────────────────

_SYSTEM_TEMPLATES: dict[str, dict[str, Any]] = {
    "url_shortener": {
        "system": "URL Shortener",
        "requirements": [
            "Shorten long URLs to compact codes",
            "Redirect short codes to original URLs with low latency",
            "Track click counts (optional)",
            "Handle high write + read traffic",
        ],
        "api": [
            "POST /shorten {url} → {code, short_url}",
            "GET /{code} → 302 redirect",
            "GET /stats/{code} → click metrics",
        ],
        "data_model": [
            "urls(code PK, long_url, created_at, owner_id, expires_at)",
            "clicks(id, code FK, ts, user_agent, country)",
        ],
        "scaling": [
            "Cache hot codes in Redis",
            "Shard by code prefix",
            "Async click ingestion via queue",
        ],
        "tradeoffs": [
            "Base62 vs UUID codes (length vs collision risk)",
            "Eventual consistency on click counts vs strong consistency",
            "Custom domains increase multi-tenant complexity",
        ],
    },
    "chat": {
        "system": "Real-time Chat",
        "requirements": [
            "1:1 and group messaging",
            "Online presence and delivery receipts",
            "Message history with pagination",
            "Media attachments (optional)",
        ],
        "api": [
            "POST /rooms",
            "POST /rooms/{id}/messages",
            "GET /rooms/{id}/messages?cursor=",
            "WebSocket /ws subscribe to room events",
        ],
        "data_model": [
            "rooms(id, type, created_at)",
            "memberships(room_id, user_id, role)",
            "messages(id, room_id, sender_id, body, created_at)",
        ],
        "scaling": [
            "Fan-out via pub/sub per room shard",
            "Store cold history in object storage / cold DB",
            "Connection gateway sticky sessions",
        ],
        "tradeoffs": [
            "Push fan-out vs pull (bandwidth vs latency)",
            "Ordering guarantees across multi-region writes",
            "Ephemeral vs durable presence",
        ],
    },
    "feed": {
        "system": "Social Feed",
        "requirements": [
            "Publish posts and media",
            "Personalized home feed",
            "Like / comment interactions",
            "Fair ranking without inventing engagement metrics",
        ],
        "api": [
            "POST /posts",
            "GET /feed?cursor=",
            "POST /posts/{id}/like",
            "GET /posts/{id}/comments",
        ],
        "data_model": [
            "posts(id, author_id, body, media_refs, created_at)",
            "follows(follower_id, followee_id)",
            "feed_items(user_id, post_id, rank_score, created_at)",
        ],
        "scaling": [
            "Fan-out on write for small graphs; hybrid for celebrities",
            "Cache timeline windows per user",
            "Async ranking workers",
        ],
        "tradeoffs": [
            "Fan-out on write vs read (storage vs latency)",
            "Ranking freshness vs cost",
            "Consistency of like counts",
        ],
    },
    "generic": {
        "system": "Generic Distributed Service",
        "requirements": [
            "Clarify functional goals from the prompt",
            "List non-functional targets (latency, availability, consistency)",
            "Define core entities and user flows",
            "Identify bottlenecks and failure modes",
        ],
        "api": [
            "POST /resources",
            "GET /resources/{id}",
            "PATCH /resources/{id}",
            "GET /resources?cursor=",
        ],
        "data_model": [
            "resources(id, owner_id, payload_json, created_at, updated_at)",
            "events(id, resource_id, type, payload_json, created_at)",
        ],
        "scaling": [
            "Stateless app tier behind a load balancer",
            "Primary DB + read replicas",
            "Cache hot keys; queue background work",
        ],
        "tradeoffs": [
            "Consistency vs availability (CAP)",
            "Sync vs async processing",
            "Monolith simplicity vs service boundaries",
        ],
    },
}


def _pick_system_template(prompt: str) -> str:
    lowered = prompt.casefold()
    if any(k in lowered for k in ("url short", "shortener", "bitly", "tinyurl")):
        return "url_shortener"
    if any(k in lowered for k in ("chat", "messaging", "im ", "whatsapp", "slack")):
        return "chat"
    if any(k in lowered for k in ("feed", "timeline", "social", "newsfeed", "instagram")):
        return "feed"
    return "generic"


def system_design_outline(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = _str(payload, "prompt", "system_name", "systemName", "name", "question")
    key = _pick_system_template(prompt)
    template = dict(_SYSTEM_TEMPLATES[key])
    return {
        "prompt": prompt or None,
        "template_key": key,
        "outline": template,
        "source": "python_template",
        "needs_ai_polish": _thin(prompt, min_chars=8),
    }


# ── Resume ───────────────────────────────────────────────────────────────────

def resume_structure(payload: dict[str, Any]) -> dict[str, Any]:
    text = _str(payload, "text", "resume_text", "content", "body")
    if not text:
        return {
            "parsed": None,
            "source": "python_template",
            "needs_ai_polish": True,
            "error": "empty_text",
        }
    try:
        document = _document_from_text(text, filename="resume.txt")
        result = parse_resume(document)
        return {
            "parsed": result.model_dump(),
            "source": "document_intelligence.parsers.structured",
            "needs_ai_polish": result.confidence < 0.5 or not result.skills,
        }
    except Exception:  # noqa: BLE001 — fall back to regex extract
        fallback = _regex_contact_skills(text)
        return {
            "parsed": fallback,
            "source": "regex_fallback",
            "needs_ai_polish": True,
        }


# ── Company research ─────────────────────────────────────────────────────────

def company_research_skeleton(payload: dict[str, Any]) -> dict[str, Any]:
    company = _str(payload, "company", "company_name", "companyName", "name")
    label = company or "[company name]"
    placeholder = (
        f"Fill with verified public sources for {label}. "
        "Do not invent financials, headcount, or funding."
    )
    return {
        "company": company or None,
        "sections": {
            "overview": {
                "summary": placeholder,
                "founded": None,
                "hq": None,
                "source": "python_template",
            },
            "products": {
                "items": [],
                "notes": f"List known products/services for {label} from public materials only.",
                "source": "python_template",
            },
            "culture": {
                "themes": [],
                "notes": "Capture culture signals from careers pages / engineering blogs — no speculation.",
                "source": "python_template",
            },
            "interview_tips": {
                "tips": [
                    "Clarify role level and interview loop stages with the recruiter.",
                    "Map your STAR stories to the company's published values.",
                    "Prepare questions about the team’s current priorities (not fabricated metrics).",
                ],
                "source": "python_template",
            },
        },
        "financials": None,
        "fabricated_data": False,
        "source": "python_template",
        "needs_ai_polish": not bool(company),
    }


# ── Mock question bank (mirrors mockQuestionBank.ts) ─────────────────────────

_BEHAVIOURAL = [
    {
        "question": "Tell me about a time you had to resolve a conflict on your team.",
        "difficulty": "medium",
        "type": "behavioral",
        "tags": ["teamwork", "conflict", "fallback_bank"],
    },
    {
        "question": "Describe a project where you had to learn something new quickly.",
        "difficulty": "medium",
        "type": "behavioral",
        "tags": ["learning", "adaptability", "fallback_bank"],
    },
    {
        "question": "Give an example of when you took ownership beyond your job description.",
        "difficulty": "medium",
        "type": "behavioral",
        "tags": ["ownership", "initiative", "fallback_bank"],
    },
    {
        "question": "Tell me about a time you failed and what you learned from it.",
        "difficulty": "medium",
        "type": "behavioral",
        "tags": ["failure", "growth", "fallback_bank"],
    },
    {
        "question": "Describe a situation where you had to influence others without authority.",
        "difficulty": "hard",
        "type": "behavioral",
        "tags": ["influence", "leadership", "fallback_bank"],
    },
]

_TECHNICAL = [
    {
        "question": "Explain the difference between a stack and a queue. When would you use each?",
        "difficulty": "easy",
        "type": "technical",
        "tags": ["data-structures", "fallback_bank"],
    },
    {
        "question": "How would you design an API rate limiter?",
        "difficulty": "hard",
        "type": "technical",
        "tags": ["system-design", "backend", "fallback_bank"],
    },
    {
        "question": "What is the time complexity of binary search and why?",
        "difficulty": "medium",
        "type": "technical",
        "tags": ["algorithms", "fallback_bank"],
    },
    {
        "question": "Explain how you would debug a slow database query in production.",
        "difficulty": "medium",
        "type": "technical",
        "tags": ["database", "debugging", "fallback_bank"],
    },
]

_HR = [
    {
        "question": "Why are you interested in this role and our company?",
        "difficulty": "easy",
        "type": "hr",
        "tags": ["motivation", "fallback_bank"],
    },
    {
        "question": "Where do you see yourself in three years?",
        "difficulty": "easy",
        "type": "hr",
        "tags": ["career", "fallback_bank"],
    },
]


def _normalize_interview_type(raw: str) -> str:
    t = raw.lower().replace(" ", "_")
    if t in {"behavioural", "behavioral"}:
        return "behavioral"
    return t or "behavioral"


def _pool_for_type(interview_type: str) -> list[dict[str, Any]]:
    match _normalize_interview_type(interview_type):
        case "technical":
            return list(_TECHNICAL)
        case "hr":
            return list(_HR)
        case "mixed":
            return list(_BEHAVIOURAL) + list(_TECHNICAL) + list(_HR)
        case _:
            return list(_BEHAVIOURAL)


def mock_question_bank(payload: dict[str, Any]) -> dict[str, Any]:
    interview_type = _str(payload, "type", "interviewType", "interview_type", default="behavioral")
    difficulty = _str(payload, "difficulty", default="mixed").lower() or "mixed"
    try:
        count = int(payload.get("count") or 5)
    except (TypeError, ValueError):
        count = 5
    count = max(1, min(count, 20))

    exclude_raw = payload.get("excludeTexts") or payload.get("exclude_texts") or []
    exclude = {
        str(t).strip().lower()
        for t in (exclude_raw if isinstance(exclude_raw, list) else [])
        if str(t).strip()
    }

    pool = _pool_for_type(interview_type)
    if difficulty and difficulty != "mixed":
        filtered = [q for q in pool if q["difficulty"] == difficulty]
        if filtered:
            pool = filtered

    rotate = len(exclude) % max(len(pool), 1)
    if rotate > 0:
        pool = pool[rotate:] + pool[:rotate]

    out: list[dict[str, Any]] = []
    for q in pool:
        key = q["question"].strip().lower()
        if key in exclude:
            continue
        out.append(dict(q))
        exclude.add(key)
        if len(out) >= count:
            break

    return {
        "questions": out,
        "type": _normalize_interview_type(interview_type),
        "difficulty": difficulty,
        "count": len(out),
        "source": "python_curated_bank",
        "needs_ai_polish": False,
    }


# ── Practice coach ───────────────────────────────────────────────────────────

def practice_coach_hint(payload: dict[str, Any]) -> dict[str, Any]:
    """Legacy hybrid op - delegates to practice_coach contract ({reply, hints}).

    Kept for older /internal/operations callers. User-facing Edge coach paths must
    use callPythonProcess(practice_coach) -> /v1/process, not this scaffold path.
    """
    from app.engines.practice_coach import run_practice_coach

    adapted = dict(payload or {})
    if (
        "operation_type" not in adapted
        and "help_type" not in adapted
        and "mode" not in adapted
    ):
        adapted["operation_type"] = "hint"
    if "question" not in adapted:
        q = _str(adapted, "questionText", "question_text")
        if q:
            adapted["question"] = q
    if "transcript" not in adapted:
        tr = _str(adapted, "transcript_snippet", "transcriptSnippet")
        if tr:
            adapted["transcript"] = tr
    return run_practice_coach(
        adapted,
        operation_id=str(adapted.get("operation_id") or "hybrid_practice_coach"),
        correlation_id=str(adapted.get("correlation_id") or "hybrid_practice_coach"),
    )


def document_extract(payload: dict[str, Any]) -> dict[str, Any]:
    """Hybrid internal op — prefer engine for bytes/base64; text-only scaffold otherwise."""
    raw_b64 = payload.get("content_base64") or payload.get("base64")
    has_bytes = isinstance(raw_b64, str) and bool(raw_b64.strip())
    if has_bytes or payload.get("filename") or payload.get("mime_type") or payload.get("mime"):
        from app.engines.document_extract import run_document_extract

        operation_id = str(payload.get("operation_id") or payload.get("operationId") or "hybrid_document_extract")
        correlation_id = str(
            payload.get("correlation_id") or payload.get("correlationId") or "hybrid_document_extract"
        )
        return run_document_extract(
            payload,
            operation_id=operation_id,
            correlation_id=correlation_id,
        )

    text = _str(payload, "text", "content", "body")
    category = _str(payload, "category", "doc_type", "docType", "document_kind", "category_hint", default="resume").lower()
    if not text:
        return {
            "category": category,
            "extracted": None,
            "extracted_text": "",
            "source": "python_template",
            "needs_ai_polish": True,
            "error": "empty_text",
        }

    document = _document_from_text(text)
    if category in {"jd", "job", "job_description", "job-description"}:
        extracted = parse_job_description(document).model_dump()
        parser = "parse_job_description"
    else:
        extracted = parse_resume(document).model_dump()
        parser = "parse_resume"

    return {
        "category": category,
        "extracted": extracted,
        "extracted_text": text,
        "structured": extracted,
        "parser": parser,
        "source": "document_intelligence.parsers.structured",
        "needs_ai_polish": float(extracted.get("confidence") or 0) < 0.5,
    }


# ── Gap analysis (deterministic skill overlap) ───────────────────────────────

_TOKEN = re.compile(r"[a-zA-Z][a-zA-Z0-9+.#-]{1,}")


def _tokens(text: str) -> set[str]:
    return {m.group(0).lower() for m in _TOKEN.finditer(text or "")}


def gap_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    resume = _str(payload, "resume_text", "resumeText", "resume", "text")
    jd = _str(payload, "jd_text", "jdText", "job_description", "jd")
    resume_skills = _list(payload, "resume_skills", "resumeSkills")
    jd_skills = _list(payload, "jd_skills", "jdSkills", "required_skills")

    if not resume_skills:
        resume_skills = sorted(_regex_contact_skills(resume).get("skills") or [])
    if not jd_skills:
        jd_tok = _tokens(jd)
        known = {
            "python", "java", "javascript", "typescript", "react", "sql", "aws",
            "docker", "kubernetes", "fastapi", "node.js", "go", "rust", "kotlin",
            "swift", "leadership", "communication", "machine learning",
        }
        jd_skills = sorted(
            s for s in known if s in jd_tok or s.replace(".", "") in jd_tok
        )

    resume_set = {s.lower() for s in resume_skills}
    jd_set = {s.lower() for s in jd_skills}
    matched = sorted(resume_set & jd_set)
    missing = sorted(jd_set - resume_set)
    coverage = (len(matched) / len(jd_set)) if jd_set else (1.0 if resume_set else 0.0)

    return {
        "matched_skills": matched,
        "missing_skills": missing,
        "coverage_score": round(coverage, 3),
        "summary": (
            f"Matched {len(matched)} of {len(jd_set) or len(matched)} required skills "
            f"({int(coverage * 100)}% coverage). "
            + (
                f"Gaps: {', '.join(missing[:8])}."
                if missing
                else "No major skill gaps detected."
            )
        ),
        "recommendations": [
            f"Add evidence for: {skill}" for skill in missing[:5]
        ]
        or ["Keep quantifying impact with metrics from your resume."],
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def session_debrief(payload: dict[str, Any]) -> dict[str, Any]:
    duration = payload.get("duration_seconds") or payload.get("durationSeconds") or 0
    try:
        duration = int(duration)
    except (TypeError, ValueError):
        duration = 0
    questions = payload.get("questions_asked") or payload.get("questionsAsked") or 0
    try:
        questions = int(questions)
    except (TypeError, ValueError):
        questions = 0
    highlights = _list(payload, "highlights", "strengths")
    improvements = _list(payload, "improvements", "weaknesses")

    strengths = highlights or [
        "Stayed engaged through the practice session",
        "Attempted questions under timed conditions",
    ]
    weak = improvements or [
        "Add more measurable outcomes in answers",
        "Tighten openings — lead with the situation in one sentence",
    ]
    mins = max(1, duration // 60) if duration else 0
    return {
        "title": "Practice session debrief",
        "summary": (
            f"You practiced for about {mins} minute(s) across {questions or 'several'} question(s). "
            "This debrief is based on session metrics (AI polish optional)."
        ),
        "strengths": strengths[:5],
        "improvements": weak[:5],
        "next_steps": [
            "Re-run one weak question with a STAR outline",
            "Record a 60-second answer and compare clarity",
        ],
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def session_scorecard(payload: dict[str, Any]) -> dict[str, Any]:
    answered = payload.get("answered") or payload.get("answers_count") or 0
    total = payload.get("total") or payload.get("question_count") or answered or 1
    try:
        answered = int(answered)
        total = max(1, int(total))
    except (TypeError, ValueError):
        answered, total = 0, 1
    completion = min(1.0, answered / total)
    clarity = float(
        payload.get("clarity_score")
        or payload.get("clarityScore")
        or (0.55 + 0.35 * completion)
    )
    structure = float(
        payload.get("structure_score")
        or payload.get("structureScore")
        or (0.5 + 0.4 * completion)
    )
    overall = round((clarity + structure + completion) / 3 * 100)

    return {
        "overall_score": overall,
        "dimensions": {
            "completion": round(completion * 100),
            "clarity": round(min(1.0, clarity) * 100),
            "structure": round(min(1.0, structure) * 100),
        },
        "grade": (
            "A"
            if overall >= 85
            else "B"
            if overall >= 70
            else "C"
            if overall >= 55
            else "D"
        ),
        "notes": [
            "Scores derived from session metrics; AI enrichment optional.",
            f"Answered {answered}/{total} prompts.",
        ],
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def analyze_test(payload: dict[str, Any]) -> dict[str, Any]:
    correct = payload.get("correct") or payload.get("correct_count") or 0
    total = payload.get("total") or payload.get("question_count") or 0
    try:
        correct = int(correct)
        total = int(total)
    except (TypeError, ValueError):
        correct, total = 0, 0
    score_pct = (
        round((correct / total) * 100)
        if total
        else int(payload.get("score_percent") or 0)
    )
    weak_topics = _list(payload, "weak_topics", "weakTopics", "topics")
    return {
        "score_percent": score_pct,
        "correct": correct,
        "total": total,
        "summary": (
            f"You scored {score_pct}% ({correct}/{total}). "
            + (
                f"Focus next on: {', '.join(weak_topics[:5])}."
                if weak_topics
                else "Review incorrect items and retry a short mixed set."
            )
        ),
        "weak_topics": weak_topics[:10],
        "recommendations": [
            "Drill weak topics with a 10-question custom practice set",
            "Revisit explanations for every incorrect answer",
        ],
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def speech_process(payload: dict[str, Any]) -> dict[str, Any]:
    """Normalize transcript text; delegates to engines.speech_process when rich."""
    from app.engines.speech_process import run_speech_process

    text = _str(payload, "transcript", "text", "content")
    if text and not payload.get("segments") and not payload.get("audio_url"):
        cleaned = re.sub(r"\s+", " ", text).strip()
        sentences = [
            s.strip() for s in re.split(r"(?<=[.!?])\s+", cleaned) if s.strip()
        ]
        return {
            "transcript": cleaned,
            "normalized": cleaned,
            "sentence_count": len(sentences),
            "word_count": len(cleaned.split()),
            "summary": " ".join(sentences[:2]) if sentences else cleaned[:240],
            "source": "python_deterministic",
            "needs_ai_polish": len(cleaned) > 400,
            "invented_facts": False,
        }
    return run_speech_process(
        payload or {},
        operation_id=str(payload.get("operation_id") or "hybrid_speech"),
        correlation_id=str(payload.get("correlation_id") or "hybrid_speech"),
    )


def prep_rephrase(payload: dict[str, Any]) -> dict[str, Any]:
    text = _str(payload, "text", "input", "answer", "content")
    if not text:
        return {
            "rephrased": "",
            "source": "python_deterministic",
            "needs_ai_polish": True,
            "invented_facts": False,
            "error": "empty_input",
        }
    cleaned = re.sub(r"\b(um+|uh+|like|you know)\b", "", text, flags=re.I)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    return {
        "rephrased": cleaned,
        "original": text,
        "notes": ["Deterministic cleanup only — AI polish optional for tone/style."],
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def prep_coding(payload: dict[str, Any]) -> dict[str, Any]:
    prompt = _str(payload, "prompt", "question", "problem", "text")
    mode = _str(payload, "mode", "tool", default="hint").lower()
    hints = [
        "Clarify inputs, outputs, and edge cases before coding",
        "State time/space complexity targets",
        "Start with a brute-force approach, then optimize",
    ]
    if "hint" in mode:
        body = "• " + "\n• ".join(hints)
    else:
        body = (
            f"Problem: {prompt[:400] or '(describe the problem)'}\n\n"
            "Approach outline:\n"
            "1. Parse constraints and examples\n"
            "2. Choose a data structure that matches access patterns\n"
            "3. Implement, then test edge cases (empty, single, large)\n"
        )
    return {
        "content": body,
        "hints": hints,
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


def prep_project(payload: dict[str, Any]) -> dict[str, Any]:
    topic = _str(payload, "topic", "prompt", "project", "text", default="portfolio project")
    return {
        "title": f"Project outline: {topic[:80]}",
        "sections": {
            "problem": f"Define the user problem for: {topic}",
            "scope": ["MVP features (3–5)", "Out of scope list", "Success metrics"],
            "architecture": ["Client", "API", "Data store", "Auth"],
            "milestones": ["Spike", "MVP", "Polish", "Demo"],
        },
        "source": "python_deterministic",
        "needs_ai_polish": True,
        "invented_facts": False,
    }


# ── Ping ─────────────────────────────────────────────────────────────────────

def ping(_payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "service": "clarity-scraper-hybrid",
        "service_version": SERVICE_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "source": "python",
        "ok": True,
    }


# ── Dispatch ─────────────────────────────────────────────────────────────────

_HANDLERS: dict[str, Callable[[dict[str, Any]], dict[str, Any]]] = {
    "star_format": star_format,
    "system_design_outline": system_design_outline,
    "resume_structure": resume_structure,
    "company_research_skeleton": company_research_skeleton,
    "mock_question_bank": mock_question_bank,
    "practice_coach_hint": practice_coach_hint,
    "practice_coach": practice_coach_hint,
    "document_extract": document_extract,
    "gap_analysis": gap_analysis,
    "session_debrief": session_debrief,
    "session_scorecard": session_scorecard,
    "analyze_test": analyze_test,
    "speech_process": speech_process,
    "prep_rephrase": prep_rephrase,
    "prep_coding": prep_coding,
    "prep_project": prep_project,
    "ping": ping,
}


class UnsupportedOperation(ValueError):
    """Raised when operation_type is not registered."""


def run_operation(operation_type: str, payload: dict[str, Any] | None) -> dict[str, Any]:
    key = (operation_type or "").strip().lower()
    handler = _HANDLERS.get(key)
    if handler is None:
        raise UnsupportedOperation(f"Unsupported operation_type: {operation_type}")
    return handler(payload or {})


def list_supported_operations() -> list[str]:
    return list(SUPPORTED_OPERATIONS)
