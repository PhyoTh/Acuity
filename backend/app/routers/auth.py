"""Auth router — profile bootstrap.

`GET /auth/me` returns the caller's profile, creating it on first authenticated request from the
verified Supabase JWT (role taken from `user_metadata.role`). See app/security.py.
`PATCH /auth/me` updates editable fields (currently just `display_name`).
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.base import get_session
from app.db.models import Profile
from app.schemas import ProfileOut, ProfileUpdate
from app.security import get_current_profile

router = APIRouter(prefix="/auth", tags=["auth"])


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
