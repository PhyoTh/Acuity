# CLAUDE.md

Guidance for Claude (and any coding agent) working in this repo. For the **roadmap, locked
decisions, data model, and task list**, read [plan.md](plan.md) — it is the source of truth and is
not duplicated here.

## What DevLens is

A live technical-interview platform: a candidate codes in a Monaco IDE with an embedded AI
assistant; a recruiter watches a hidden real-time telemetry + scorecard dashboard. The signature
feature is the **Hallucination Injector** — with a recruiter-set probability, the AI's correct
answer is subtly rewritten to contain plausible flaws, so the interview tests whether candidates
*critically evaluate* AI output instead of copying it. Original spec:
`Sithu_Soe__Phyo_Thant_Project_Proposal.pdf`.

> **Project status:** Deliverable 1 is **implemented and statically verified** (ruff, mypy strict,
> backend import, `pnpm build`). The full loop exists: auth + role routing, room create/join, live
> WebSocket sync, the LangGraph+Claude agent, the hallucination injector, async telemetry, and the
> LLM scorecard. What's left for D1 is a live run with real Supabase + Anthropic credentials (see
> [SETUP.md](SETUP.md)) and deployment. Track exact status in [plan.md](plan.md) §6/§8.

## Tech stack (locked — see plan.md §3 before changing)

- **Frontend:** Next.js (App Router, TypeScript), TailwindCSS, Monaco (`@monaco-editor/react`),
  Supabase JS — managed with **pnpm**.
- **Backend:** FastAPI + native asyncio WebSockets, **SQLAlchemy 2.0 async** + **asyncpg** +
  **Alembic**, Redis, LangGraph/LangChain + **Anthropic Claude** (`langchain-anthropic`) —
  managed with **uv**.
- **Data + auth:** a single **Supabase** project provides both Postgres (app data) and Auth. Our
  tables are managed by our own Alembic migrations and live beside Supabase's `auth` schema.
- **Infra:** Redis + Postgres locally via Docker; prod on Supabase + Render.

## Repo structure

```
DevLens/
├── plan.md / CLAUDE.md          # roadmap+status / this file
├── docker-compose.yml           # local Postgres + Redis
├── .env.example                 # all env vars documented
├── frontend/                    # Next.js app (App Router)
│   ├── app/
│   │   ├── (auth)/login|signup  # auth pages
│   │   ├── interview/[roomId]/  # candidate IDE view
│   │   └── dashboard/[roomId]/  # recruiter dashboard
│   ├── components/{Editor,Chat,Dashboard}/
│   └── lib/                     # supabase.ts, ws.ts clients
└── backend/                     # FastAPI app
    └── app/
        ├── main.py              # app factory + /health
        ├── config.py           # pydantic-settings Settings
        ├── routers/{auth,interview,ws}.py
        ├── services/{agent,hallucinator,telemetry,scorecard,executor,pushback,llm}.py
        ├── db/{base.py,models.py}
        └── migrations/          # Alembic
```

Where things go: HTTP/WS endpoints → `routers/`; business logic + LLM calls → `services/`; SQLAlchemy
models + session → `db/`; React UI → `frontend/components` + `frontend/app`; browser-side clients
(Supabase, WebSocket) → `frontend/lib`.

## Commands

```bash
# Infra
docker compose up -d                              # start Postgres + Redis
docker compose down                               # stop

# Backend (run from backend/)
uv sync                                           # install deps into .venv
uv run python -m uvicorn app.main:app --reload              # dev server :8000  (GET /health)
uv run alembic revision --autogenerate -m "msg"   # new migration
uv run alembic upgrade head                       # apply migrations
uv run ruff check . && uv run ruff format .       # lint + format
uv run mypy app                                   # type-check

# Frontend (run from frontend/)
pnpm install
pnpm dev                                          # dev server :3000
pnpm build && pnpm start                          # prod build
pnpm lint
```

Env: copy `backend/.env.example` → `backend/.env` and `frontend/.env.local.example` →
`frontend/.env.local`, then fill in `ANTHROPIC_API_KEY` + `SUPABASE_*`. **Never commit real env
files or secrets** (`.gitignore` keeps only `*.example`). The backend service-role key and JWT
secret must stay server-side; only `NEXT_PUBLIC_*` vars reach the browser.

## Conventions

- **Backend is async end-to-end.** Use the async SQLAlchemy session, `redis.asyncio`, and async
  LangChain calls. **Never block the event loop** — no sync DB drivers, no `time.sleep`, no
  synchronous `supabase-py` in request/WS paths. Telemetry writes must be non-blocking
  (background task / queue), never on the critical WS path.
- **Auth:** the backend verifies the Supabase JWT itself in `app/security.py` — ES256/RS256 user
  tokens via the Supabase **JWKS** endpoint, plus HS256 (`SUPABASE_JWT_SECRET`) for dev tokens — and
  loads the matching `profiles` row; don't trust client-supplied roles.
- **Redis channels** are named `room:{id}` (see plan.md §5). The recruiter sees the
  `was_hallucinated` flag on AI responses; the candidate must not.
- **Migrations:** schema changes go through Alembic (`autogenerate` from `db/models.py`), never
  hand-edited SQL. This keeps two devs' schema changes ordered and reviewable.
- **Style:** TypeScript `strict`; Python formatted/linted with **ruff** and type-checked with
  **mypy**. Match surrounding code; keep modules small and single-purpose.
- **Secrets & model:** all LLM calls go through Claude via `langchain-anthropic`; the model id is
  env-driven (`ANTHROPIC_MODEL`).

## Architecture notes

- **Real-time flow:** candidate IDE → WS → FastAPI gateway publishes to `room:{id}` (Redis) → all
  room subscribers (recruiter dashboard) receive identical state. Code changes are debounced
  client-side and the diffs are logged asynchronously to `events`.
- **AI chain:** `agent.py` (LangGraph + Claude, conditioned on current code + room guardrails)
  produces an answer → `hallucinator.py` rolls against `hallucination_pct` and, if it hits, does a
  second Claude pass to subtly corrupt it → the turn is stored in `transcripts` with
  `was_hallucinated` → streamed back as `ai_response`.
- **Scorecard:** on `interview_end`, `scorecard.py` reads the room's full `transcripts` + `events`
  and asks Claude for structured JSON across the 4 dimensions (plan.md §3), stored in `scorecards`.
- **Deliverable 2 (plan.md §7):** code execution via `executor.py` (**Wandbox** API — Piston is
  whitelist-only) behind `POST /rooms/{id}/run`; AI query quota via Redis `INCR` in `ws.py`;
  copy-paste flags + `code_run` logged to `events`; recruiter replay reads `GET /rooms/{id}/events`;
  opt-in push-back questions (`pushback.py`) are recruiter-only (stripped from candidate sockets).

## Working agreement

- Respect the locked decisions in plan.md §3; if one seems wrong, flag it rather than silently
  diverging (two agents are working in parallel).
- When you finish a task, update plan.md §6 checkboxes and the §8 status table so the other
  teammate's agent sees current state.
- Keep changes scoped; prefer reusing the existing structure over inventing new patterns.
