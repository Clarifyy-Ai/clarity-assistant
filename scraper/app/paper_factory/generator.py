"""Concurrent, self-repairing AI question generation for a planned paper.

Strategy: over-fetch each batch slightly, validate everything sequentially so dedup is
deterministic, bank surplus candidates as section spares, then run bounded repair rounds
for any remaining shortfall. The paper is only ever published at the exact planned count.
"""
from __future__ import annotations

import asyncio
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Awaitable, Callable, Sequence

from app.core.logger import get_logger
from app.ai_policy import FEATURE_POLICIES, mcq_output_token_budget
from app.paper_factory.ai import MCQGenerator
from app.paper_factory.blueprint import split_slots_for_batching
from app.paper_factory.models import (
    ExamContext,
    GenerationSlot,
    PaperBlueprint,
    PaperQuestion,
)
from app.paper_factory.prompts import build_generation_prompt, build_repair_prompt
from app.paper_factory.validate import CandidateValidator

log = get_logger("paper_factory.generator")

OVERFETCH = FEATURE_POLICIES["paper_factory_mcq"].overfetch
ProgressHook = Callable[[int, int], Awaitable[None] | None]


@dataclass
class GenerationReport:
    accepted: dict[str, list[PaperQuestion]] = field(default_factory=dict)
    spares: dict[str, list[PaperQuestion]] = field(default_factory=dict)
    ai_calls: int = 0
    rejected: int = 0
    reasons: Counter = field(default_factory=Counter)
    shortfalls: dict[str, int] = field(default_factory=dict)

    @property
    def total_accepted(self) -> int:
        return sum(len(items) for items in self.accepted.values())


async def _emit(hook: ProgressHook | None, done: int, total: int) -> None:
    if hook is None:
        return
    result = hook(done, total)
    if asyncio.iscoroutine(result):
        await result


async def generate_for_slots(
    *,
    exam: ExamContext,
    blueprint: PaperBlueprint,
    slots: Sequence[GenerationSlot],
    generator: MCQGenerator,
    validator: CandidateValidator,
    batch_size: int,
    max_repair_rounds: int,
    on_progress: ProgressHook | None = None,
) -> GenerationReport:
    """Generate exactly the questions each slot asks for, repairing shortfalls."""
    report = GenerationReport()
    if not slots:
        return report

    remaining: dict[str, int] = {}
    slot_by_key: dict[str, GenerationSlot] = {}
    for slot in slots:
        remaining[slot.key] = remaining.get(slot.key, 0) + slot.count
        slot_by_key[slot.key] = slot
        report.accepted.setdefault(slot.key, [])

    target_total = sum(remaining.values())
    spares: dict[str, list[PaperQuestion]] = defaultdict(list)
    round_reasons: dict[str, list[str]] = defaultdict(list)

    for round_index in range(max_repair_rounds + 1):
        remaining_before = sum(remaining.values())
        pending = [
            GenerationSlot(
                section_code=slot_by_key[key].section_code,
                section_name=slot_by_key[key].section_name,
                topic=slot_by_key[key].topic,
                difficulty=slot_by_key[key].difficulty,
                count=count,
            )
            for key, count in remaining.items()
            if count > 0
        ]
        if not pending:
            break

        batches = split_slots_for_batching(pending, batch_size)
        log.info(
            "paper_factory_generation_round",
            round=round_index + 1,
            batches=len(batches),
            outstanding=sum(remaining.values()),
        )

        async def run_batch(batch: GenerationSlot) -> tuple[GenerationSlot, list[dict], str | None]:
            request = GenerationSlot(
                section_code=batch.section_code,
                section_name=batch.section_name,
                topic=batch.topic,
                difficulty=batch.difficulty,
                count=batch.count + OVERFETCH,
            )
            common = {
                "exam": exam,
                "slot": request,
                "language": blueprint.language,
                "marks_positive": blueprint.marks_per_question,
                "marks_negative": blueprint.negative_mark,
                "avoid_stems": validator.accepted_stems[-8:],
                "attempt": round_index + 1,
            }
            prompt = (
                build_generation_prompt(**common)
                if round_index == 0
                else build_repair_prompt(
                    **common, rejection_reasons=round_reasons.get(batch.key, [])
                )
            )
            try:
                response = await generator.generate(
                    prompt,
                    max_output_tokens=mcq_output_token_budget(request.count),
                )
                return batch, response.questions, None
            except Exception as exc:  # noqa: BLE001 - one bad batch must not kill the paper
                log.warning(
                    "paper_factory_batch_failed", slot=batch.key, error=str(exc)
                )
                return batch, [], str(exc)

        results = await asyncio.gather(*(run_batch(batch) for batch in batches))
        report.ai_calls = generator.call_count
        round_reasons.clear()

        # Validation is sequential so duplicate detection sees a stable accepted set.
        for batch, candidates, error in results:
            if error:
                round_reasons[batch.key].append(f"provider error: {error[:120]}")
            for candidate in candidates:
                outcome = validator.evaluate(
                    candidate,
                    slot=batch,
                    marks_positive=blueprint.marks_per_question,
                    marks_negative=blueprint.negative_mark,
                    language=blueprint.language,
                )
                if not outcome.accepted:
                    report.rejected += 1
                    reason = outcome.reason or "unknown"
                    report.reasons[reason] += 1
                    round_reasons[batch.key].append(reason)
                    continue

                question = outcome.question
                assert question is not None
                if remaining.get(batch.key, 0) > 0:
                    report.accepted[batch.key].append(question)
                    remaining[batch.key] -= 1
                else:
                    spares[batch.section_code].append(question)

        await _emit(on_progress, target_total - sum(remaining.values()), target_total)

        # Backfill from same-section spares before spending another AI round.
        for key, count in list(remaining.items()):
            if count <= 0:
                continue
            pool = spares.get(slot_by_key[key].section_code)
            while count > 0 and pool:
                report.accepted[key].append(pool.pop())
                count -= 1
            remaining[key] = count

        if sum(remaining.values()) == 0:
            break
        if remaining_before == sum(remaining.values()):
            log.info(
                "paper_factory_generation_no_progress",
                round=round_index + 1,
                outstanding=remaining_before,
            )
            break

    report.spares = {code: list(items) for code, items in spares.items() if items}
    report.shortfalls = {key: count for key, count in remaining.items() if count > 0}
    await _emit(on_progress, target_total - sum(remaining.values()), target_total)
    return report
