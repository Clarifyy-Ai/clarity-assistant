"""Scrape job lifecycle endpoints (admin only)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.config import Settings, get_settings
from app.core.security import get_admin_user, supabase_admin
from app.models.schemas import (
    JobState,
    JobStatus,
    StartScrapeRequest,
    StartScrapeResponse,
)
from app.scraper.sources import supported_exam_types
from app.workers.scrape_worker import registry

router = APIRouter(prefix="/scrape", tags=["scrape"])


@router.get("/sources")
async def sources(_admin: dict = Depends(get_admin_user)) -> dict[str, list[str]]:
    return {"supported": supported_exam_types()}


@router.post("/start", response_model=StartScrapeResponse, status_code=202)
async def start(
    body: StartScrapeRequest,
    admin: dict = Depends(get_admin_user),
    settings: Settings = Depends(get_settings),
    db: Client = Depends(supabase_admin),
) -> StartScrapeResponse:
    state = await registry.create(
        exam_type=body.exam_type.upper(),
        year_from=body.year_from,
        year_to=body.year_to,
        settings=settings,
        supabase=db,
        created_by=admin.get("id"),
    )
    return StartScrapeResponse(job_id=state.job_id, status="queued")


@router.get("/{job_id}", response_model=JobState)
async def get_job(
    job_id: str,
    _admin: dict = Depends(get_admin_user),
) -> JobState:
    snap = registry.snapshot(job_id)
    if not snap:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown job")
    return snap


@router.post("/{job_id}/pause")
async def pause(job_id: str, _admin: dict = Depends(get_admin_user)) -> dict[str, str]:
    if not registry.pause(job_id):
        raise HTTPException(status_code=409, detail="Job not running")
    return {"status": JobStatus.PAUSED.value}


@router.post("/{job_id}/resume")
async def resume(job_id: str, _admin: dict = Depends(get_admin_user)) -> dict[str, str]:
    if not registry.resume(job_id):
        raise HTTPException(status_code=409, detail="Job not paused")
    return {"status": JobStatus.RUNNING.value}


@router.post("/{job_id}/cancel")
async def cancel(job_id: str, _admin: dict = Depends(get_admin_user)) -> dict[str, str]:
    if not registry.cancel(job_id):
        raise HTTPException(status_code=404, detail="Unknown job")
    return {"status": JobStatus.CANCELLED.value}
