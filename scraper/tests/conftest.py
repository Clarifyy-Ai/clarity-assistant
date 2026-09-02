"""Pytest bootstrap — set fail-closed factory env before app imports.

Production still requires a real auth user UUID via SYSTEM_USER_ID.
This dummy is only for local unit tests that import the FastAPI app.
Embedded workers stay off in tests so supabase-py is never constructed
with placeholder keys during TestClient lifespan.
"""
from __future__ import annotations

import os

os.environ.setdefault(
    "SYSTEM_USER_ID", "00000000-0000-4000-8000-000000000001"
)
os.environ.setdefault("DOCUMENT_WORKER_EMBEDDED", "false")
os.environ.setdefault("PAPER_FACTORY_EMBEDDED_WORKER", "false")
