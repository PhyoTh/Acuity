# CLAUDE.md

Guidance for Claude (and any coding agent) working in this repo: what Acuity is, how it's built,
the conventions to follow, and current feature status.

## What Acuity is

A live technical-interview platform: a candidate codes in a Monaco IDE with an embedded AI
assistant; an interviewer watches a hidden real-time telemetry + scorecard dashboard. The
signature feature is the **Hallucination Injector** — with an interviewer-set probability, the
AI's correct answer is subtly rewritten to contain plausible flaws, so the interview tests
whether candidates *critically evaluate* AI output instead of copying it.

> The repo directory on disk is `DevLens/`, but the product is **Acuity** everywhere in code,
> copy, and docs.

## Terminology

- **interviewer** (not "recruiter") — the role enum, UI copy, and code identifiers all use this.
- **session** (not "room") — an Acuity *session* is one interview run: its problem, AI config,
  transcripts, events, files, and scorecard. DB tables, URLs, and types all use `session`.

## Tech stack

- **Frontend:** Next.js (App Router, TypeScript), TailwindCSS, Monaco (`@monaco-editor/react`),
  Supabase JS, `react-resizable-panels`, `react-markdown` + `remark-gfm` (chat formatting) —
  managed with **pnpm**.
- **Backend:** FastAPI + native asyncio WebSockets, **SQLAlchemy 2.0 async** + **asyncpg** +
  **Alembic**, Redis, LangGraph/LangChain + **Anthropic Claude** (`langchain-anthropic`) —
  managed with **uv**.
- **Data + auth:** a single **Supabase** project provides both Postgres (app data) and Auth. Our
  tables are managed by our own Alembic migrations and live beside Supabase's `auth` schema.
- **Infra:** Redis + Postgres locally via Docker; prod on Supabase + Render.
- **Model:** all LLM calls go through Claude via `langchain-anthropic`; the model id is env-driven
  (`ANTHROPIC_MODEL`). AI is cost-optimized: cheap default model, capped `max_tokens`, capped
  chat history.

These choices are locked. If one seems wrong, raise it rather than silently diverging — two
developers (and their agents) work in parallel.

## Data model

All tables live in the Supabase Postgres, managed by our Alembic migrations (Supabase owns the
`auth` schema; we reference `auth.users.id` by UUID).

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | App-side user record mirroring an auth user + role | `id` (=auth uuid, PK), `role` (candidate/interviewer), `display_name` |
| `interview_sessions` | One interview session + its config | `id`, `join_code`, `interviewer_code` (nullable; co-host link), `created_by`→profiles, `language`, `prompt`, `starting_code`, `interview_type`, `guardrail_preset`, `guardrail_presets` (jsonb), `guardrail_custom`, `hallucination_pct`, `hallucination_type`, `test_cases` (jsonb), `token_budget`, `enable_pushback`, `status` (pending/active/ended), `created_at`, `ended_at` |
| `session_participants` | Who is in a session + as what | `session_id`, `profile_id`, `role`, `admitted`, `joined_at` |
| `session_files` | Multi-file project per session | `id`, `session_id`, `path`, `content`, `is_folder` |
| `events` | Append-only telemetry (code diffs, presence, flags) | `id`, `session_id`, `actor`, `type`, `payload` (jsonb), `created_at` |
| `transcripts` | Chat turns (candidate ↔ AI), incl. hallucination flag | `id`, `session_id`, `role` (user/assistant), `content`, `was_hallucinated` (bool), `tokens`, `created_at` |
| `scorecards` | Final LLM evaluation | `id`, `session_id` (unique), `scores` (jsonb: 4 dimensions), `summary`, `overall`, `created_at` |

**Scorecard dimensions:** prompt quality · caught AI errors · code correctness · approach &
independence.

### Migrations (apply all with `uv run alembic upgrade head`)

- `0001_initial` — initial six tables
- `0002_d2_config` — code-execution / quota / token-limit / push-back columns
- `0003_rename_room_to_session` — renames recruiter→interviewer + room→session in place
  (hand-written because it renames an enum value, which autogenerate can't infer)
- `0004_interview_type_token_budget` — adds `interview_type`, `token_budget`; drops `query_quota`,
  `ai_max_tokens`
- `0005_waiting_room` — adds `session_participants.admitted`
- `0006_multi_features` — adds `interview_sessions.guardrail_presets` (JSONB list), backfilled
  from the legacy singular `guardrail_preset` column for multi-select stacking
- `0007_session_files` — adds `session_files` (multi-file projects per session)
- `0008_hallucination_type` — adds `interview_sessions.hallucination_type` (which kind of flaw
  the injector introduces; defaults to `mixed`)
- `0009_interviewer_code` — adds `interview_sessions.interviewer_code` (nullable, unique;
  the optional co-interviewer invite link)

## Repo structure

```
DevLens/
├── CLAUDE.md / README.md        # this file / overview
├── ROADMAP.md / DESIGN.md       # UI design-system spec / design notes
├── docker-compose.yml           # local Postgres + Redis
├── .env.example                 # all env vars documented
├── frontend/                    # Next.js app (App Router)
│   ├── app/
│   │   ├── (auth)/login|signup           # auth pages
│   │   ├── dashboard/                    # interviewer home: searchable session list
│   │   │   ├── new/                      # create-session form (separate route)
│   │   │   ├── settings/                 # settings panel
│   │   │   └── [sessionId]/              # live interviewer mirror view + summary
│   │   ├── candidate/                    # candidate home: privacy-stripped session log
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
│   │   └── Dashboard/{Scorecard,SummaryView,ParticipantsPopover,ReplayTimeline,...}.tsx
│   ├── app/globals.css          # design tokens + markdown-body + remote-cursor styles
│   └── lib/                     # supabase.ts, ws.ts (SessionSocket), api.ts, types.ts,
│                                # mocks.ts (mock data for unwired UI surfaces)
└── backend/                     # FastAPI app
    └── app/
        ├── main.py              # app factory + /health
        ├── config.py            # pydantic-settings Settings
        ├── security.py          # Supabase JWT verification
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

## WebSocket protocol

Single endpoint per session; auth via Supabase JWT on connect. Redis channel: **`session:{id}`**.
URL: **`WS /ws/sessions/{session_id}?token=<jwt>`**.

| Event `type` | Direction | Payload (sketch) |
|---|---|---|
| `participants` | server → both | list of `{ profile_id, role, admitted, connected, display_name }` |
| `code_change` | candidate → server → interviewer | `{ code, language, cursor? }` (debounced; diffs logged to `events`) |
| `file_change` | candidate → server → interviewer | `{ path, content }` (sub-debounce multi-file mirroring) |
| `files_dirty` | server → other side | `{}` (structural CRUD happened; refetch file tree) |
| `chat_message` | candidate → server | `{ content, code }` |
| `ai_response` | server → both | `{ content, was_hallucinated }` (interviewer sees the flag; candidate does not) |
| `token_budget` | server → both | `{ used, budget, remaining }` |
| `paste` / `paste_flag` | candidate → server → interviewer | `{ length }` (cheat detection) |
| `code_run` | server → both | `{ passed, total }` (after `POST /sessions/{id}/run`) |
| `shell_command` / `shell_output` | candidate → server → both | `{ command }` / `{ output }` |
| `tab_switch` | candidate → server → interviewer | `{ hidden }` |
| `cursor_move` | candidate → server → interviewer | `{ line, column }` (throttled ~10/s) |
| `pushback` | server → interviewer | `{ questions: string[] }` (opt-in, stripped from candidates) |
| `interview_ended` | server → both | `{}` (immediate status flip) |
| `scorecard_ready` | server → interviewer | `{ scorecard_id }` (async, after the LLM finishes) |
| `kicked` | server → target | `{ profile_id }` |

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
- **Redis channels** are named `session:{id}`. The interviewer sees the `was_hallucinated` flag on
  AI responses; the candidate must not. Push-back questions are also stripped from candidate
  sockets in `_pump_redis_to_ws`.
- **Initial WS state must be sent directly to the new socket,** *not* via the Redis channel.
  `pubsub.subscribe()` is async — a `publish()` immediately after `asyncio.create_task(...)`
  for the listener can fire before the listener has subscribed, so the connecting socket
  misses its own snapshot. `ws.py` sends `participants` + `token_budget` + the latest
  `code_change` snapshot directly with `websocket.send_json(...)`; updates that need to fan
  out (e.g. someone joined) still `publish()` to the channel.
- **Presence is Redis-tracked, not DB-tracked.** `session_participants` rows persist forever
  once a candidate has been added; "is this person currently in the room?" lives in the
  Redis set `connected:{session_id}` (SADD on WS accept, SREM in the WS handler's
  `finally`). The `participants` payload carries `connected: bool` from this set so the
  interviewer's panel updates the moment a tab closes. **Do not** add a `left_at` column
  or similar — re-joining a session with the same DB row is intentional.
- **Candidate-side `code_change` echoes are ignored.** The backend broadcasts every
  `code_change` to all channel subscribers including the originator. The candidate's
  frontend handles only the FIRST `code_change` it receives (the rejoin snapshot the
  server sends on connect), via an `initialCodeAppliedRef`. Subsequent ones are dropped
  to avoid stomping the candidate's in-flight typing.
- **Multi-file state authority:** the DB (`session_files`) is canonical. Live content edits
  travel via the `file_change` WS event for sub-debounce mirroring; the structural CRUD
  endpoints (create / rename / delete) commit, then publish `files_dirty` so the *other* side
  refetches. The originating side doesn't refetch — it already has the canonical state from
  its own optimistic update.
- **Admit gate is server-authoritative.** The candidate UI also gates its IDE on
  `admitted === true` (not just `!== false`) so the brief window before the first
  `participants` event arrives stays on the waiting screen rather than rendering optimistically.
- **Invite role is bound to the link, not the account.** A session has a candidate `join_code`
  (admits candidate accounts only) and an optional `interviewer_code` (admits interviewer
  accounts only, minted on demand via `POST /sessions/{id}/cohost-link`, creator-only).
  `join_session` derives the role from which code matched and rejects a mismatched account with a
  403 — without this, a second interviewer could open the candidate link and bypass the waiting
  room. Any interviewer *participant* (creator or co-host) gets the full `SessionOut` view;
  candidates get the stripped `SessionCandidateView`.
- **Migrations:** schema changes go through Alembic (`autogenerate` from `db/models.py`), never
  hand-edited SQL. This keeps two devs' schema changes ordered and reviewable. The rename
  migration `0003_rename_room_to_session` is the one exception (hand-written because it renames
  an enum value, which autogenerate can't infer).
- **Style:** TypeScript `strict`; Python formatted/linted with **ruff** and type-checked with
  **mypy** (strict). Match surrounding code; keep modules small and single-purpose.
- **UI / design system (Acuity):** colors are OKLCH custom properties on `:root` in
  `app/globals.css` — use `var(--bg-1)`, `var(--live)`, etc. Tailwind utilities are still used
  for layout/spacing; do NOT reintroduce ad-hoc neutral-/zinc- palette colors. Three fonts are
  loaded via `next/font/google` in `app/layout.tsx`: **Instrument Serif** (display), **Geist**
  (body/UI), **JetBrains Mono** (code, IDs, ALL-CAPS section labels). Use the `components/ui/`
  primitives instead of hand-rolling pills, cards, etc. The full visual spec lives in
  [ROADMAP.md](ROADMAP.md).
- **Mock vs live data:** anything the design depicts that doesn't have a backend yet (per-user
  token usage, shared API balance, activity feed, scheduling, share-link, export PDF, etc.) is
  rendered from `lib/mocks.ts` with no live fetch. Treat that file as "to be wired up later"; do
  not pretend a card is live when it isn't. **Real data flows (auth, WS sync, code execution,
  scorecard) must remain untouched.**
- **Wordmark is not a link on authenticated interviewer pages** (sidebar, live-session header,
  summary header). It's a static brand mark — never wrap it in `<Link href="/">` inside
  `/dashboard/*`. If an interviewer wants to log out they use the user menu. (The candidate side
  intentionally also has a static wordmark.)

## Architecture notes

- **Real-time flow:** candidate IDE → WS → FastAPI gateway publishes to `session:{id}` (Redis) →
  all session subscribers (interviewer dashboard) receive identical state. Code changes are
  debounced client-side and the diffs are logged asynchronously to `events`.
- **AI chain:** `agent.py` (LangGraph + Claude, conditioned on current code + session guardrails)
  produces an answer → `hallucinator.py` rolls against `hallucination_pct` and, if it hits, does a
  second Claude pass to subtly corrupt it → the turn is stored in `transcripts` with
  `was_hallucinated` → streamed back as `ai_response`. The interviewer also picks a
  `hallucination_type` (`mixed` / `logic_error` / `wrong_api` / `edge_case` / `inefficiency` /
  `security`, in `hallucinator.HALLUCINATION_TYPES`) which selects the rewrite clause so the
  injected flaw matches what the interview tests. `agent.generate_reply` returns
  `(text, tokens_used)` so the WS handler can accumulate usage. The user-message template
  branches: a single buffer is wrapped as `My current <lang> code:\n```...```; a multi-file
  payload (detected by `--- path ---` headers) is wrapped as a labeled project tree so Claude
  knows it can answer questions across files.
- **Multi-select guardrails:** `build_guardrail_system` accepts either a single preset string
  (legacy) or a list. Stacked presets are appended as separate "Guardrail:" clauses so the
  strictest constraints naturally compose. The DB stores both `guardrail_preset` (singular,
  back-compat) and `guardrail_presets` (canonical list). Presets: hints only, no full solutions,
  explain don't write, syntax only, open — plus a per-session free-text `guardrail_custom`.
- **Interview types:** 8 types (algorithm / api / debugging / code_review / refactor / sql / tdd /
  system_design) with sensible AI defaults. Backend `INTERVIEW_TYPES` defaults table
  (`schemas.py`); frontend mirror (`lib/types.ts`) feeds the wizard's recommended values.
- **Test execution:** `executor.run_code(language, code|files, entry, stdin, call)` via the
  **Wandbox** API (Piston went whitelist-only). Two modes:
  - **stdin mode** (default): candidate code runs as-is; `stdin` is piped in; stdout is matched
    against `expected`.
  - **call mode** (when `TestCase.call` is set): a per-language harness is appended to the
    candidate's code that evaluates `call` (e.g. `Solution().twoSum([2,7,11,15], 9)`) and prints
    the result as JSON. Fixes the LeetCode failure mode where pasted class-method solutions
    never read stdin. Supported for Python and JS/TS; other languages fall back to stdin mode.
  - Output comparison is JSON-aware and line-trimmed (`outputs_match` in `executor.py`), so
    `[0, 1]` matches `[0,1]` regardless of formatting.
  - `executor.run_code` accepts `files` + `entry`. `executor.pick_entry_path` chooses
    `main.<ext>` for the language; Wandbox runs everything via its `codes[]` field.
- **Multi-file projects** (`session_files` table):
  - CRUD via `/sessions/{id}/files` (GET/POST/PATCH/DELETE). Folders are rows with
    `is_folder=True` and empty content. Renaming a folder cascades to descendants in the same
    transaction; deleting a folder removes its subtree.
  - Live content edits stream via WS `file_change` (path + content) for ≤500ms freshness between
    debounced PATCH saves.
  - Structural changes broadcast `files_dirty` on the channel; the interviewer's dashboard
    refetches `listFiles`. The candidate's UI doesn't refetch — they own the change.
- **Interactive shell** (`services/shell.py`): the candidate's terminal panel has a Shell tab
  that sends typed commands as `shell_command` WS events. Built-ins (`ls`, `cat`, `pwd`, `help`)
  read from the session's file dict; `run` / `python <file>` / `node <file>` / `go run <file>`
  hand off to `executor.run_code`. Result publishes as `shell_output` to both sides; commands are
  logged to `events` for the replay timeline.
- **Monitoring + telemetry events** (all logged to `events.payload` JSONB, all routed through
  `ws.py`):
  - `tab_switch` — `visibilitychange` listener on the candidate page; payload `{hidden}`.
    Interviewer header shows a live banner + running count; the replay timeline marks hidden
    periods.
  - `cursor_move` — Monaco `onDidChangeCursorPosition`, throttled to ~10/s. Interviewer's
    read-only Monaco renders an amber blinking caret decoration at the candidate's position.
  - `mouse_move` — global mouse heartbeat, throttled to ~once every 2s. Not broadcast live —
    purely used for idle detection in the replay scrubber.
  - `shell_command` — every typed shell command, payload `{command}`.
  - `file_change` — every keystroke broadcast (not logged in full; only the path is recorded to
    keep `events` small; content lives in `session_files`).
- **Replay timeline** (`components/Dashboard/ReplayTimeline.tsx`): renders the post-mortem events
  feed as a horizontal bar. Idle gaps (>15s with no activity events: `code_change`, `cursor_move`,
  `mouse_move`, `chat_message`, `code_run`, `paste_flag`) appear as amber bands with sticky
  `idle Xs` labels on hover. Tab-switch events (red), large pastes (amber tick), and code runs
  (green tick) appear as vertical markers.
- **Waiting room + presence:** candidate joins → `admitted=false` → sees a waiting screen. The
  interviewer's participants popover (👤 icon + count + waiting badge in the header) lists everyone
  with live Admit / Kick controls; the interviewer creator is always admitted. Kicked sockets see
  a `kicked` event with their own profile id, self-close, and show a "removed from the interview"
  page. The count reflects admitted *and* connected participants; disconnected rows are greyed out.
- **Scorecard:** on interview end, `scorecard.py` reads the session's full `transcripts` + `events`
  and asks Claude for structured JSON across the 4 dimensions, stored in `scorecards`. The
  two-phase end-interview flow (`interview_ended` immediately, then `scorecard_ready` once Claude
  finishes) means the interviewer's IDE flips to summary mode without waiting on the LLM. The End
  Interview button shows a confirmation modal to prevent accidental clicks.
- **AI exhaustion UX:** when the session's `token_budget` hits zero, the chat composer is replaced
  with an explicit "AI assistance has run out" panel (amber background, disabled input + Send
  button) instead of a passive notice — so the candidate can't type into a dead input. The budget
  counts Anthropic's exact `input_tokens + output_tokens` per call into `tokens:{session_id}:total`
  in Redis.
- **Markdown chat:** assistant messages render via `react-markdown` + `remark-gfm` (bold, italics,
  lists, code fences, tables). User messages stay plain-text + whitespace-preserving. Stylesheet
  is `.markdown-body` in `app/globals.css`.
- **Layout:** the candidate IDE and interviewer dashboard use `react-resizable-panels` — Problem
  (left, collapsible) | Editor + Terminal (center, vertical split) | AI chat (right, collapsible).
  Layouts persist via `autoSaveId`.
- **Candidate home** (`/candidate`): a privacy-stripped log — interview type label + date/time +
  status badge only. No problem, code, chat, or scorecard. Backed by `GET /sessions/mine`.
- **Demo mode** (`DEMO_MODE` / `NEXT_PUBLIC_DEMO_MODE`): a credential-free path for reviewers.
  Backend: the 4 LLM entry points (`agent`, `hallucinator`, `scorecard`, `pushback`)
  short-circuit to canned deterministic responses, and `POST /auth/demo-login` mints HS256 tokens
  signed with `demo_jwt_secret` that `security.py` accepts (real Supabase/JWKS auth is untouched,
  gated behind the flag). Frontend: `lib/auth.ts` abstracts the session — in demo mode the token
  lives in localStorage + a cookie (so `middleware.ts` can read the role) instead of a Supabase
  session; the login page shows one-click role buttons and invite links auto-join. The demo
  hallucinator mutates the agent's canned snippet (`total // count` → off-by-one) so the
  interviewer's `was_hallucinated` flag is meaningful. Never enable in production.
- **Display names:** `services/names.py` generates a random adjective+animal fallback (e.g.
  "sillyraccoon"). `DisplayNameModal` gates entry to both `/interview/[id]` and `/dashboard/[id]`,
  prefills the fallback, and saves via `PATCH /auth/me`; WS connect is gated on confirmation so the
  participant broadcast carries the final name.

## Feature status

The full interview loop is implemented and statically verified (ruff, mypy strict, backend import,
`pnpm build`), and exercised live against a real Supabase project + Anthropic key.

**Built and verified:**
- Auth + role routing (interviewer/candidate signup, middleware gating), session create/join by
  code, live WebSocket sync, presence + rejoin rehydrate.
- LangGraph + Claude agent, the hallucination injector, async telemetry, the LLM scorecard.
- Multi-step create-session wizard, CodeSignal-style resizable layout, waiting room (admit/kick),
  post-mortem summary view, multi-file project support, interactive shell.
- Tab-switch + cursor + idle monitoring, multi-select guardrails, function-call test mode,
  markdown chat rendering, replay timeline, AI token budget.
- Code execution against hidden tests (Wandbox, live-tested), copy-paste flags, interviewer-only
  push-back questions.
- **Demo/reviewer mode** (`DEMO_MODE`): runs the full flow with no Supabase or Anthropic
  credentials — canned LLM responses + credential-free `POST /auth/demo-login` tokens.
- **Role-bound invite links**: separate candidate / co-interviewer codes; a wrong-account joiner
  is rejected instead of bypassing the waiting room.
- **Interviewer-chosen hallucination type**: the injected flaw's *kind* is selectable per session
  (logic / wrong-API / edge-case / inefficiency / security / mixed).

**Not yet built (the UI promises these; backend pending):**
- **Custom guardrail presets** — a user/team-scoped `guardrail_library` (name + free-text policy)
  beyond the 5 built-ins. The wizard would read `[…built-ins, …custom]`. For now the per-session
  free-text `guardrail_custom` is the workaround.
- **Per-user Anthropic key (BYO)** — `profiles.anthropic_api_key` (encrypted) with env fallback,
  resolved per request in `services/llm.py`; hosted in the Settings panel.
- **Session scheduling** — a `scheduled_at` column + a job that flips `pending → active` at the
  scheduled time and notifies the candidate. Needed to make the dashboard calendar honest.

**Remaining:** deployment to Render + Supabase.

## Working agreement

- Respect the locked tech-stack decisions; if one seems wrong, flag it rather than silently
  diverging (two agents work in parallel).
- When you finish a task, update the **Feature status** section above so the other teammate's agent
  sees current state.
- Keep changes scoped; prefer reusing the existing structure over inventing new patterns.
