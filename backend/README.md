# DevLens Backend

FastAPI real-time gateway + AI services. See the repo root [CLAUDE.md](../CLAUDE.md) for
conventions and [plan.md](../plan.md) for the roadmap.

## Run

```bash
cp .env.example .env          # fill in ANTHROPIC_API_KEY + SUPABASE_*
uv sync                       # create .venv + install deps
uv run python -m uvicorn app.main:app --reload   # http://localhost:8000

# DB migrations (after models are defined)
uv run alembic revision --autogenerate -m "create core tables"
uv run alembic upgrade head

# Lint / type-check
uv run ruff check . && uv run ruff format .
uv run mypy app
```

Requires Postgres + Redis (`docker compose up -d` from the repo root).

## Layout

- `app/main.py` — app factory + `/health`
- `app/config.py` — env-driven settings
- `app/routers/` — HTTP + WebSocket endpoints (`auth`, `interview`, `ws`)
- `app/services/` — business logic + LLM (`agent`, `hallucinator`, `telemetry`, `scorecard`)
- `app/db/` — SQLAlchemy base/session + models
- `migrations/` — Alembic
