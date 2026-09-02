"""Supabase JWT verification + admin-role enforcement."""
from __future__ import annotations

import asyncio
from functools import lru_cache
from typing import Any

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from supabase import Client, create_client

from app.core.bounded import ADMIN_AUTH_TIMEOUT_SECONDS, await_bounded, SUPABASE_HTTP_TIMEOUT_SECONDS

from app.core.config import Settings, get_settings


@lru_cache
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True, timeout=int(ADMIN_AUTH_TIMEOUT_SECONDS))


def _client_options(timeout_seconds: float):
    try:
        from supabase.lib.client_options import ClientOptions

        return ClientOptions(postgrest_client_timeout=timeout_seconds)
    except Exception:  # noqa: BLE001 - older supabase-py
        return None


@lru_cache
def _service_client(url: str, key: str) -> Client:
    options = _client_options(SUPABASE_HTTP_TIMEOUT_SECONDS)
    if options is None:
        return create_client(url, key)
    return create_client(url, key, options=options)


def verify_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a Supabase JWT against the project JWKS."""
    try:
        signing_key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.supabase_jwt_aud,
            issuer=f"{settings.supabase_url.rstrip('/')}/auth/v1",
            options={"require": ["exp", "sub"]},
        )
    except (jwt.PyJWTError, httpx.HTTPError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        ) from exc


async def get_admin_user(
    authorization: str | None = Header(default=None),
    settings: Settings = Depends(get_settings),
) -> dict[str, Any]:
    """FastAPI dependency: enforce a valid Supabase JWT with admin role."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token"
        )

    token = authorization.split(" ", 1)[1].strip()
    claims = await await_bounded(
        asyncio.to_thread(verify_jwt, token, settings),
        ADMIN_AUTH_TIMEOUT_SECONDS,
        code="AUTH_TIMEOUT",
        message="JWT verification timed out.",
        stage="jwt",
    )
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub"
        )

    # Cross-check the admin role via the service-role client (RLS bypass).
    def _role_lookup() -> object:
        db = _service_client(settings.supabase_url, settings.supabase_service_role_key)
        return (
            db.table("user_roles")
            .select("role")
            .eq("user_id", user_id)
            .eq("role", "admin")
            .limit(1)
            .execute()
        )

    res = await await_bounded(
        asyncio.to_thread(_role_lookup),
        ADMIN_AUTH_TIMEOUT_SECONDS,
        code="AUTH_TIMEOUT",
        message="Admin role lookup timed out.",
        stage="roles",
    )
    if not getattr(res, "data", None):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required"
        )

    return {"id": user_id, "claims": claims}


def create_bounded_supabase_client(url: str, key: str) -> Client:
    """Service-role client with a PostgREST HTTP timeout (no infinite wait)."""
    return _service_client(url, key)


def supabase_admin(settings: Settings = Depends(get_settings)) -> Client:
    """FastAPI dependency that returns a memoised service-role Supabase client."""
    return _service_client(settings.supabase_url, settings.supabase_service_role_key)


import os
import shutil
import tempfile
from pathlib import Path


def sanitize_filename(filename: str) -> str:
    """Sanitizes an untrusted filename to prevent path injection."""
    # Remove directory separators and null bytes
    clean = filename.replace("\\", "/").split("/")[-1].replace("\0", "").strip()
    # Remove unsafe characters
    clean = "".join(c for c in clean if c.isalnum() or c in "._- ")
    return clean[:180] or "unnamed_file"


def validate_safe_path(base_dir: Path | str, untrusted_relative_path: str) -> Path:
    """Resolves an untrusted relative path against base_dir and ensures no path traversal outside base_dir."""
    base = Path(base_dir).resolve()
    target = (base / untrusted_relative_path).resolve()
    try:
        target.relative_to(base)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "code": "PATH_TRAVERSAL_DETECTED",
                "message": "Arbitrary file path access is strictly forbidden.",
                "retryable": False,
            },
        ) from exc
    return target


class IsolatedTempWorkspace:
    """Creates a temporary isolated directory that is guaranteed to be deleted on context exit."""

    def __init__(self, prefix: str = "doc_intel_") -> None:
        self.prefix = prefix
        self.path: Path | None = None

    def __enter__(self) -> Path:
        temp_dir = tempfile.mkdtemp(prefix=self.prefix)
        self.path = Path(temp_dir).resolve()
        return self.path

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        if self.path and self.path.exists():
            shutil.rmtree(self.path, ignore_errors=True)
