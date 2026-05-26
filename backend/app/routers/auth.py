"""Auth router — profile bootstrap.

`GET /auth/me` returns the caller's profile, creating it on first authenticated request from the
verified Supabase JWT (role taken from `user_metadata.role`). See app/security.py.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.db.models import Profile
from app.schemas import ProfileOut
from app.security import get_current_profile

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=ProfileOut)
async def me(profile: Annotated[Profile, Depends(get_current_profile)]) -> Profile:
    return profile
