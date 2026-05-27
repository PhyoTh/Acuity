"""Application settings, loaded from environment / .env via pydantic-settings."""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database / cache
    database_url: str = "postgresql+asyncpg://acuity:acuity@localhost:5432/acuity"
    redis_url: str = "redis://localhost:6379/0"

    # Supabase (server-side)
    supabase_url: str = ""
    supabase_anon_key: str = ""
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = ""
    jwt_audience: str = "authenticated"

    # Anthropic — default to the cheapest capable model to keep API cost low.
    # Bump to claude-sonnet-4-6 for higher quality if budget allows.
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-haiku-4-5-20251001"
    anthropic_max_tokens: int = 1024

    # CORS
    frontend_origin: str = "http://localhost:3000"


@lru_cache
def get_settings() -> Settings:
    """Cached settings accessor (instantiated once per process)."""
    return Settings()
