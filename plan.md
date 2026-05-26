# DevLens — Project Plan

> **Audience:** the team (Sithu & Phyo) and our coding agents. This is the single source of truth
> for *what we're building, the decisions we've locked, and what's done vs. not*. Read this before
> picking up any task. For *how to run / conventions*, see [CLAUDE.md](CLAUDE.md).

## 1. Overview

DevLens is a **live technical-interview platform**. A candidate solves a coding problem in a
Monaco IDE with an embedded **AI assistant**; a recruiter silently watches a **real-time telemetry
+ evaluation dashboard**. The defining feature is the **Hallucination Injector**: the AI's correct
output is, with a recruiter-set probability, subtly rewritten to contain plausible logical/syntax
flaws. This shifts the interview from "can you prompt an AI" to "can you *critically evaluate*
AI output instead of blindly copying it." When the interview ends, an LLM generates a structured
**scorecard** from the recorded transcript + telemetry.

## 2. Architecture

```
┌──────────────────────────── Next.js Frontend ────────────────────────────┐
│   Candidate IDE  (Monaco + AI chat)        Recruiter Dashboard (hidden)    │
│        │  code_change / chat_message            ▲  live mirror + scorecard │
└────────┼───────────────────────────────────────┼─────────────────────────┘
         │ WebSocket                              │ WebSocket
         ▼                                        │
┌──────────────── FastAPI Real-Time Sync Gateway (Redis pub/sub) ───────────┐
│   room:{id} channels  ·  presence  ·  fan-out candidate → recruiter        │
└───┬───────────────────────┬────────────────────────────┬─────────────────-┘
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
- **Auth & Session Manager** (Supabase + Postgres) — login, role (candidate/recruiter), creates
  the `InterviewRoom` with its config (language, starting code, guardrails, hallucination %).
- **Browser IDE** (Next.js + Monaco) — renders the editor + chat; emits `code_change` /
  `chat_message` WebSocket events.
- **Real-Time Sync Gateway** (FastAPI + Redis) — receives candidate events, broadcasts on
  `room:{id}` Redis channels so the recruiter sees identical state with minimal latency.
- **Agentic Chat Engine** (LangGraph + Claude) — answers candidate queries using the current code
  + the room's guardrails (e.g. "hints only, no full solutions").
- **Hallucination Injector** — with probability `p`, a second Claude call subtly corrupts the
  agent's answer so the candidate must read/debug it.
- **Telemetry Logger** — async, non-blocking writes of timestamps/code-diffs/transcripts/flags to
  Postgres (must never stall the WebSocket loop).
- **Scorecard Generator** — on interview end, reads the full transcript + event log and produces a
  structured JSON grade.

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
| Room model | Recruiter creates a room (language, prompt, guardrails, hallucination %) → shareable code/link → candidate joins |
| Hallucinator | **LLM rewrite pass** — second Claude call mutates correct output, gated by configurable probability |
| Guardrails | **Presets** ("hints only" / "no full solutions" / "explain don't write") **+ free-text override** |
| Scorecard | Grades 4 dimensions: **prompt quality · caught AI errors · code correctness · approach & independence** |
| Code execution | **NOT in Deliverable 1** (stretch goal). The editor drives telemetry + AI context only. |
| Deployment | Render (services) + Supabase (DB+auth) |
| Work split | **No fixed owner split** — tasks below are tagged by area; either dev grabs the next one |

## 4. Data model (planned)

All in the Supabase Postgres, managed by *our* Alembic migrations (Supabase owns the `auth`
schema; we reference `auth.users.id` by UUID).

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | App-side user record mirroring an auth user + role | `id` (=auth user uuid, PK), `role` (candidate/recruiter), `display_name` |
| `interview_rooms` | One interview session + its config | `id`, `join_code`, `created_by`→profiles, `language`, `prompt`, `starting_code`, `guardrail_preset`, `guardrail_custom`, `hallucination_pct`, `status` (pending/active/ended), `created_at`, `ended_at` |
| `room_participants` | Who is in a room + as what | `room_id`, `profile_id`, `role`, `joined_at` |
| `events` | Append-only telemetry (code diffs, presence, flags) | `id`, `room_id`, `actor`, `type`, `payload` (jsonb), `created_at` |
| `transcripts` | Chat turns (candidate ↔ AI), incl. hallucination flag | `id`, `room_id`, `role` (user/assistant), `content`, `was_hallucinated` (bool), `tokens`, `created_at` |
| `scorecards` | Final LLM evaluation | `id`, `room_id` (unique), `scores` (jsonb: 4 dimensions), `summary`, `created_at` |

## 5. WebSocket protocol (planned)

Single endpoint per room; auth via Supabase JWT on connect. Redis channel: **`room:{id}`**.

| Event `type` | Direction | Payload (sketch) |
|---|---|---|
| `presence` | server → both | `{ candidate: bool, recruiter: bool }` |
| `code_change` | candidate → server → recruiter | `{ code, language, cursor? }` (debounced; diffs logged to `events`) |
| `chat_message` | candidate → server | `{ content }` |
| `ai_response` | server → both | `{ content, was_hallucinated }` (recruiter sees the flag; candidate does not) |
| `interview_end` | recruiter → server | `{}` → triggers Scorecard Generator |
| `scorecard_ready` | server → recruiter | `{ scorecard_id }` |

## 6. Deliverable 1 — task breakdown

Goal: a candidate + recruiter in a shared live room; candidate uses the AI; recruiter sees live
state; on end, the dashboard shows an LLM scorecard. Tasks tagged `[area]`, no fixed owner.

**Foundations**
- [x] `[infra]` First Alembic migration creating the 6 tables (§4) — `migrations/versions/0001_initial.py`
- [x] `[backend]` `config.py` Settings + DB/Redis connection lifecycle wired into `main.py`
- [x] `[backend]` Supabase JWT verification dependency (verify + load `profiles` row) — `app/security.py`
- [x] `[frontend]` Supabase clients + role-based routing via `middleware.ts` (recruiter→/dashboard)

**Auth & rooms**
- [x] `[backend]` `routers/auth.py` — `GET /auth/me` profile bootstrap (role from JWT metadata)
- [x] `[backend]` `routers/interview.py` — create room + `join_code`, join-by-code, fetch config, scorecard
- [x] `[frontend]` Login + recruiter signup; `CreateRoomForm`; candidate `/join/[code]` invite flow

**Live IDE + sync**
- [x] `[frontend]` Monaco wrapper (`components/Editor`) debounced `code_change`; `components/Chat` chat box
- [x] `[backend]` `routers/ws.py` — room WebSocket, Redis pub/sub fan-out, presence, per-socket flag redaction
- [x] `[frontend]` Recruiter dashboard mirroring live code + chat (read-only)

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
live-tested against Wandbox; the rest await a live run once Docker is back (see §8).
- [x] Code execution sandbox against hidden test cases — `services/executor.py` (**Wandbox**; the
  public Piston API went whitelist-only 2026-02-15), `POST /rooms/{id}/run`, candidate **Run** button
  + per-test results (hidden tests redacted for the candidate)
- [x] Keystroke / AI-interaction **replay timeline** — `GET /rooms/{id}/events` + recruiter scrubber
- [x] Background LLM **push-back questions** (recruiter-only, opt-in `enable_pushback`) —
  `services/pushback.py`, `pushback` WS event stripped from candidates
- [x] Pre-interview **config UI** — hallucination %, AI token limit, query quota, test cases,
  guardrail preset + free-text (`CreateRoomForm`)
- [x] **AI query quota** per candidate (Redis `INCR`) — enforced in `ws.py`, remaining shown to candidate
- [x] **Cheat detection** — Monaco paste listener → `paste` WS event → `paste_flag` logged + recruiter warning

> Schema change: `migrations/versions/0002_d2_config.py` adds `test_cases`, `query_quota`,
> `ai_max_tokens`, `enable_pushback` to `interview_rooms`. **Run `alembic upgrade head`** to apply.

## 8. Status

**Current: Deliverable 1 implemented AND verified live.** The full loop was exercised against a real
Supabase project + Anthropic key: ES256 login (JWKS verify) → recruiter creates room → candidate
joins → live WS code/chat sync → Claude reply → hallucination flag (recruiter-only) → interview end
→ LLM scorecard. The only remaining D1 item is deployment. AI is cost-optimized: Haiku model, capped
`max_tokens`, capped chat history. Run locally via `SETUP.md`.

| Milestone | Status |
|---|---|
| Repo scaffold + boilerplate | ✅ Done |
| `plan.md` / `CLAUDE.md` / `SETUP.md` docs | ✅ Done |
| Deliverable 1 features (auth, rooms, live sync, AI, hallucinator, scorecard) | ✅ Done |
| Deliverable 1 — live E2E (auth→room→AI→scorecard) | ✅ Verified vs real Supabase + Anthropic |
| Deliverable 2 features (§7: exec, replay, push-back, config UI, quota, cheat flag) | ✅ Code-complete (static-verified; exec live-tested) |
| Deliverable 2 — live E2E | ⬜ Pending: apply `0002` migration + run with Docker up |
| Deployment (Supabase + Render) | ⬜ Not started |

> **Auth note:** Supabase signs user tokens with **ES256** (asymmetric signing keys); the backend
> verifies via the Supabase **JWKS** endpoint (and accepts HS256 dev tokens). See `app/security.py`.
> **Tuning follow-up:** with `hints_only`, Haiku still tended to give full solutions — strengthen the
> guardrail prompt (and/or use Sonnet) if strict hint-only behavior matters.
> **Verified locally:** `ruff`, `mypy` (strict), backend import, `pnpm build`, and a live E2E run.
