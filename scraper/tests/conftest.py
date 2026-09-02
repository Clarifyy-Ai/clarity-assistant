"""Pytest bootstrap — set fail-closed factory env before app imports.

Production still requires a real auth user UUID via SYSTEM_USER_ID.
This dummy is only for local unit tests that import the FastAPI app.
"""
from __future__ import annotations

import os

os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role-key")
os.environ.setdefault(
    "SYSTEM_USER_ID", "00000000-0000-4000-8000-000000000001"
)
os.environ.setdefault("PAPER_FACTORY_WORKER_MODE", "true")
