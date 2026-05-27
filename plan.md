# Acuity — Project Plan

> **Renamed 2026-05-26:** DevLens → **Acuity**. The repo directory is still
> `DevLens/`, but everywhere the product is referenced in code, copy, and docs it is now
> **Acuity**. See [ROADMAP.md](ROADMAP.md) for the design-system overhaul that accompanies
> the rename.

> **Audience:** the team (Sithu & Phyo) and our coding agents. This is the single source of truth
> for *what we're building, the decisions we've locked, and what's done vs. not*. Read this before
> picking up any task. For *how to run / conventions*, see [CLAUDE.md](CLAUDE.md).

## 1. Overview

Acuity is a **live technical-interview platform**. A candidate solves a coding problem in a
Monaco IDE with an embedded **AI assistant**; an interviewer silently watches a **real-time
telemetry + evaluation dashboard**. The defining feature is the **Hallucination Injector**: the
AI's correct output is, with an interviewer-set probability, subtly rewritten to contain
plausible logical/syntax flaws. This shifts the interview from "can you prompt an AI" to "can you
*critically evaluate* AI output instead of blindly copying it." When the interview ends, an LLM
generates a structured **scorecard** from the recorded transcript + telemetry.

## 2. Architecture

```
┌──────────────────────────── Next.js Frontend ────────────────────────────┐
│   Candidate IDE  (Monaco + AI chat)        Interviewer Dashboard (hidden)│
│        │  code_change / chat_message            ▲  live mirror + scorecard│
└────────┼───────────────────────────────────────┼─────────────────────────┘
         │ WebSocket                              │ WebSocket
         ▼                                        │
┌──────────────── FastAPI Real-Time Sync Gateway (Redis pub/sub) ──────────┐
│   session:{id} channels  ·  presence  ·  fan-out candidate → interviewer │
└───┬───────────────────────┬────────────────────────────┬─────────────────┘
    ▼                       ▼                             ▼
┌─────────────┐   ┌───────────────────┐        ┌────────────────────┐
│ Agentic     │   │ Telemetry Logger  │        │ Scorecard          │
│ Chat Engine │   │ (async → Postgres)│        │ Generator (LLM)    │
│ (LangGraph) │   └───────────────────┘        └────────────────────┘
│   + Claude  │
└──────┬──────┘
       ▼
┌──────────────────┐
│ Hallucination    │   (probabilistic LLM rewrite of the agent's answer)
│ Injector         │
└──────────────────┘
```

**Component responsibilities** (from the proposal):
- **Auth & Session Manager** (Supabase + Postgres) — login, role (candidate/interviewer), creates
  the `InterviewSession` with its config (language, starting code, guardrails, hallucination %).
- **Browser IDE** (Next.js + Monaco) — renders the editor + chat; emits `code_change` /
  `chat_message` WebSocket events.
- **Real-Time Sync Gateway** (FastAPI + Redis) — receives candidate events, broadcasts on
  `session:{id}` Redis channels so the interviewer sees identical state with minimal latency.
- **Agentic Chat Engine** (LangGraph + Claude) — answers candidate queries using the current code
  + the session's guardrails (e.g. "hints only, no full solutions").
- **Hallucination Injector** — with probability `p`, a second Claude call subtly corrupts the
  agent's answer so the candidate must read/debug it.
- **Telemetry Logger** — async, non-blocking writes of timestamps/code-diffs/transcripts/flags to
  Postgres (must never stall the WebSocket loop).
- **Scorecard Generator** — on interview end, reads the full transcript + event log and produces
  a structured JSON grade.

## 3. Locked decisions

These were explicitly chosen by the team. **Do not silently deviate** — if you think one is wrong,
raise it, don't just change it.

| Area | Decision |
|---|---|
| LLM provider | **Anthropic Claude** via LangChain/LangGraph (`langchain-anthropic`) |
| Python tooling | **uv** (`pyproject.toml`) |
| Node tooling | **pnpm** |
| Frontend | Next.js **App Router** + **TypeScript**, TailwindCSS, Monaco (`@monaco-editor/react`) |
| Backend | FastAPI + native asyncio WebSockets |
| App data location | **Supabase Postgres for BOTH auth + app data** (single DB; our tables live beside Supabase's `auth` schema) |
| DB access | **SQLAlchemy 2.0 async + Alembic** (asyncpg driver) |
| Cache / pub-sub | Redis |
| Session model | Interviewer creates a session (language, prompt, guardrails, hallucination %) → shareable code/link → candidate joins |
| Hallucinator | **LLM rewrite pass** — second Claude call mutates correct output, gated by configurable probability |
| Guardrails | **Presets** ("hints only" / "no full solutions" / "explain don't write") **+ free-text override** |
| Scorecard | Grades 4 dimensions: **prompt quality · caught AI errors · code correctness · approach & independence** |
| Code execution | Wandbox API behind `POST /sessions/{id}/run` (Deliverable 2) |
| Deployment | Render (services) + Supabase (DB+auth) |
| Work split | **No fixed owner split** — tasks below are tagged by area; either dev grabs the next one |
| Terminology | **interviewer** (not "recruiter"), **session** (not "room") — applied 2026-05-26 |

## 4. Data model

All in the Supabase Postgres, managed by *our* Alembic migrations (Supabase owns the `auth`
schema; we reference `auth.users.id` by UUID).

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | App-side user record mirroring an auth user + role | `id` (=auth user uuid, PK), `role` (candidate/interviewer), `display_name` |
| `interview_sessions` | One interview session + its config | `id`, `join_code`, `created_by`→profiles, `language`, `prompt`, `starting_code`, `guardrail_preset`, `guardrail_custom`, `hallucination_pct`, `test_cases` (jsonb), `query_quota`, `ai_max_tokens`, `enable_pushback`, `status` (pending/active/ended), `created_at`, `ended_at` |
| `session_participants` | Who is in a session + as what | `session_id`, `profile_id`, `role`, `joined_at` |
| `events` | Append-only telemetry (code diffs, presence, flags) | `id`, `session_id`, `actor`, `type`, `payload` (jsonb), `created_at` |
| `transcripts` | Chat turns (candidate ↔ AI), incl. hallucination flag | `id`, `session_id`, `role` (user/assistant), `content`, `was_hallucinated` (bool), `tokens`, `created_at` |
| `scorecards` | Final LLM evaluation | `id`, `session_id` (unique), `scores` (jsonb: 4 dimensions), `summary`, `overall`, `created_at` |

Migrations applied in order: `0001_initial` → `0002_d2_config` → `0003_rename_room_to_session`
(renames recruiter→interviewer + room→session in place; Postgres 10+ enum value rename).

## 5. WebSocket protocol

Single endpoint per session; auth via Supabase JWT on connect. Redis channel: **`session:{id}`**.
URL: **`WS /ws/sessions/{session_id}?token=<jwt>`**.

| Event `type` | Direction | Payload (sketch) |
|---|---|---|
| `presence` | server → both | `{ candidate: bool, interviewer: bool }` |
| `code_change` | candidate → server → interviewer | `{ code, language, cursor? }` (debounced; diffs logged to `events`) |
| `chat_message` | candidate → server | `{ content, code }` |
| `ai_response` | server → both | `{ content, was_hallucinated }` (interviewer sees the flag; candidate does not) |
| `quota` | server → both | `{ used, quota, remaining, blocked }` (AI query quota; D2) |
| `paste` | candidate → server | `{ length }` (cheat detection; D2) |
| `paste_flag` | server → interviewer | `{ length }` |
| `code_run` | server → both | `{ passed, total }` (D2; after `POST /sessions/{id}/run`) |
| `pushback` | server → interviewer | `{ questions: string[] }` (D2; opt-in) |
| `interview_end` | interviewer → server | `{}` → triggers Scorecard Generator |
| `scorecard_ready` | server → interviewer | `{ scorecard_id }` |

## 6. Deliverable 1 — task breakdown

Goal: a candidate + interviewer in a shared live session; candidate uses the AI; interviewer sees
live state; on end, the dashboard shows an LLM scorecard. Tasks tagged `[area]`, no fixed owner.

**Foundations**
- [x] `[infra]` First Alembic migration creating the 6 tables (§4) — `migrations/versions/0001_initial.py`
- [x] `[backend]` `config.py` Settings + DB/Redis connection lifecycle wired into `main.py`
- [x] `[backend]` Supabase JWT verification dependency (verify + load `profiles` row) — `app/security.py`
- [x] `[frontend]` Supabase clients + role-based routing via `middleware.ts` (interviewer→/dashboard)

**Auth & sessions**
- [x] `[backend]` `routers/auth.py` — `GET /auth/me` profile bootstrap (role from JWT metadata)
- [x] `[backend]` `routers/interview.py` — create session + `join_code`, join-by-code, fetch config, scorecard
- [x] `[frontend]` Login + interviewer signup; `CreateSessionForm`; candidate `/join/[code]` invite flow

**Live IDE + sync**
- [x] `[frontend]` Monaco wrapper (`components/Editor`) debounced `code_change`; `components/Chat` chat box
- [x] `[backend]` `routers/ws.py` — session WebSocket, Redis pub/sub fan-out, presence, per-socket flag redaction
- [x] `[frontend]` Interviewer dashboard mirroring live code + chat (read-only) — `/dashboard/[sessionId]`

**AI**
- [x] `[backend]` `services/agent.py` — LangGraph + Claude chat using code state + guardrails (`services/llm.py`)
- [x] `[backend]` `services/hallucinator.py` — probabilistic Claude rewrite of agent output
- [x] `[backend]` `services/telemetry.py` — non-blocking async writes to `events`/`transcripts`

**Wrap-up**
- [x] `[backend]` `services/scorecard.py` — on `interview_end`, Claude structured 4-dimension scorecard
- [x] `[frontend]` Dashboard scorecard panel (`components/Dashboard/Scorecard.tsx`)

**Ship**
- [ ] `[infra]` Deploy: Supabase project, Render services, live URL — see `SETUP.md`

> **Done = code-complete + statically verified** (ruff, mypy strict, backend import, `pnpm build`).
> A live end-to-end run still requires real Supabase + Anthropic credentials — follow `SETUP.md`.

## 7. Deliverable 2 — stretch goals (implemented)

All six implemented and statically verified (ruff, mypy strict, `pnpm build`). Code execution was
live-tested against Wandbox.
- [x] Code execution sandbox against hidden test cases — `services/executor.py` (**Wandbox**; the
  public Piston API went whitelist-only 2026-02-15), `POST /sessions/{id}/run`, candidate **Run**
  button + per-test results (hidden tests redacted for the candidate)
- [x] Keystroke / AI-interaction **replay timeline** — `GET /sessions/{id}/events` + interviewer scrubber
- [x] Background LLM **push-back questions** (interviewer-only, opt-in `enable_pushback`) —
  `services/pushback.py`, `pushback` WS event stripped from candidates
- [x] Pre-interview **config UI** — 4-step wizard (basics → type → problem → AI behavior); see §7a
- [x] **AI token budget** per session (Redis `INCRBY` against Anthropic's `usage_metadata`) — replaces
  the old query quota / per-reply `max_tokens` split; remaining tokens shown live to both sides
- [x] **Cheat detection** — Monaco paste listener → `paste` WS event → `paste_flag` logged + interviewer warning

## 7a. Phase 2 — interview-type wizard + token budget (implemented 2026-05-26)

- [x] `interview_type` column on `interview_sessions` (algorithm / api / debugging / code_review /
  refactor / sql / tdd / system_design). Migration `0004_interview_type_token_budget`.
- [x] Backend `INTERVIEW_TYPES` defaults table (`schemas.py`); frontend `INTERVIEW_TYPES` mirror
  (`lib/types.ts`) feeds the wizard's recommended values.
- [x] New `syntax_only` guardrail preset (restricts AI to language syntax/stdlib).
- [x] Token-budget mechanic: `token_budget` column replaces `query_quota` + `ai_max_tokens`; counts
  Anthropic's exact `input_tokens + output_tokens` per call into `tokens:{session_id}:total` in
  Redis; `token_budget` WS event broadcasts state.
- [x] `agent.generate_reply` returns `(text, tokens_used)` so the WS handler can accumulate usage.
- [x] Multi-step wizard component (`components/CreateSessionForm.tsx`): Basics → Type → Problem →
  AI behavior. Picking a type pre-fills the AI-behavior step.

## 7b. Phase 3 — CodeSignal layout + waiting room (implemented 2026-05-26)

- [x] `react-resizable-panels` (v2) wired into the candidate IDE and interviewer dashboard.
  Outer horizontal split: Problem (left, collapsible) | Editor + Terminal (center, vertical
  split) | AI chat (right, collapsible). Layouts persist via `autoSaveId`.
- [x] **Terminal panel** at the bottom of the editor on the candidate side; the interviewer view
  shows the candidate's last-run summary in the same place.
- [x] **Waiting room** — `session_participants.admitted` (migration `0005_waiting_room`). Candidate
  joins → `admitted=false` → sees a waiting screen. Interviewer's participant panel lists everyone
  with an Admit button. Interviewer creator is always admitted.
- [x] **Kick** — interviewer can remove any participant (except themselves); the targeted socket
  sees a `kicked` event with its own profile id, self-closes, and the candidate is shown a
  "removed from the interview" page.
- [x] **Participants** panel on the interviewer dashboard (left column, below Problem) with live
  Admit / Kick buttons and waiting-count badge in the header.

> Schema migrations applied in order: `0001_initial` → `0002_d2_config` → `0003_rename_room_to_session`
> → `0004_interview_type_token_budget` → `0005_waiting_room`. **Run `alembic upgrade head`** to apply.

## 7c. Phase 4 — role-aware signup + post-mortem + display names (implemented 2026-05-26)

- [x] `[backend]` Split end-interview into two events: immediate `interview_ended` broadcast
  (status flip + ended_at) followed by an async `_generate_scorecard_async` background task that
  emits `scorecard_ready` when the LLM is done. Interviewer no longer waits on the LLM call.
  See [routers/ws.py](backend/app/routers/ws.py).
- [x] `[backend]` New endpoints: `GET /sessions/mine` (privacy-stripped candidate log),
  `PATCH /auth/me` (display name update), `GET /sessions/{id}/transcripts` (interviewer-only,
  carries `was_hallucinated`). Candidate log schema deliberately omits problem, code, title,
  language, join code, interviewer identity, scorecard.
- [x] `[backend]` `services/names.py` — random adjective+animal display name generator. New
  profiles default to e.g. "sillyraccoon" instead of the email. Users override via the modal.
- [x] `[frontend]` `/signup` now has a role picker (interviewer vs candidate) and honors
  `?role=` + `?next=` query params from invite-link redirects. `/login` branches by role:
  interviewer → `/dashboard`, candidate → `/candidate`. Middleware gates `/candidate` to
  candidates and `/dashboard` to interviewers; the other lands back on their own dashboard.
- [x] `[frontend]` `/candidate` — bare log: interview type label + date/time + status badge.
  No problem, code, chat, or scorecard exposed.
- [x] `[frontend]` `DisplayNameModal` — gates entry to both `/interview/[id]` (candidate) and
  `/dashboard/[id]` (interviewer). Prefills the random fallback name; saving calls `PATCH
  /auth/me` and marks the session "confirmed" in localStorage so refresh doesn't re-prompt.
  WS connect is gated on confirmation so the participant broadcast carries the final name.
- [x] `[frontend]` Participants popover — interviewer's sidebar participants panel was
  removed. A 👤 icon + count + waiting badge sits in the header (left of "End interview");
  clicking opens a dropdown with the same admit/kick controls.
  See [components/Dashboard/ParticipantsPopover.tsx](frontend/components/Dashboard/ParticipantsPopover.tsx).
- [x] `[frontend]` End-interview UX — candidate WS handler switches to an "Interview ended"
  screen with a "Go to dashboard" button (routes to `/candidate`). Interviewer page flips to
  summary mode in place: header reads "Session summary", end-interview + participants
  controls hidden, chat panel shows persisted transcripts (via the new endpoint), terminal
  shows last run, scorecard panel shows a loading state until `scorecard_ready` arrives.
  Clicking a past session from `/dashboard` enters the same summary view directly.

> No DB migration in Phase 4 — all changes use existing columns/tables. Deferred to **Phase 4b**:
> live cursor sync (CodeSignal-style cursor labels + selection mirroring in the editor).

## 8. Status

**Current: Deliverable 1 implemented AND verified live.** The full loop was exercised against a real
Supabase project + Anthropic key: ES256 login (JWKS verify) → interviewer creates session →
candidate joins → live WS code/chat sync → Claude reply → hallucination flag (interviewer-only)
→ interview end → LLM scorecard. The only remaining D1 item is deployment. AI is cost-optimized:
Haiku model, capped `max_tokens`, capped chat history. Run locally via `SETUP.md`.

**Phase 4 (2026-05-26):** role-aware signup (interviewer/candidate picker), candidate dashboard
as a privacy-stripped log (date/time/type only), random display name fallback ("sillyraccoon")
+ a per-session display-name modal that gates entry on both sides, participants moved from a
sidebar panel to a header popover (👤 icon + count + waiting badge), and the end-interview
flow split into immediate `interview_ended` (both sides leave the IDE instantly) + async
`scorecard_ready` (LLM generates in the background, summary view shows loading state). Past
sessions on `/dashboard` open the same summary view. No DB migration — all changes use
existing columns. Deferred to Phase 4b: live cursor sync (CodeSignal-style).

**Phase 1–3 redesign (2026-05-26):** all three phases shipped in a single sitting. Phase 1 renamed
recruiter→interviewer + room→session everywhere (migration 0003) and turned `/dashboard` into a
searchable session list. Phase 2 added the multi-step wizard, 8 interview types with sensible AI
defaults, the new `syntax_only` guardrail preset, and reworked the AI throttle from
"messages + per-reply tokens" to a single session-wide `token_budget` counting Anthropic's exact
input + output tokens (migration 0004). Phase 3 rebuilt the IDE around `react-resizable-panels`
(Problem | Editor+Terminal | Chat), added a VSCode-style terminal panel, and introduced the
waiting-room flow with interviewer admit/kick (migration 0005).

| Milestone | Status |
|---|---|
| Repo scaffold + boilerplate | ✅ Done |
| `plan.md` / `CLAUDE.md` / `SETUP.md` docs | ✅ Done |
| Deliverable 1 features (auth, sessions, live sync, AI, hallucinator, scorecard) | ✅ Done |
| Deliverable 1 — live E2E (auth→session→AI→scorecard) | ✅ Verified vs real Supabase + Anthropic |
| Deliverable 2 features (§7: exec, replay, push-back, config UI, quota, cheat flag) | ✅ Code-complete (static-verified; exec live-tested) |
| Phase 1 redesign (renames + dashboard restructure) | ✅ Code-complete |
| Phase 2 (wizard + interview types + token budget) | ✅ Code-complete (statically verified) |
| Phase 3 (CodeSignal layout + waiting room + terminal + kick) | ✅ Code-complete (statically verified) |
| Phase 4 (role-aware signup + candidate dashboard + post-mortem + display names) | ✅ Code-complete (statically verified) |
| Live E2E of the redesign | ⬜ Pending: apply migrations 0003–0005 + run with Docker up |
| Deployment (Supabase + Render) | ⬜ Not started |

> **Auth note:** Supabase signs user tokens with **ES256** (asymmetric signing keys); the backend
> verifies via the Supabase **JWKS** endpoint (and accepts HS256 dev tokens). See `app/security.py`.
> **Tuning follow-up:** with `hints_only`, Haiku still tended to give full solutions — strengthen the
> guardrail prompt (and/or use Sonnet) if strict hint-only behavior matters.
> **Verified locally (post-rename):** `ruff`, `mypy` (strict), `pnpm build`.

## 9. Acuity UI overhaul (2026-05-26)

The product was renamed **DevLens → Acuity** and the frontend is being rebuilt against
[ROADMAP.md](ROADMAP.md) — a detailed visual / interaction spec (design tokens in OKLCH,
custom typography, an "Aperture" wordmark, per-screen specs for landing, auth, dashboard,
wizard, live session, candidate IDE, summary, and candidate home). The product behavior — auth
flow, WS protocol, hallucination injector, scorecard pipeline, etc. — is **unchanged**; the
overhaul is strictly visual + a new public landing page.

### 9a. Surfaces rebuilt (one commit per screen)

- [ ] **Foundations** — design tokens in `app/globals.css`, Google fonts loaded via
  `next/font`, base atmosphere (radial bloom + grid).
- [ ] **`components/ui/` primitives** — Aperture, Wordmark, Pill, Sparkline, SectionLabel,
  Card, Stat, Avatar, Icon, CodeBlock, HeatStrip, Progress.
- [ ] **Landing page** at `/` — hero + interactive hallucination demo, How it works (3 steps
  with previews), Features bento, Contact form, Footer.
- [ ] **Auth** — `/login`, `/signup` share an `AuthLayout` (form column + promo column with
  large Aperture decoration).
- [ ] **Interviewer dashboard** at `/dashboard` — sidebar nav, 4-stat row, live-session
  callout, sessions table, quick-start + recent-activity side column.
- [ ] **Create session wizard** at `/dashboard/new` — 4-step layout with success card.
- [ ] **Live session (interviewer)** at `/dashboard/[sessionId]` — 3-panel layout: telemetry
  sidebar, code mirror + terminal, AI chat with reveal/mask toggle.
- [ ] **Candidate IDE** at `/interview/[sessionId]` (and `/join/[code]`) — same 3-panel
  layout but stripped of interviewer-only telemetry and hallucination flags.
- [ ] **Session summary** — radar profile + dimension bars + AI summary + replay timeline +
  final-solution / key-turns column.
- [ ] **Candidate home** at `/candidate` — wordmark header, join-code form, history list.

### 9b. Features in ROADMAP that are visual / mock-only (no backend yet)

The roadmap mocks describe data and controls we don't have backend support for. These are
rendered as **mock UI per the roadmap** but not wired to live data. Document/implement later:

| Item | Where it appears | Status |
|---|---|---|
| "Your tokens" tile (per-user Anthropic spend) | `/dashboard` header row | Mock — backend doesn't aggregate usage per `created_by` yet; would need a SUM over `transcripts.tokens` joined to sessions for the current user |
| "API balance" tile (shared team Anthropic balance) | `/dashboard` header row | Mock — Anthropic does not expose a real-time balance API, and we don't yet track Team accounting. Would require a manually-set monthly budget + cumulative spend cron |
| Schedule calendar with scheduled-day click popovers | `/dashboard` header row | Real `pending` sessions are bucketed by `created_at` (no `scheduled_at` column yet). Popover lists sessions for that day. True scheduling = new column + UI in the wizard. |
| Sparkline series on each stat | dashboard usage tiles | Mock |
| "Recent activity" feed | `/dashboard` right column | Mock |
| Quick-start preset buttons | `/dashboard` right column | Mock — buttons route to `/dashboard/new` but don't preload the type |
| Scheduled sessions (proper `scheduled_at` + cron-released invite) | wizard, sessions table, landing Features card | No DB column yet; `pending` status is set by the backend but never carries a planned start time |
| Calendar / "Schedule ahead" feature card | landing Features bento | Pure decoration |
| Cost footprint card ("$0.32 / session") | landing Features bento, landing hero footer copy | Pure decoration |
| Mission-control mini-dashboard card | landing Features bento | Pure decoration |
| Score callout card | landing Features bento | Pure decoration |
| Integrity timeline card | landing Features bento | Pure decoration (the actual replay timeline on the summary page IS wired) |
| Share-link decoration (acuity.app/join/...) | landing Features bento | Pure decoration |
| "Stack guardrails / write your own" feature card | landing Features bento | Stacking is real; **custom user-defined guardrail presets are not yet implemented** — see §9c |
| Anthropic key shown in the sidebar | `/dashboard` sidebar footer | Was a static card; moving to a Settings panel (see §9c). Real keys are still env-driven; no per-user BYO yet |
| "Export PDF" button on the summary | summary top-right | Not wired |
| "Share read-only link" button on the summary | summary top-right | Not wired |
| Radar chart on the summary | summary Profile card | Rendered from the existing `scorecard.scores` 4-dim numbers, no new backend |
| AI summary tag row ("Independent debugger" / "Caught 3/4" / "Clean prompt habits") | summary | Derived heuristically from existing scorecard, but the chips themselves are not yet stored — render from current scorecard contents only |
| Sparkline-rich live-session telemetry (code-change/AI-exchange/paste HeatStrips) | `/dashboard/[id]` left column | The underlying events are real (already logged); the HeatStrip aggregations may be mock if no live data is present |
| Hero "demo card" hallucination injector slider | landing hero | Client-only mock — uses canned segments, no backend call |
| Contact form submission | landing `#contact` | Client-only — shows success state, no email is actually sent |
| "Acuity is free — bring your own Anthropic key" messaging | landing hero, Features bento | Aspirational — actual product is single shared key today |

### 9c. Backlog (features promised by the UI, awaiting backend)

The redesign promises three features that we explicitly want but haven't built yet.
Tracking here so the next pass doesn't lose them:

- **Custom guardrail presets** — `INTERVIEW_TYPES` is a fixed list and `GUARDRAIL_PRESETS`
  is a 5-element enum. Plan: add a `guardrail_library` table (user-scoped or team-scoped)
  storing name + free-text policy; the wizard reads from `[…built-ins, …custom]`. The
  landing's "Stack guardrails. Or write your own." feature card and the Settings panel
  (§9d) both assume this exists. For now `guardrail_custom` (the per-session free-text
  field) is the workaround.
- **Per-user Anthropic key (BYO)** — landing hero copy and Features bento promise it.
  Backend: add `profiles.anthropic_api_key` (encrypted) + fallback to env if unset, and
  have `services/llm.py` resolve the right key per request. Settings panel (§9d) hosts
  the input.
- **Session scheduling (`scheduled_at`)** — required to make the dashboard calendar
  honest. Adds a column + a job that flips `pending → active` at the scheduled time and
  emails the candidate.

### 9d. Settings panel (planned)

`/dashboard` will get a new "Settings" nav item replacing the current Anthropic-key card
in the sidebar footer. The panel hosts the per-user API key (with a reveal toggle),
display name, and other team / notification preferences. Exact contents are being
finalized with the team — keep this section updated once the question is answered.
