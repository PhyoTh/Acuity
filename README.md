# DevLens

An interactive, **live technical-interview** platform. A candidate solves a coding problem in a
Monaco IDE with an embedded **AI assistant**, while an interviewer silently watches a **real-time
telemetry + evaluation dashboard**.

The defining twist is a **Hallucination Injector**: the AI's correct output is, with an
interviewer-configured probability, subtly rewritten to contain plausible flaws — so the interview
measures whether candidates *critically evaluate* AI rather than blindly copy it.

> **Status:** Deliverable 1 is code-complete (auth, interview sessions, live WebSocket sync, AI
> assistant, hallucination injector, and LLM scorecard) and statically verified. Subsequent
> rounds added the multi-step session wizard, CodeSignal-style resizable layout, waiting room,
> post-mortem summary view, multi-file project support, an interactive shell, tab-switch +
> cursor + idle monitoring, multi-select guardrails, function-call test mode, markdown chat
> rendering, and a richer replay timeline. To run it you need a free Supabase project + an
> Anthropic key — see **[SETUP.md](SETUP.md)** for a step-by-step guide. See [plan.md](plan.md)
> for the roadmap/status and [CLAUDE.md](CLAUDE.md) for architecture + conventions.

— Sithu Soe (A17342422) · Phyo Thant (A18498144)

## What's in the box

- **Live IDE mirror.** Candidate types in Monaco; interviewer sees the same code + an amber
  blinking caret tracking the candidate's cursor position.
- **Multi-file projects.** Drag-drop files (or a whole folder) when creating a session; the
  candidate sees the same tree in their IDE with inline rename / delete / new-file / new-folder
  (VS Code-style — no browser `prompt()`). Folder uploads preserve nested structure. Edits sync
  live to the interviewer; structural changes broadcast a refetch ping.
- **AI assistant with stacked guardrails.** Pick one or more presets (hints only, no full
  solutions, explain don't write, syntax only, open) and they compose — strictest wins. Replies
  render as markdown. Sees the whole multi-file project as context.
- **Hallucination Injector.** With probability `p`, the AI's reply is rewritten by a second
  Claude pass to contain plausible flaws. Interviewer sees a flag on hallucinated turns;
  candidate never does.
- **Hidden tests with two run modes.** Stdin mode (script reads input, prints output) *and*
  call mode (LeetCode-style — set a function-call expression and let the runner appends a
  harness). Output comparison is JSON-aware and whitespace-tolerant.
- **Interactive terminal.** Candidate can type `ls`, `cat <path>`, `run`, `python main.py`, etc.
  against their file tree. Output mirrors to the interviewer dashboard. Tabs for code-run
  output, hidden-test pass/fail, and the shell live in the same panel.
- **Monitoring + replay.** Tab-switch detection (interviewer sees `🔴 candidate is on another
  tab` live), large-paste flags, idle-gap detection from mouse + cursor + code activity, and a
  YouTube-ad-style replay timeline with amber idle bands and event markers for tab switches,
  pastes, and runs.
- **Waiting room.** Candidates wait for explicit admit by the interviewer. Even when the
  interviewer joins *after* the candidate, the initial WS frame delivers the participants
  snapshot directly to the socket (avoiding pub/sub race conditions), so the join request shows
  up instantly without a refresh.
- **Two-phase end-interview** with a confirmation modal. The session flips to summary mode
  immediately; Claude generates the scorecard in the background and emits `scorecard_ready`
  when ready. Candidate budget exhaustion replaces the chat composer with an explicit
  "AI assistance has run out" panel.

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (App Router, TS), TailwindCSS, Monaco Editor, react-resizable-panels, react-markdown |
| Backend | FastAPI (Python), native asyncio WebSockets |
| Orchestration | LangGraph / LangChain + **Anthropic Claude** |
| Database | Supabase Postgres (SQLAlchemy 2.0 async + Alembic) |
| Cache / Pub-Sub | Redis |
| Code execution | Wandbox API (multi-file via `codes[]`) |
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
uv run alembic upgrade head     # apply migrations 0001..0007
uv run python -m uvicorn app.main:app --reload    # http://localhost:8000  (GET /health)

# 3. Frontend (new terminal)
cd frontend
cp .env.local.example .env.local
pnpm install
pnpm dev                        # http://localhost:3000
```

See [CLAUDE.md](CLAUDE.md) for the full command reference, architecture, and conventions.
