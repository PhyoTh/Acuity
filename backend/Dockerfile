# Acuity backend — FastAPI + native asyncio WebSockets, built with uv.
# Used by Render (runtime: docker). Build context is ./backend.
FROM python:3.12-slim

# uv: fast, reproducible installs straight from the official image.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

WORKDIR /app

# --- Dependency layer (cached unless pyproject/lock change) ---
# pyproject sets [tool.uv] package = false, so only deps are installed.
COPY pyproject.toml uv.lock ./
RUN uv sync --no-dev --frozen

# --- App source ---
COPY . .

# Put the resolved venv on PATH so `uvicorn` / `alembic` are callable directly
# (the render.yaml preDeployCommand runs `alembic upgrade head`).
ENV PATH="/app/.venv/bin:$PATH"

# Render injects $PORT; default to 8000 for local `docker run`.
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
