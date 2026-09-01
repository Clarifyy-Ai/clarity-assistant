"""End-to-end paper factory tests with a stubbed AI provider and in-memory database.

These exercise the real orchestrator, validators, dedup engine, assembly and publication
path — only the network and Supabase calls are replaced.
"""
from __future__ import annotations

import asyncio
import itertools
import json
import random
import uuid
from typing import Any, Sequence

import httpx
import pytest

from app.paper_factory import factory as factory_module
from app.model_catalog import MAX_MODELS_PER_PROVIDER
from app.model_availability import reset_model_availability_cache
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.config import FactorySettings
from app.paper_factory.export import to_dict, to_html
from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import (
    ExamContext,
    PaperFactoryError,
    PatternSection,
    PatternVersion,
)
from app.paper_factory.repository import BankQuestion

# ── Test doubles ──────────────────────────────────────────────────────────────

SECTIONS = (
    PatternSection("reasoning", "General Intelligence & Reasoning", 25, 50.0, 1),
    PatternSection("awareness", "General Awareness", 25, 50.0, 2),
    PatternSection("quant", "Quantitative Aptitude", 25, 50.0, 3),
    PatternSection("english", "English Comprehension", 25, 50.0, 4),
)

SYLLABUS = {
    "reasoning": ["analogy", "classification", "series", "coding_decoding"],
    "awareness": ["history", "geography", "polity", "economy"],
    "quant": ["arithmetic", "algebra", "geometry", "mensuration"],
    "english": ["grammar", "vocabulary", "error_spotting", "fillers"],
}

VOCAB = [
    "monsoon", "granite", "parliament", "alloy", "estuary", "tariff", "isotope",
    "monopoly", "glacier", "cabinet", "polymer", "delta", "subsidy", "neutron",
    "savanna", "quorum", "catalyst", "plateau", "revenue", "spectrum", "lagoon",
    "statute", "enzyme", "canyon", "levy", "photon", "prairie", "ordinance",
    "alkali", "fjord", "budget", "quasar", "tundra", "amendment", "silicate",
    "deficit", "meson", "steppe", "charter", "ceramic",
]

TEMPLATES = [
    "Which option best explains how {a} influences {b} under standard conditions?",
    "A student compares {a} with {b}. What conclusion follows for {c}?",
    "Identify the statement that correctly links {a}, {b} and {c} together.",
    "In a study of {a}, researchers measured {b}. What does this imply about {c}?",
    "What distinguishes {a} from {b} when {c} is held constant throughout?",
    "Arrange the effect of {a} on {b} and state the outcome for {c} precisely.",
    "Given a change in {a}, which consequence for {b} is most defensible here?",
    "Select the option describing the role of {a} within the {b} framework of {c}.",
]

_counter = itertools.count()


def _tag(index: int) -> str:
    """A unique alphabetic token.

    It must be alphabetic and longer than one character: `compute_template_fingerprint`
    masks digits as `<NUM>` and single letters as `<VAR>`, so a numeric suffix would not
    keep two otherwise-identical stems distinct.
    """
    letters = "abcdefghijklmnopqrstuvwxyz"
    value = index
    out = ""
    for _ in range(3):
        out += letters[value % 26]
        value //= 26
    return f"ref{out}"


def make_candidate(index: int) -> dict[str, Any]:
    """A structurally valid, lexically distinct MCQ candidate."""
    rng = random.Random(index)
    words = rng.sample(VOCAB, 7)
    stem = TEMPLATES[index % len(TEMPLATES)].format(a=words[0], b=words[1], c=words[2])

    return {
        "question_text": f"{stem} Cite study {_tag(index)}.",
        "options": [
            {"label": "A", "text": f"{words[3]} rises sharply"},
            {"label": "B", "text": f"{words[4]} declines slowly"},
            {"label": "C", "text": f"{words[5]} remains unchanged"},
            {"label": "D", "text": f"{words[6]} reverses entirely"},
        ],
        "correct_answer": "ABCD"[index % 4],
        "explanation": (
            "The correct option follows from the standard relationship described in the "
            "syllabus, while the remaining options invert or exaggerate that effect."
        ),
        "difficulty": ["EASY", "MEDIUM", "HARD"][index % 3],
    }


class StubGenerator:
    """Drop-in replacement for MCQGenerator that never touches the network."""

    def __init__(self, *_args: Any, batch_yield: int = 12, fail_all: bool = False, **_kw: Any):
        self.call_count = 0
        self.batch_yield = batch_yield
        self.fail_all = fail_all

    async def __aenter__(self) -> "StubGenerator":
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        return None

    async def generate(self, prompt: str, **_kwargs: Any) -> Any:
        self.call_count += 1
        if self.fail_all:
            return type("R", (), {"questions": [{"question_text": "bad"}]})()
        questions = [make_candidate(next(_counter)) for _ in range(self.batch_yield)]
        return type("R", (), {"questions": questions})()


class FakeRepo:
    """In-memory stand-in for PaperRepository."""

    def __init__(self, bank: Sequence[BankQuestion] = ()) -> None:
        self.bank = list(bank)
        self.inserted: list[Any] = []
        self.published: dict[str, Any] | None = None
        self.stages: list[str] = []

    def resolve_exam(self, query: str, stage_ref: str | None = None) -> ExamContext:
        return ExamContext(
            exam_id="exam-1",
            code="SSC_CGL",
            name="SSC Combined Graduate Level",
            legacy_exam_type="SSC Exams (CGL/CHSL)",
            stage_id="stage-1",
            stage_code="TIER1",
            stage_name="Tier I",
            bank_type_keys=("SSC Exams (CGL/CHSL)",),
        )

    def load_pattern(self, exam: ExamContext) -> PatternVersion:
        return PatternVersion(
            id="pattern-1",
            version="2024.1",
            total_questions=100,
            total_marks=200.0,
            duration_minutes=60,
            negative_mark=0.5,
            marks_per_question=2.0,
            sections=SECTIONS,
        )

    def load_syllabus(self, exam: ExamContext):
        return "syllabus-1", "2024.1", SYLLABUS

    def load_topic_weights(self, exam: ExamContext) -> dict[str, float]:
        return {}

    def load_bank_questions(self, exam: ExamContext, **_kw: Any) -> list[BankQuestion]:
        return list(self.bank)

    def insert_questions(self, questions, **_kw: Any) -> list[str]:
        self.inserted.extend(questions)
        return [str(uuid.uuid4()) for _ in questions]

    def publish_paper(self, *, blueprint, questions, user_id, job_id, quality_score, provenance, title=None):
        self.published = {
            "blueprint": blueprint,
            "questions": list(questions),
            "user_id": user_id,
            "quality_score": quality_score,
            "provenance": provenance,
        }
        return "paper-1", "mock-1"

    def save_blueprint(self, *_a: Any, **_kw: Any) -> None:
        return None

    def set_stage(self, _job_id: str, stage: str) -> None:
        self.stages.append(stage)


def make_settings(**overrides: Any) -> FactorySettings:
    values: dict[str, Any] = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "service-role-key",
        "GEMINI_API_KEY": "test-key",
        "SYSTEM_USER_ID": str(uuid.uuid4()),
        "PAPER_FACTORY_BATCH_SIZE": 8,
        "PAPER_FACTORY_CONCURRENCY": 4,
        "PAPER_FACTORY_MAX_REPAIR_ROUNDS": 3,
    }
    values.update(overrides)
    return FactorySettings(**values)  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def stub_ai(monkeypatch: pytest.MonkeyPatch):
    """Replace the AI client inside the factory for every test in this module."""
    holder: dict[str, StubGenerator] = {}

    def build(*args: Any, **kwargs: Any) -> StubGenerator:
        stub = StubGenerator(*args, **kwargs, **holder.get("kwargs", {}))
        holder["last"] = stub
        return stub

    monkeypatch.setattr(factory_module, "MCQGenerator", build)
    return holder


# ── Full-paper generation ─────────────────────────────────────────────────────


def test_generates_a_complete_hundred_question_paper() -> None:
    repo = FakeRepo()
    factory = PaperFactory(make_settings(), repo)  # type: ignore[arg-type]

    result = asyncio.run(
        factory.generate(
            GenerationRequest(
                exam_query="SSC_CGL", user_id="user-1", random_seed="seed", job_id="job-1"
            )
        )
    )

    assert result.is_complete
    assert len(result.questions) == 100
    assert result.generated_count == 100
    assert result.bank_count == 0
    assert result.paper_id == "paper-1"
    assert result.mock_test_id == "mock-1"
    assert result.quality_score > 40

    # Every question was persisted before publication.
    assert all(q.question_id for q in result.questions)
    assert len(repo.inserted) == 100

    # Section quotas are respected exactly.
    per_section: dict[str, int] = {}
    for question in result.questions:
        per_section[question.section_code] = per_section.get(question.section_code, 0) + 1
    assert per_section == {"reasoning": 25, "awareness": 25, "quant": 25, "english": 25}


def test_questions_are_all_unique() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
        )
    )
    stems = [q.question_text for q in result.questions]
    assert len(set(stems)) == len(stems)


def test_answer_keys_are_spread_across_all_options() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
        )
    )
    letters = [q.correct_answer_letter for q in result.questions]
    counts = {letter: letters.count(letter) for letter in "ABCD"}
    assert set(counts) == {"A", "B", "C", "D"}
    # No option may dominate the way the legacy bank does (56% on B).
    assert max(counts.values()) <= 30


def test_every_question_keeps_a_resolvable_answer() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
        )
    )
    for question in result.questions:
        assert 0 <= question.correct_index < 4
        assert len(question.options) == 4
        assert question.options[question.correct_index]


def test_progress_and_stages_are_reported() -> None:
    repo = FakeRepo()
    stages: list[str] = []
    progress: list[tuple[int, int]] = []

    asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s"),
            on_stage=lambda stage: stages.append(stage),
            on_progress=lambda done, total: progress.append((done, total)),
        )
    )

    assert "analyzing_pattern" in stages
    assert "generating_questions" in stages
    assert "assembling" in stages
    assert progress and progress[-1][0] == progress[-1][1] == 100


# ── Bank reuse ────────────────────────────────────────────────────────────────


def bank_items(count: int, subject: str, topic: str) -> list[BankQuestion]:
    return [
        BankQuestion(
            id=f"bank-{subject}-{i}",
            question_text=f"Approved bank item {i} covering {topic} for the {subject} section",
            options=[f"opt{i}a", f"opt{i}b", f"opt{i}c", f"opt{i}d"],
            correct_index=1,
            subject=subject,
            topic=topic,
            difficulty="MEDIUM",
            is_verified=True,
        )
        for i in range(count)
    ]


def test_bank_items_are_reused_before_generating() -> None:
    repo = FakeRepo(bank_items(25, "Quantitative Aptitude", "Arithmetic"))
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
        )
    )

    assert len(result.questions) == 100
    assert result.bank_count + result.generated_count == 100
    assert result.bank_count <= 25
    assert result.bank_count >= 1
    assert len(repo.inserted) == result.generated_count

    quant = [q for q in result.questions if q.section_code == "quant"]
    assert sum(1 for q in quant if q.source_class == "bank") == result.bank_count


def test_bank_overflow_is_capped_at_the_section_quota() -> None:
    repo = FakeRepo(bank_items(80, "Quantitative Aptitude", "Arithmetic"))
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
        )
    )
    assert result.bank_count <= 25
    assert result.bank_count + result.generated_count == 100
    assert len(result.questions) == 100


def test_no_bank_flag_forces_full_generation() -> None:
    repo = FakeRepo(bank_items(25, "Quantitative Aptitude", "Arithmetic"))
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(
                exam_query="SSC_CGL", user_id="user-1", random_seed="s", use_bank=False
            )
        )
    )
    assert result.bank_count == 0
    assert result.generated_count == 100


# ── Failure handling ──────────────────────────────────────────────────────────


def test_incomplete_generation_never_publishes(stub_ai) -> None:
    stub_ai["kwargs"] = {"fail_all": True}
    repo = FakeRepo()

    with pytest.raises(PaperFactoryError) as err:
        asyncio.run(
            PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
                GenerationRequest(exam_query="SSC_CGL", user_id="user-1", random_seed="s")
            )
        )

    assert err.value.code == "GENERATION_INCOMPLETE"
    assert err.value.retryable is True
    assert repo.published is None
    assert repo.inserted == []


def test_publishing_requires_a_user() -> None:
    repo = FakeRepo()
    with pytest.raises(PaperFactoryError) as err:
        asyncio.run(
            PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
                GenerationRequest(exam_query="SSC_CGL", random_seed="s")
            )
        )
    assert err.value.code == "USER_REQUIRED"


def test_dry_run_generates_without_persisting() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(exam_query="SSC_CGL", random_seed="s", publish=False)
        )
    )
    assert len(result.questions) == 100
    assert repo.published is None
    assert repo.inserted == []
    assert result.paper_id is None


def test_missing_ai_provider_is_reported_clearly() -> None:
    repo = FakeRepo()
    settings = make_settings(GEMINI_API_KEY="", OPENAI_API_KEY="")
    with pytest.raises(PaperFactoryError) as err:
        asyncio.run(
            PaperFactory(settings, repo).generate(  # type: ignore[arg-type]
                GenerationRequest(exam_query="SSC_CGL", user_id="u", random_seed="s")
            )
        )
    assert err.value.code == "AI_PROVIDER_UNCONFIGURED"


# ── Custom sized papers ───────────────────────────────────────────────────────


@pytest.mark.parametrize("count", [10, 25, 47, 60])
def test_custom_sized_papers_hit_the_exact_count(count: int) -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(
                exam_query="SSC_CGL",
                user_id="user-1",
                random_seed="s",
                mode="custom_mock",
                question_count=count,
            )
        )
    )
    assert len(result.questions) == count
    assert result.blueprint.total_questions == count


# ── Export ────────────────────────────────────────────────────────────────────


def test_exports_contain_the_paper_and_answer_key() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(
                exam_query="SSC_CGL",
                user_id="user-1",
                random_seed="s",
                mode="custom_mock",
                question_count=10,
            )
        )
    )

    payload = to_dict(result)
    assert payload["paper"]["question_count"] == 10
    assert len(payload["questions"]) == 10
    assert payload["questions"][0]["correct_answer"] in "ABCD"
    # A resized paper is a practice set, not a full exam simulation.
    assert payload["paper"]["paper_class"] == "custom_practice"
    assert "not a full official exam simulation" in payload["paper"]["disclaimer"]
    json.dumps(payload)  # must be serialisable

    html = to_html(result)
    assert "Answer Key" in html
    assert "Solutions" in html
    assert "General Intelligence &amp; Reasoning" in html


def test_export_escapes_html_in_question_text() -> None:
    repo = FakeRepo()
    result = asyncio.run(
        PaperFactory(make_settings(), repo).generate(  # type: ignore[arg-type]
            GenerationRequest(
                exam_query="SSC_CGL", user_id="u", random_seed="s",
                mode="custom_mock", question_count=5,
            )
        )
    )
    result.questions[0].question_text = "<script>alert('x')</script> what is 2+2?"
    assert "<script>" not in to_html(result)


# ── Real AI client transport behaviour ────────────────────────────────────────


def gemini_body(questions: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "candidates": [
            {"content": {"parts": [{"text": json.dumps({"questions": questions})}]}}
        ]
    }


def _is_model_list(request: httpx.Request) -> bool:
    url = str(request.url)
    return request.method == "GET" and "/models" in url and ":generateContent" not in url


def _empty_model_list() -> httpx.Response:
    return httpx.Response(200, json={"models": [], "data": []})


def test_gemini_success_is_parsed() -> None:
    async def run() -> None:
        transport = httpx.MockTransport(
            lambda request: httpx.Response(200, json=gemini_body([make_candidate(1)]))
        )
        async with httpx.AsyncClient(transport=transport) as client:
            async with MCQGenerator(make_settings(), client) as ai:
                response = await ai.generate("prompt")
        assert response.provider == "gemini"
        assert len(response.questions) == 1
        assert ai.call_count == 1

    asyncio.run(run())


def test_gemini_rate_limit_is_retried_then_succeeds() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if _is_model_list(request):
            return _empty_model_list()
        attempts["n"] += 1
        if attempts["n"] == 1:
            return httpx.Response(503, text="unavailable")
        return httpx.Response(200, json=gemini_body([make_candidate(2)]))

    async def run() -> None:
        transport = httpx.MockTransport(handler)
        settings = make_settings()
        async with httpx.AsyncClient(transport=transport) as client:
            async with MCQGenerator(settings, client) as ai:
                response = await ai.generate("prompt")
        assert response.questions
        assert attempts["n"] == 2

    asyncio.run(run())


def test_gemini_429_is_not_retried() -> None:
    attempts = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if _is_model_list(request):
            return _empty_model_list()
        attempts["n"] += 1
        return httpx.Response(429, text="RESOURCE_EXHAUSTED")

    async def run() -> None:
        from app.ai_circuit import gemini_circuit

        reset_model_availability_cache()
        gemini_circuit.record_success()
        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as client:
            async with MCQGenerator(make_settings(), client) as ai:
                with pytest.raises(PaperFactoryError) as err:
                    await ai.generate("prompt")
        assert err.value.code == "PROVIDER_UNAVAILABLE"
        assert attempts["n"] == MAX_MODELS_PER_PROVIDER
        reset_model_availability_cache()
        gemini_circuit.record_success()

    asyncio.run(run())


def test_gemini_429_falls_through_to_next_gemini_model() -> None:
    seen: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        if _is_model_list(request):
            return _empty_model_list()
        url = str(request.url)
        if ":generateContent" not in url:
            return httpx.Response(200, json=gemini_body([make_candidate(9)]))
        seen.append(url)
        if len(seen) == 1:
            return httpx.Response(429, text="RESOURCE_EXHAUSTED")
        return httpx.Response(200, json=gemini_body([make_candidate(9)]))

    async def run() -> None:
        from app.ai_circuit import gemini_circuit

        reset_model_availability_cache()
        gemini_circuit.record_success()
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with MCQGenerator(make_settings(), client) as ai:
                response = await ai.generate("prompt")
        assert response.provider == "gemini"
        assert len(response.questions) == 1
        generate_urls = [url for url in seen if ":generateContent" in url]
        assert len(generate_urls) == 2
        reset_model_availability_cache()
        gemini_circuit.record_success()

    asyncio.run(run())


def test_falls_back_to_openai_when_gemini_fails_hard() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if _is_model_list(request):
            return _empty_model_list()
        if "generativelanguage" in str(request.url):
            return httpx.Response(400, text="bad gemini request")
        if "anthropic.com" in str(request.url):
            return httpx.Response(400, text="skip anthropic")
        return httpx.Response(
            200,
            json={
                "choices": [
                    {
                        "message": {
                            "content": json.dumps({"questions": [make_candidate(3)]})
                        }
                    }
                ]
            },
        )

    async def run() -> None:
        reset_model_availability_cache()
        settings = make_settings(OPENAI_API_KEY="openai-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with MCQGenerator(settings, client) as ai:
                response = await ai.generate("prompt")
        assert response.provider == "openai"
        assert len(response.questions) == 1

    asyncio.run(run())


def test_gemini_quota_does_not_spend_openai() -> None:
    openai_hits = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "openai.com" in str(request.url) and request.method == "POST":
            openai_hits["n"] += 1
            return httpx.Response(200, json={"choices": []})
        if _is_model_list(request):
            return _empty_model_list()
        return httpx.Response(429, text="RESOURCE_EXHAUSTED")

    async def run() -> None:
        from app.ai_circuit import gemini_circuit

        reset_model_availability_cache()
        gemini_circuit.record_success()
        settings = make_settings(OPENAI_API_KEY="openai-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with MCQGenerator(settings, client) as ai:
                with pytest.raises(PaperFactoryError) as err:
                    await ai.generate("prompt")
        assert err.value.code == "PROVIDER_UNAVAILABLE"
        assert openai_hits["n"] == 0
        reset_model_availability_cache()
        gemini_circuit.record_success()

    asyncio.run(run())


def test_gemini_quota_circuit_skips_openai_on_next_call() -> None:
    openai_hits = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        if "openai.com" in str(request.url) and request.method == "POST":
            openai_hits["n"] += 1
            return httpx.Response(200, json={"choices": []})
        if _is_model_list(request):
            return _empty_model_list()
        return httpx.Response(429, text="RESOURCE_EXHAUSTED")

    async def run() -> None:
        from app.ai_circuit import gemini_circuit

        reset_model_availability_cache()
        gemini_circuit.record_success()
        settings = make_settings(OPENAI_API_KEY="openai-key")
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
            async with MCQGenerator(settings, client) as ai:
                with pytest.raises(PaperFactoryError):
                    await ai.generate("prompt")
                with pytest.raises(PaperFactoryError):
                    await ai.generate("prompt")
        assert openai_hits["n"] == 0
        reset_model_availability_cache()
        gemini_circuit.record_success()

    asyncio.run(run())


def test_all_providers_failing_raises_provider_unavailable() -> None:
    async def run() -> None:
        transport = httpx.MockTransport(lambda r: httpx.Response(400, text="nope"))
        async with httpx.AsyncClient(transport=transport) as client:
            async with MCQGenerator(make_settings(), client) as ai:
                with pytest.raises(PaperFactoryError) as err:
                    await ai.generate("prompt")
        assert err.value.code == "PROVIDER_UNAVAILABLE"
        assert err.value.retryable is True

    asyncio.run(run())
