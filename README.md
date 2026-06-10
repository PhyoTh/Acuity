# Acuity

Site: https://acuity-phyo.duckdns.org

Initial Demo Video: https://www.youtube.com/watch?v=ULcqjiKwaZw

Final Demo Video: https://youtu.be/CkgukYmBdmM

A **live technical-interview platform**. A candidate solves a coding problem in a Monaco IDE with
an embedded **AI assistant**, while an interviewer silently watches a **real-time telemetry +
evaluation dashboard**.

## Features

- **Live IDE mirror.** The candidate types in Monaco; the interviewer sees the same code with an
  amber caret tracking the candidate's cursor in real time.
- **Multi-file projects.** Drag-drop files or a whole folder when creating a session. The
  candidate gets the same tree with inline rename / delete / new-file / new-folder. Edits sync
  live; structural changes broadcast a refetch.
- **AI assistant with stacked guardrails.** Pick one or more presets (hints only, no full
  solutions, explain don't write, syntax only, open) — they compose, strictest wins. Replies
  render as markdown and see the whole project as context.
- **Hallucination Injector.** With probability `p`, a second Claude pass rewrites the reply to
  contain plausible flaws. The interviewer sees a flag on hallucinated turns; the candidate never
  does.
- **Hidden tests, two run modes.** Stdin mode (script reads input, prints output) and call mode
  (LeetCode-style function-call expression with an auto-appended harness). Output comparison is
  JSON-aware and whitespace-tolerant.
- **Interactive terminal.** The candidate runs `ls`, `cat`, `run`, `python main.py`, etc. against
  their file tree; output mirrors to the interviewer.
- **Monitoring + replay.** Tab-switch detection, large-paste flags, idle-gap detection, and a
  replay timeline with idle bands and event markers for tab switches, pastes, and runs.
- **Waiting room.** Candidates wait for explicit admit; the interviewer admits or kicks from a
  participants popover.
- **Two-phase end-interview.** The session flips to summary mode immediately; Claude generates the
  scorecard in the background and emits `scorecard_ready` when finished.
- **Interviewer-chosen hallucination type.** Beyond the probability, the interviewer picks *what
  kind* of flaw the injector introduces (logic / off-by-one, wrong API, edge case, inefficiency,
  security, or mixed) to match what the interview should test.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router, TS), TailwindCSS, Monaco Editor, react-resizable-panels, react-markdown |
| Backend | FastAPI (Python), native asyncio WebSockets |
| Orchestration | LangGraph / LangChain + Anthropic Claude |
| Database | Supabase Postgres (SQLAlchemy 2.0 async + Alembic) |
| Cache / pub-sub | Redis |
| Code execution | Wandbox API |
| Auth | Supabase Auth |
| Deployment | Docker Compose on a VM (Caddy HTTPS/wss) — see [DEPLOY.md](DEPLOY.md) |

## Quickstart

Prereqs: [Docker](https://docs.docker.com/get-docker/), [uv](https://docs.astral.sh/uv/),
[pnpm](https://pnpm.io/installation). You'll also need a free [Supabase](https://supabase.com)
project (URL, anon key, service-role key, JWT secret) and an
[Anthropic API key](https://console.anthropic.com).

```bash
# 1. Infra (local Postgres + Redis)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env            # fill in ANTHROPIC_API_KEY + SUPABASE_*
uv sync
uv run alembic upgrade head     # apply migrations
uv run python -m uvicorn app.main:app --reload    # http://localhost:8000  (GET /health)

# 3. Frontend (new terminal)
cd frontend
cp .env.local.example .env.local    # fill in NEXT_PUBLIC_SUPABASE_*
pnpm install
pnpm dev                        # http://localhost:3000
```

Then open `http://localhost:3000/signup`, create an interviewer account, create a session, and
open the candidate invite link (`/join/<CODE>`) in an incognito window.

> Access the app at `http://localhost:3000`, not a LAN IP — the frontend bakes in
> `NEXT_PUBLIC_API_URL=http://localhost:8000` and the backend CORS allow-list is
> `http://localhost:3000`.

## Demo mode (no credentials)

To try the full product **without a Supabase project or Anthropic key**, run in demo mode. The
AI returns canned deterministic responses (including a hallucinated turn) and auth is satisfied by
one-click demo identities. Only Postgres + Redis (`docker compose`) are needed.

```bash
docker compose up -d

cd backend
cp .env.example .env            # leave SUPABASE_*/ANTHROPIC_* as placeholders
echo "DEMO_MODE=true" >> .env
uv sync && uv run alembic upgrade head
uv run python -m uvicorn app.main:app --reload

# new terminal
cd frontend
cp .env.local.example .env.local
echo "NEXT_PUBLIC_DEMO_MODE=true" >> .env.local
pnpm install && pnpm dev
```

Then open `http://localhost:3000/login` → **Enter as interviewer** → create a session → copy the
candidate invite link → open it in an **incognito window** (it auto-joins as a candidate). Admit
the candidate, run the interview, and end it to see the (canned) scorecard. Never enable demo mode
in production.

See [CLAUDE.md](CLAUDE.md) for the full command reference, architecture, and conventions.
