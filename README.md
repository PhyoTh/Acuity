# DevLens

An interactive, **live technical-interview** platform. A candidate solves a coding problem in a
Monaco IDE with an embedded **AI assistant**, while a recruiter silently watches a **real-time
telemetry + evaluation dashboard**.

The defining twist is a **Hallucination Injector**: the AI's correct output is, with a
recruiter-configured probability, subtly rewritten to contain plausible flaws — so the interview
measures whether candidates *critically evaluate* AI rather than blindly copy it.

> **Status:** Deliverable 1 is code-complete (auth, interview rooms, live WebSocket sync, AI
> assistant, hallucination injector, and LLM scorecard) and statically verified. To run it you need
> a free Supabase project + an Anthropic key — see **[SETUP.md](SETUP.md)** for a step-by-step guide.
> See [plan.md](plan.md) for the roadmap/status and [CLAUDE.md](CLAUDE.md) for architecture +
> conventions.

— Sithu Soe (A17342422) · Phyo Thant (A18498144)

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router, TS), TailwindCSS, Monaco Editor |
| Backend | FastAPI (Python), native asyncio WebSockets |
| Orchestration | LangGraph / LangChain + **Anthropic Claude** |
| Database | Supabase Postgres (SQLAlchemy 2.0 async + Alembic) |
| Cache / Pub-Sub | Redis |
| Auth | Supabase Auth |
| Deployment | Render |

## Quickstart

Prereqs: [Docker](https://docs.docker.com/get-docker/),
[uv](https://docs.astral.sh/uv/), [pnpm](https://pnpm.io/installation).

```bash
# 1. Infra (local Postgres + Redis)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env            # then fill in ANTHROPIC_API_KEY + SUPABASE_*
uv sync
uv run python -m uvicorn app.main:app --reload    # http://localhost:8000  (GET /health)

# 3. Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev                        # http://localhost:3000
```

See [CLAUDE.md](CLAUDE.md) for the full command reference and conventions.
