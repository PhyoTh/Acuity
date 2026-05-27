# CLAUDE.md

Guidance for Claude (and any coding agent) working in this repo. For the **roadmap, locked
decisions, data model, and task list**, read [plan.md](plan.md) — it is the source of truth and is
not duplicated here.

## What Acuity is

> **Renamed 2026-05-26:** DevLens → **Acuity**. The repo directory is still `DevLens/` (renaming
> a checked-out repo on disk is a per-developer chore), but everywhere the product is referenced
> in code, copy, and docs it is now **Acuity**. The full UI design-system overhaul that
> accompanies the rename lives in [ROADMAP.md](ROADMAP.md).

A live technical-interview platform: a candidate codes in a Monaco IDE with an embedded AI
assistant; an interviewer watches a hidden real-time telemetry + scorecard dashboard. The
signature feature is the **Hallucination Injector** — with an interviewer-set probability, the
AI's correct answer is subtly rewritten to contain plausible flaws, so the interview tests
whether candidates *critically evaluate* AI output instead of copying it. Original spec:
`Sithu_Soe__Phyo_Thant_Project_Proposal.pdf`.

> **Project status:** Deliverable 1 is **implemented and statically verified** (ruff, mypy strict,
> backend import, `pnpm build`). The full loop exists: auth + role routing, session create/join,
> live WebSocket sync, the LangGraph+Claude agent, the hallucination injector, async telemetry,
> and the LLM scorecard. Subsequent rounds (Phases 1–5) added the multi-step wizard, CodeSignal
> layout, waiting room, post-mortem view, multi-file project support, an interactive shell,
> tab-switch + cursor + idle monitoring, multi-select guardrails, function-call test mode,
> markdown chat rendering, and a richer replay timeline. What's left is a live run against real
> Supabase + Anthropic credentials (see [SETUP.md](SETUP.md)) and deployment. Track exact status
> in [plan.md](plan.md) §6/§8.

## Terminology (renamed 2026-05-26)

- "Recruiter" → **interviewer** everywhere (role enum, UI copy, code identifiers).
- "Room" → **session** everywhere (DB tables, URLs, types, vars). An Acuity *session* is one
  interview run — its problem, AI config, transcripts, events, files, and scorecard.

Migration order (apply all seven with `uv run alembic upgrade head`):
- `0001_initial` — initial six tables
- `0002_d2_config` — Deliverable 2 columns
- `0003_rename_room_to_session` — Phase 1 rename (in-place; Postgres 10+ enum value rename)
- `0004_interview_type_token_budget` — Phase 2: adds `interview_type`, `token_budget`; drops
  `query_quota`, `ai_max_tokens`
- `0005_waiting_room` — Phase 3: adds `session_participants.admitted`
- `0006_multi_features` — Phase 5: adds `interview_sessions.guardrail_presets` (JSONB list),
  backfilled from the legacy singular `guardrail_preset` column for multi-select stacking
- `0007_session_files` — Phase 5: adds `session_files` (multi-file projects per session)

## Tech stack (locked — see plan.md §3 before changing)

- **Frontend:** Next.js (App Router, TypeScript), TailwindCSS, Monaco (`@monaco-editor/react`),
  Supabase JS, `react-resizable-panels`, `react-markdown` + `remark-gfm` (chat formatting) —
  managed with **pnpm**.
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
│   │   ├── (auth)/login|signup           # auth pages
│   │   ├── dashboard/                    # interviewer home: searchable session list
│   │   │   ├── new/                      # create-session form (separate route)
│   │   │   └── [sessionId]/              # live interviewer mirror view + summary
│   │   ├── interview/[sessionId]/        # candidate IDE view
│   │   └── join/[code]/                  # candidate invite entry point
│   ├── components/
│   │   ├── ui/                           # Acuity design-system primitives (Aperture,
│   │   │                                 # Wordmark, Pill, Sparkline, SectionLabel, Card,
│   │   │                                 # Stat, Avatar, Icon, CodeBlock, HeatStrip, Progress)
│   │   ├── CreateSessionForm.tsx         # 4-step wizard incl. drag-drop file/folder upload
│   │   ├── DisplayNameModal.tsx          # per-session display-name gate
│   │   ├── Chat/{ChatBox,AIInfoHeader}.tsx
│   │   ├── Editor/{CodeEditor,FileTree,MultiFileEditor}.tsx
│   │   └── Dashboard/{Scorecard,SummaryView,ParticipantsPopover,ReplayTimeline}.tsx
│   ├── app/globals.css          # design tokens + markdown-body + remote-cursor styles
│   └── lib/                     # supabase.ts, ws.ts (SessionSocket), api.ts, types.ts,
│                                # mocks.ts (mock data for unwired UI surfaces)
└── backend/                     # FastAPI app
    └── app/
        ├── main.py              # app factory + /health
        ├── config.py            # pydantic-settings Settings
        ├── routers/{auth,interview,ws}.py
        ├── services/{agent,hallucinator,telemetry,scorecard,executor,pushback,shell,llm,names}.py
        ├── db/{base.py,models.py}  # incl. SessionFile model
        └── migrations/          # Alembic (0001..0007)
```

Where things go: HTTP/WS endpoints → `routers/`; business logic + LLM calls → `services/`;
SQLAlchemy models + session → `db/`; React UI → `frontend/components` + `frontend/app`;
browser-side clients (Supabase, WebSocket) → `frontend/lib`.

## Commands

```bash
# Infra
docker compose up -d                              # start Postgres + Redis
docker compose down                               # stop

# Backend (run from backend/)
uv sync                                           # install deps into .venv
uv run python -m uvicorn app.main:app --reload    # dev server :8000  (GET /health)
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

> **Note (Windows Smart App Control):** if `uv run uvicorn ...` fails with `os error 4551`, run it
> as a module: `uv run python -m uvicorn app.main:app --reload`. Same trick works for any blocked
> shim (`uv run python -m alembic ...`).

Env: copy `backend/.env.example` → `backend/.env` and `frontend/.env.local.example` →
`frontend/.env.local`, then fill in `ANTHROPIC_API_KEY` + `SUPABASE_*`. **Never commit real env
files or secrets** (`.gitignore` keeps only `*.example`). The backend service-role key and JWT
secret must stay server-side; only `NEXT_PUBLIC_*` vars reach the browser.

## Conventions

- **Backend is async end-to-end.** Use the async SQLAlchemy session, `redis.asyncio`, and async
  LangChain calls. **Never block the event loop** — no sync DB drivers, no `time.sleep`, no
  synchronous `supabase-py` in request/WS paths. Telemetry writes must be non-blocking
  (background task / queue), never on the critical WS path. Long-running operations triggered
  from a WS message (shell command, scorecard, push-back) fire as `telemetry.fire(coro)` so the
  inbound socket loop keeps draining.
- **Auth:** the backend verifies the Supabase JWT itself in `app/security.py` — ES256/RS256 user
  tokens via the Supabase **JWKS** endpoint, plus HS256 (`SUPABASE_JWT_SECRET`) for dev tokens —
  and loads the matching `profiles` row; don't trust client-supplied roles.
- **Redis channels** are named `session:{id}` (see plan.md §5). The interviewer sees the
  `was_hallucinated` flag on AI responses; the candidate must not. Push-back questions are also
  stripped from candidate sockets in `_pump_redis_to_ws`.
- **Initial WS state must be sent directly to the new socket,** *not* via the Redis channel.
  `pubsub.subscribe()` is async — a `publish()` immediately after `asyncio.create_task(...)`
  for the listener can fire before the listener has subscribed, so the connecting socket
  misses its own snapshot. `ws.py` sends `participants` + `token_budget` directly with
  `websocket.send_json(...)`; updates that need to fan out (e.g. someone joined) still
  `publish()` to the channel.
- **Migrations:** schema changes go through Alembic (`autogenerate` from `db/models.py`), never
  hand-edited SQL. This keeps two devs' schema changes ordered and reviewable. The rename
  migration `0003_rename_room_to_session` is the one exception (hand-written because it renames
  an enum value, which autogenerate can't infer).
- **Multi-file state authority:** the DB (`session_files`) is canonical. Live content edits
  travel via the `file_change` WS event for sub-debounce mirroring; the structural CRUD
  endpoints (create / rename / delete) commit, then publish `files_dirty` so the *other* side
  refetches. The originating side doesn't refetch — it already has the canonical state from
  its own optimistic update.
- **Admit gate is server-authoritative.** The candidate UI also gates its IDE on
  `admitted === true` (not just `!== false`) so the brief window before the first
  `participants` event arrives stays on the waiting screen rather than rendering optimistically.
- **Style:** TypeScript `strict`; Python formatted/linted with **ruff** and type-checked with
  **mypy**. Match surrounding code; keep modules small and single-purpose.
- **Secrets & model:** all LLM calls go through Claude via `langchain-anthropic`; the model id is
  env-driven (`ANTHROPIC_MODEL`).
- **UI / design system (Acuity):** colors are OKLCH custom properties on `:root` in
  `app/globals.css` — use `var(--bg-1)`, `var(--live)`, etc. Tailwind utilities are still
  used for layout/spacing; do NOT reintroduce ad-hoc neutral-/zinc- palette colors (the old
  DevLens look). Three fonts are loaded via `next/font/google` in `app/layout.tsx`:
  **Instrument Serif** (display), **Geist** (body/UI), **JetBrains Mono** (code, IDs,
  ALL-CAPS section labels). Use the `components/ui/` primitives instead of hand-rolling
  pills, cards, etc.
- **Mock vs live data:** anything the roadmap depicts that doesn't have a backend yet
  (per-user token usage, shared API balance, activity feed, scheduling, share-link, export
  PDF, etc. — see plan.md §9b for the full list) is rendered from `lib/mocks.ts` with no
  live fetch. Treat that file as "to be wired up later"; do not pretend a card is live when
  it isn't. **Real data flows (auth, WS sync, code execution, scorecard) must remain
  untouched** — the overhaul is visual, not behavioral.
- **UI-promised features awaiting backend** (plan.md §9c): **custom guardrail presets**
  (user-scoped library of named policies, beyond the 5 built-ins), **per-user Anthropic
  key** (BYO key stored encrypted on `profiles`), and **session scheduling**
  (`scheduled_at` column + a job that flips `pending → active`). The landing copy + dashboard
  calendar + planned Settings panel all assume these will land — don't promise them in new
  surfaces without flagging them as mock.
- **Wordmark is not a link on authenticated interviewer pages** (sidebar, live-session
  header, summary header). It's a static brand mark — never wrap it in `<Link href="/">`
  inside `/dashboard/*`. If an interviewer wants to log out they use the user menu, not the
  wordmark. (The candidate side intentionally also has a static wordmark.)

## Architecture notes

- **Real-time flow:** candidate IDE → WS → FastAPI gateway publishes to `session:{id}` (Redis) →
  all session subscribers (interviewer dashboard) receive identical state. Code changes are
  debounced client-side and the diffs are logged asynchronously to `events`.
- **AI chain:** `agent.py` (LangGraph + Claude, conditioned on current code + session guardrails)
  produces an answer → `hallucinator.py` rolls against `hallucination_pct` and, if it hits, does a
  second Claude pass to subtly corrupt it → the turn is stored in `transcripts` with
  `was_hallucinated` → streamed back as `ai_response`. The user-message template branches: a
  single buffer is wrapped as `My current <lang> code:\n```...```; a multi-file payload (detected
  by `--- path ---` headers) is wrapped as a labeled project tree so Claude knows it can answer
  questions across files.
- **Multi-select guardrails:** `build_guardrail_system` accepts either a single preset string
  (legacy) or a list. Stacked presets are appended as separate "Guardrail:" clauses so the
  strictest constraints naturally compose. The DB stores both `guardrail_preset` (singular,
  back-compat) and `guardrail_presets` (canonical list).
- **Test execution:** `executor.run_code(language, code|files, entry, stdin, call)`. Two modes:
  - **stdin mode** (default): candidate code runs as-is; `stdin` is piped in; stdout is matched
    against `expected`.
  - **call mode** (when `TestCase.call` is set): a per-language harness is appended to the
    candidate's code that evaluates `call` (e.g. `Solution().twoSum([2,7,11,15], 9)`) and prints
    the result as JSON. Fixes the LeetCode failure mode where pasted class-method solutions
    never read stdin. Supported for Python and JS/TS; other languages fall back to stdin mode.
  - Output comparison is JSON-aware and line-trimmed (`outputs_match` in `executor.py`), so
    `[0, 1]` matches `[0,1]` regardless of formatting.
- **Multi-file projects** (`session_files` table):
  - CRUD via `/sessions/{id}/files` (GET/POST/PATCH/DELETE). Folders are rows with
    `is_folder=True` and empty content. Renaming a folder cascades to descendants in the same
    transaction; deleting a folder removes its subtree.
  - Live content edits stream via WS `file_change` (path + content) for ≤500ms freshness
    between debounced PATCH saves.
  - Structural changes broadcast `files_dirty` on the channel; the interviewer's dashboard
    refetches `listFiles`. The candidate's UI doesn't refetch — they own the change.
  - `executor.run_code` accepts `files` + `entry`. `executor.pick_entry_path` chooses
    `main.<ext>` for the language; Wandbox runs everything via its `codes[]` field.
- **Interactive shell** (`services/shell.py`): the candidate's terminal panel has a Shell tab
  that sends typed commands as `shell_command` WS events. Built-ins (`ls`, `cat`, `pwd`,
  `help`) read from the session's file dict; `run` / `python <file>` / `node <file>` /
  `go run <file>` hand off to `executor.run_code`. Result publishes as `shell_output` to both
  sides; commands are logged to `events` for the replay timeline.
- **Monitoring + telemetry events** (all logged to `events.payload` JSONB, all routed through
  `ws.py`):
  - `tab_switch` — `visibilitychange` listener on the candidate page; payload `{hidden}`.
    Interviewer header shows a live banner + running count, and the replay timeline marks
    hidden periods.
  - `cursor_move` — Monaco `onDidChangeCursorPosition`, throttled to ~10/s. Interviewer's
    read-only Monaco renders an amber blinking caret decoration at the candidate's position.
  - `mouse_move` — global mouse heartbeat, throttled to ~once every 2s. Not broadcast live —
    purely used for idle detection in the replay scrubber.
  - `shell_command` — every typed shell command, payload `{command}`.
  - `file_change` — every keystroke broadcast (not logged in full; only the path is recorded
    to keep `events` small; content lives in `session_files`).
- **Replay timeline** (`components/Dashboard/ReplayTimeline.tsx`): renders the post-mortem
  events feed as a YouTube-ad-style horizontal bar. Idle gaps (>15s with no activity events:
  `code_change`, `cursor_move`, `mouse_move`, `chat_message`, `code_run`, `paste_flag`) appear
  as amber bands with sticky `idle Xs` labels on hover. Tab-switch events (red), large pastes
  (amber tick), and code runs (green tick) appear as vertical markers.
- **Scorecard:** on `interview_end`, `scorecard.py` reads the session's full `transcripts` +
  `events` and asks Claude for structured JSON across the 4 dimensions (plan.md §3), stored in
  `scorecards`. The two-phase end-interview flow (`interview_ended` immediately, then
  `scorecard_ready` once Claude finishes) means the interviewer's IDE flips to summary mode
  without waiting on the LLM. The interviewer's End Interview button shows a confirmation
  modal to prevent accidental clicks.
- **AI exhaustion UX:** when the session's `token_budget` hits zero, the chat composer is
  replaced with an explicit "AI assistance has run out" panel (amber background, disabled
  input + Send button) instead of the previous passive notice — so the candidate can't
  unsuccessfully type into a dead input.
- **Markdown chat:** assistant messages render via `react-markdown` + `remark-gfm` (bold,
  italics, lists, code fences, tables). User messages stay plain-text + whitespace-preserving.
  Stylesheet is `.markdown-body` in `app/globals.css`.
- **Deliverable 2 (plan.md §7):** code execution via `executor.py` (**Wandbox** API — Piston is
  whitelist-only) behind `POST /sessions/{id}/run`; AI token budget via Redis `INCRBY` in
  `ws.py`; copy-paste flags + `code_run` logged to `events`; interviewer replay reads
  `GET /sessions/{id}/events`; opt-in push-back questions (`pushback.py`) are interviewer-only
  (stripped from candidate sockets).

## Working agreement

- Respect the locked decisions in plan.md §3; if one seems wrong, flag it rather than silently
  diverging (two agents are working in parallel).
- When you finish a task, update plan.md §6 checkboxes and the §8 status table so the other
  teammate's agent sees current state.
- Keep changes scoped; prefer reusing the existing structure over inventing new patterns.
