"""Supabase JWT verification + profile bootstrap.

Supabase user session tokens are signed with asymmetric keys (ES256/RS256) and verified via the
project's JWKS endpoint; the legacy HS256 shared secret is also accepted (used by
scripts/mint_test_token.py). Tokens carry audience `authenticated` and the user id in `sub`. On the
first authenticated request we bootstrap a `profiles` row using the role in `user_metadata.role`
(set at signup: interviewer signup -> interviewer; candidate invite -> candidate).
"""

from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import get_session
from app.db.models import Profile, Role

settings = get_settings()
_bearer = HTTPBearer(auto_error=True)

# Supabase signs user session tokens with asymmetric keys (ES256/RS256); their public keys are
# served as JWKS. Cached after first fetch.
_jwks_client: PyJWKClient | None = None


def _get_jwks_client() -> PyJWKClient:
    global _jwks_client
    if _jwks_client is None:
        _jwks_client = PyJWKClient(
            f"{settings.supabase_url}/auth/v1/.well-known/jwks.json",
            headers={"apikey": settings.supabase_anon_key},
        )
    return _jwks_client


@dataclass
class TokenData:
    user_id: uuid.UUID
    email: str | None
    role_hint: Role  # from user_metadata.role; used only to bootstrap a new profile


def decode_token(token: str) -> TokenData:
    """Verify a Supabase JWT and extract identity. Raises 401 on any failure.

    Real Supabase user tokens are ES256/RS256 (verified via JWKS). HS256 (legacy shared secret)
    is also accepted so locally minted dev tokens work (scripts/mint_test_token.py).
    """
    try:
        alg = str(jwt.get_unverified_header(token).get("alg", ""))
        if alg == "HS256":
            payload = jwt.decode(
                token,
                settings.supabase_jwt_secret,
                algorithms=["HS256"],
                audience=settings.jwt_audience,
            )
        else:
            signing_key = _get_jwks_client().get_signing_key_from_jwt(token)
            payload = jwt.decode(
                token,
                signing_key.key,
                algorithms=["ES256", "RS256"],
                audience=settings.jwt_audience,
            )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token"
        ) from exc

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Token missing subject"
        )

    meta = payload.get("user_metadata") or {}
    role_value = meta.get("role", Role.candidate.value)
    role_hint = Role(role_value) if role_value in {r.value for r in Role} else Role.candidate

    return TokenData(user_id=uuid.UUID(str(sub)), email=payload.get("email"), role_hint=role_hint)


async def get_token_data(
    creds: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> TokenData:
    return decode_token(creds.credentials)


async def get_current_profile(
    token: Annotated[TokenData, Depends(get_token_data)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Profile:
    """Return the caller's profile, creating it on first authenticated request."""
    profile = await session.get(Profile, token.user_id)
    if profile is None:
        profile = Profile(id=token.user_id, role=token.role_hint, display_name=token.email)
        session.add(profile)
        await session.commit()
        await session.refresh(profile)
    return profile


def require_role(*roles: Role) -> Callable[..., Awaitable[Profile]]:
    """Dependency factory: require the caller's profile to have one of `roles`."""

    async def _checker(
        profile: Annotated[Profile, Depends(get_current_profile)],
    ) -> Profile:
        if profile.role not in roles:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient role")
        return profile

    return _checker
