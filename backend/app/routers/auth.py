"""Auth router — profile bootstrap.

`GET /auth/me` returns the caller's profile, creating it on first authenticated request from the
verified Supabase JWT (role taken from `user_metadata.role`). See app/security.py.
`PATCH /auth/me` updates editable fields (currently just `display_name`).
`POST /auth/demo-login` (demo mode only) mints a credential-free token for reviewers.
"""

from __future__ import annotations

import time
import uuid
from typing import Annotated, Literal

import jwt
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.db.base import get_session
from app.db.models import Profile
from app.schemas import ProfileOut, ProfileUpdate
from app.security import get_current_profile

router = APIRouter(prefix="/auth", tags=["auth"])


class DemoLoginIn(BaseModel):
    role: Literal["interviewer", "candidate"] = "interviewer"


class DemoLoginOut(BaseModel):
    token: str
    user_id: str
    role: str


@router.post("/demo-login", response_model=DemoLoginOut)
async def demo_login(body: DemoLoginIn) -> DemoLoginOut:
    """Mint a credential-free demo token (HS256, signed with the demo secret).

    Only available when DEMO_MODE is on. Lets reviewers run the full flow without a Supabase
    project — the frontend stores this token and uses it exactly like a real Supabase session.
    Each call mints a fresh identity; the profile is bootstrapped on the first `/auth/me`.
    """
    settings = get_settings()
    if not settings.demo_mode:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    user_id = uuid.uuid4()
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": settings.jwt_audience,
        "email": f"{body.role}@demo.acuity",
        "user_metadata": {"role": body.role},
        "iat": now,
        "exp": now + 8 * 3600,
    }
    token = jwt.encode(payload, settings.demo_jwt_secret, algorithm="HS256")
    return DemoLoginOut(token=token, user_id=str(user_id), role=body.role)


@router.get("/me", response_model=ProfileOut)
async def me(profile: Annotated[Profile, Depends(get_current_profile)]) -> Profile:
    return profile


@router.patch("/me", response_model=ProfileOut)
async def update_me(
    body: ProfileUpdate,
    profile: Annotated[Profile, Depends(get_current_profile)],
    db: Annotated[AsyncSession, Depends(get_session)],
) -> Profile:
    profile.display_name = body.display_name.strip()
    await db.commit()
    await db.refresh(profile)
    return profile
