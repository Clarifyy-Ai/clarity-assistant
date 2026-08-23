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
    question = _str(payload, "questionText", "question_text", "question")
    transcript = _str(payload, "transcript", "transcript_snippet", "transcriptSnippet")
    return {
        "question": question or None,
        "scaffold": {
            "clarify": [
                "Restate the question in one sentence to confirm scope.",
                "Ask what success looks like if the prompt is ambiguous.",
            ],
            "structure": [
                "Open with a one-line thesis.",
                "Use 2–3 supporting points, then a crisp close.",
                "For behavioral prompts, use STAR (Situation → Task → Action → Result).",
            ],
            "star_reminder": {
                "situation": "Set context in ≤2 sentences.",
                "task": "State your responsibility / goal.",
                "action": "Focus on what *you* did (verbs, decisions).",
                "result": "Quantify outcome when you have real numbers — never invent.",
            },
            "follow_ups": [
                "What would you do differently next time?",
                "How did stakeholders react?",
                "Which tradeoff was hardest?",
            ],
        },
        "transcript_used": bool(transcript),
        "transcript_signals": {
            "length_chars": len(transcript),
            "has_content": bool(transcript.strip()),
            "hint": (
                "Tighten structure and cut filler; map answer back to the question."
                if transcript
                else "No transcript provided — rehearse aloud using the scaffold."
            ),
        },
        "source": "python_scaffold",
        "needs_ai_polish": _thin(question, min_chars=12),
    }


# ── Document extract ─────────────────────────────────────────────────────────

def document_extract(payload: dict[str, Any]) -> dict[str, Any]:
    text = _str(payload, "text", "content", "body")
    category = _str(payload, "category", "doc_type", "docType", default="resume").lower()
    if not text:
        return {
            "category": category,
            "extracted": None,
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
        "parser": parser,
        "source": "document_intelligence.parsers.structured",
        "needs_ai_polish": float(extracted.get("confidence") or 0) < 0.5,
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
    "document_extract": document_extract,
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
