"""Command line interface for the government exam paper factory.

Examples
--------
    python -m app.paper_factory.cli exams
    python -m app.paper_factory.cli plan --exam SSC_CGL
    python -m app.paper_factory.cli generate --exam SSC_CGL --dry-run --out ./out
    python -m app.paper_factory.cli generate --exam "civil services" --user <uuid>
    python -m app.paper_factory.cli bank-build --exam RRB_NTPC --count 60
    python -m app.paper_factory.cli worker --once
"""
from __future__ import annotations

import argparse
import asyncio
import json
import sys
import uuid

from app.core.logger import configure_logging, get_logger
from app.paper_factory.blueprint import blueprint_summary
from app.paper_factory.config import get_factory_settings
from app.paper_factory.export import write_exports
from app.paper_factory.factory import GenerationRequest, PaperFactory
from app.paper_factory.models import PaperFactoryError
from app.paper_factory.repository import PaperRepository
from app.paper_factory.worker import worker_loop

log = get_logger("paper_factory.cli")


def _print(payload: object) -> None:
    print(json.dumps(payload, ensure_ascii=False, indent=2, default=str))


async def cmd_exams(_: argparse.Namespace) -> int:
    repo = PaperRepository(get_factory_settings())
    exams = await asyncio.to_thread(repo.list_exams)
    bank = []
    for exam in exams:
        bank.append(
            {
                "code": exam.get("code"),
                "name": exam.get("name"),
                "family": exam.get("family"),
                "bank_exam_type": exam.get("legacy_exam_type"),
            }
        )
    _print({"count": len(bank), "exams": bank})
    return 0


async def cmd_plan(args: argparse.Namespace) -> int:
    factory = PaperFactory(get_factory_settings())
    blueprint = await factory.plan(
        GenerationRequest(
            exam_query=args.exam,
            stage=args.stage,
            mode=args.mode,
            language=args.language,
            question_count=args.count,
            duration_minutes=args.duration,
            random_seed=args.seed,
        )
    )
    _print(blueprint_summary(blueprint))
    return 0


async def cmd_generate(args: argparse.Namespace) -> int:
    settings = get_factory_settings()
    factory = PaperFactory(settings)

    publish = not args.dry_run
    if publish and not args.user:
        print(
            "error: --user <uuid> is required to publish. Use --dry-run to preview "
            "without writing to the database.",
            file=sys.stderr,
        )
        return 2

    total_seen = {"done": 0, "total": 0}

    def on_progress(done: int, total: int) -> None:
        if (done, total) != (total_seen["done"], total_seen["total"]):
            total_seen.update(done=done, total=total)
            print(f"  generated {done}/{total} questions", file=sys.stderr)

    def on_stage(stage: str) -> None:
        print(f"[stage] {stage}", file=sys.stderr)

    request = GenerationRequest(
        exam_query=args.exam,
        stage=args.stage,
        mode=args.mode,
        language=args.language,
        question_count=args.count,
        duration_minutes=args.duration,
        random_seed=args.seed or uuid.uuid4().hex,
        user_id=args.user,
        use_bank=not args.no_bank,
        publish=publish,
        title=args.title,
    )

    result = await factory.generate(request, on_stage=on_stage, on_progress=on_progress)

    summary = {
        "exam": result.blueprint.exam.prompt_label,
        "question_count": len(result.questions),
        "planned_count": result.blueprint.total_questions,
        "complete": result.is_complete,
        "bank_questions": result.bank_count,
        "ai_questions": result.generated_count,
        "ai_calls": result.ai_calls,
        "rejected_candidates": result.rejected_count,
        "rejection_reasons": result.rejection_reasons,
        "quality_score": result.quality_score,
        "paper_id": result.paper_id,
        "mock_test_id": result.mock_test_id,
        "published": publish,
    }

    if args.out:
        summary["exports"] = write_exports(result, args.out)

    _print(summary)
    return 0 if result.is_complete else 1


async def cmd_bank_build(args: argparse.Namespace) -> int:
    """Generate reviewed-pending questions into the shared public bank."""
    settings = get_factory_settings()
    factory = PaperFactory(settings)

    request = GenerationRequest(
        exam_query=args.exam,
        stage=args.stage,
        mode="custom_mock",
        language=args.language,
        question_count=args.count,
        random_seed=args.seed or uuid.uuid4().hex,
        use_bank=False,
        publish=False,
    )

    def on_stage(stage: str) -> None:
        print(f"[stage] {stage}", file=sys.stderr)

    result = await factory.generate(request, on_stage=on_stage)
    generated = [q for q in result.questions if q.source_class == "generated"]

    if args.dry_run:
        _print(
            {
                "would_insert": len(generated),
                "public": args.public,
                "quality_score": result.quality_score,
                "by_section": {
                    section.code: sum(
                        1 for q in generated if q.section_code == section.code
                    )
                    for section in result.blueprint.sections
                },
            }
        )
        return 0

    ids = await asyncio.to_thread(
        factory.repo.insert_questions,
        generated,
        exam=result.blueprint.exam,
        language=result.blueprint.language,
        blueprint=result.blueprint,
        make_public=args.public,
    )
    _print(
        {
            "inserted": len(ids),
            "exam": result.blueprint.exam.code,
            "public": args.public,
            "is_verified": False,
            "quality_score": result.quality_score,
            "note": "Inserted questions are unverified and require admin review.",
        }
    )
    return 0


async def cmd_worker(args: argparse.Namespace) -> int:
    processed = await worker_loop(settings=get_factory_settings(), once=args.once)
    _print({"processed_jobs": processed})
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="paper-factory",
        description="Generate complete government exam mock papers with AI.",
    )
    parser.add_argument("--log-level", default="INFO")
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("exams", help="List approved exams available for generation")

    def add_common(target: argparse.ArgumentParser) -> None:
        target.add_argument("--exam", required=True, help="Exam code, name, alias or id")
        target.add_argument("--stage", default=None, help="Stage code or name")
        target.add_argument("--language", default="en", help="Paper language code")
        target.add_argument("--count", type=int, default=None, help="Question count")
        target.add_argument("--duration", type=int, default=None, help="Minutes")
        target.add_argument("--seed", default=None, help="Deterministic random seed")

    plan = sub.add_parser("plan", help="Show the blueprint without calling any AI")
    add_common(plan)
    plan.add_argument(
        "--mode",
        default="generated_mock",
        choices=["official_previous", "generated_mock", "custom_mock", "adaptive"],
    )

    generate = sub.add_parser("generate", help="Generate a complete mock paper")
    add_common(generate)
    generate.add_argument(
        "--mode",
        default="generated_mock",
        choices=["official_previous", "generated_mock", "custom_mock", "adaptive"],
    )
    generate.add_argument("--user", default=None, help="Owner user id (required to publish)")
    generate.add_argument("--title", default=None, help="Override the paper title")
    generate.add_argument("--out", default=None, help="Directory for JSON/HTML exports")
    generate.add_argument(
        "--dry-run", action="store_true", help="Generate without writing to the database"
    )
    generate.add_argument(
        "--no-bank", action="store_true", help="Ignore existing bank items"
    )

    bank = sub.add_parser("bank-build", help="Grow the question bank for an exam")
    add_common(bank)
    bank.add_argument(
        "--public",
        action="store_true",
        help="Insert as public bank items (still unverified, pending review)",
    )
    bank.add_argument("--dry-run", action="store_true", help="Preview without inserting")

    worker = sub.add_parser("worker", help="Process queued generation jobs")
    worker.add_argument("--once", action="store_true", help="Process one job then exit")

    return parser


HANDLERS = {
    "exams": cmd_exams,
    "plan": cmd_plan,
    "generate": cmd_generate,
    "bank-build": cmd_bank_build,
    "worker": cmd_worker,
}


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    configure_logging(args.log_level)
    try:
        return asyncio.run(HANDLERS[args.command](args))
    except PaperFactoryError as exc:
        print(json.dumps({"error": exc.code, "message": exc.message}), file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
