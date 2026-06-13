"""Supabase JWT verification + admin-role enforcement."""
from __future__ import annotations

from functools import lru_cache
from typing import Any

import httpx
import jwt
from fastapi import Depends, Header, HTTPException, status
from jwt import PyJWKClient
from supabase import Client, create_client

from app.core.config import Settings, get_settings


@lru_cache
def _jwks_client(jwks_url: str) -> PyJWKClient:
    return PyJWKClient(jwks_url, cache_keys=True)


@lru_cache
def _service_client(url: str, key: str) -> Client:
    return create_client(url, key)


def verify_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a Supabase JWT against the project JWKS."""
    try:
        signing_key = _jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256", "ES256"],
            audience=settings.supabase_jwt_aud,
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
    claims = verify_jwt(token, settings)
    user_id = claims.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing sub"
        )

    # Cross-check the admin role via the service-role client (RLS bypass).
    db = _service_client(settings.supabase_url, settings.supabase_service_role_key)
    res = (
        db.table("user_roles")
        .select("role")
        .eq("user_id", user_id)
        .eq("role", "admin")
        .limit(1)
        .execute()
    )
    if not res.data:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required"
        )

    return {"id": user_id, "claims": claims}


def supabase_admin(settings: Settings = Depends(get_settings)) -> Client:
    """FastAPI dependency that returns a memoised service-role Supabase client."""
    return _service_client(settings.supabase_url, settings.supabase_service_role_key)
