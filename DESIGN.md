# DESIGN.md

Six design decisions that shaped Acuity, pulled from the build sessions. For architecture,
conventions, and feature status see [CLAUDE.md](CLAUDE.md).

---

## 1. One Supabase Postgres for both auth + app data, talked to with async SQLAlchemy — not supabase-py

**Decision.** We keep everything in a single Supabase project (Auth + Postgres) and our own tables
(`interview_sessions`, `events`, `transcripts`, `scorecards`, …) live right next to Supabase's
`auth` schema. FastAPI reaches that DB through **SQLAlchemy 2.0 async + asyncpg + Alembic**, and the
backend verifies the Supabase JWT itself instead of trusting the client. One database, one migration
target, one connection string.

When I was first scoping this, Claude laid out the tradeoff tables (Supabase-for-both vs. a separate
Render Postgres, and SQLAlchemy vs. raw asyncpg vs. the Supabase Python client) and I made the call.
The big thing it flagged that I would've walked straight into: **supabase-py is synchronous, so using
it inside our WebSocket gateway would block the event loop** and kill the real-time sync. That single
fact is why we went async-SQLAlchemy and never looked back. The downside is the SQLAlchemy 2.0 async
learning curve and Alembic ceremony for every schema change, but for a two-person project where both
agents touch the schema, ordered migration files are worth it.

---

## 2. The Hallucination Injector is a second, probability-gated Claude pass

**Decision.** This is the whole point of the product, so it's not a side feature — it's its own stage
in the AI chain. `agent.py` produces a correct answer, then `hallucinator.py` rolls against the
session's `hallucination_pct` and, if it hits, makes a **second Claude call** that subtly rewrites the
answer to contain plausible flaws. The turn is stored with a `was_hallucinated` flag, and that flag is
**stripped per-socket** so the interviewer sees it but the candidate never does. The interview stops
being "can you prompt an AI" and becomes "can you catch it when the AI is confidently wrong."

This idea is ours (mine + Sithu's, from the original proposal). The tradeoff is cost and latency — a
corrupted turn is two LLM calls, not one — and the corruption has to be *subtle* or the whole exercise
is pointless, which is why it's a dedicated rewrite prompt and not a cheap string mangle. We lean on
the cheap Haiku model + capped `max_tokens` + capped chat history to keep a full mock interview down to
a few cents.

---

## 3. Async end-to-end, and telemetry never blocks the WebSocket loop

**Decision.** The backend is async everywhere — async SQLAlchemy session, `redis.asyncio`, async
LangChain calls — and the inbound WS socket loop is sacred. Anything that could stall it (telemetry
writes, the scorecard LLM call, shell execution, push-back generation) gets fired as a background task
via `telemetry.fire(coro)` so the socket keeps draining messages. The candidate IDE pushes
`code_change` / `chat_message` over WS, FastAPI fans it out on a Redis `session:{id}` channel, and the
interviewer dashboard renders the identical state with minimal latency.

I treated this as a hard rule rather than a nice-to-have because the proposal explicitly wanted
"non-blocking async telemetry," and the moment one synchronous DB write sneaks onto the hot path, the
live mirror starts lagging for everyone in the session. The cost is that you have to be disciplined —
no `time.sleep`, no sync drivers, no synchronous supabase-py in a request/WS path — and you give up the
simplicity of just `await`-ing everything inline. Worth it for a real-time product.

---

## 4. One token budget, not a query-quota + max-tokens split

**Decision.** Each session has a single session-wide **`token_budget`** that counts Anthropic's exact
`input_tokens + output_tokens` across every AI call (tracked in Redis with `INCRBY`, broadcast live to
both sides). When it hits zero, the candidate's chat composer is replaced with an explicit "AI
assistance has run out" panel instead of a dead input.

This replaced an earlier two-knob design (an "AI query quota" plus a per-reply "AI max tokens"). I made
this change because when I was testing it myself I genuinely couldn't tell what the difference between
the two fields was supposed to be — and if I couldn't, an interviewer setting up a session definitely
couldn't. Collapsing them into one number that maps to the thing people actually care about (how much
Claude usage this interview is allowed) made the create-session wizard understandable. The tradeoff is
you lose fine-grained per-message control, but nobody was using it correctly anyway, so that's a feature.

---

## 5. The candidate session lifecycle is server-authoritative, and presence lives in Redis

**Decision.** Getting "leave / rejoin" right drove a cluster of related choices. Candidates start in a
**waiting room** (`admitted=false`) and the candidate UI gates the IDE on `admitted === true` — the
interviewer admits/kicks from a header popover, and the gate is checked on the server, not just the
client. "Is this person *currently* in the room?" is tracked in a Redis set `connected:{session_id}`
(SADD on WS connect, SREM in the handler's `finally`, then rebroadcast participants) — separate from
the `session_participants` DB rows, which persist forever. And on reconnect the server sends the latest
`code_change` snapshot straight to the new socket so a candidate who closed their tab picks up the live
buffer instead of the original starter code.

The biggest single call here was a *no*: when I asked for a way to rejoin and Claude started to add a
clickable "rejoin" button on the candidate dashboard, I killed it — *"we don't know what the candidate
might do during the time they were absent."* A dashboard shortcut would bypass the admit flow entirely.
So rejoining has to go back through the original invite link, which keeps the interviewer in control.
We deliberately did **not** add a `left_at` column — re-joining with the same DB row is intentional, and
presence is an ephemeral Redis concern, not a permanent DB fact. The ideas here are mine, mostly forced
out by bugs I hit while testing.

---

## 6. The UI overhaul renders unbuilt features as documented mocks — it never fakes "live"

**Decision.** When we rebuilt the whole frontend against the design roadmap, a lot of the mockups
depicted things we have no backend for yet (per-user token spend, the shared API balance, the
schedule calendar's data, the activity feed, Settings, Export PDF, etc). The rule we set: render
those surfaces from `lib/mocks.ts` so the product *looks* complete, but treat that file as
explicitly unwired — and **never touch the real data flows** (auth, WS sync, code execution,
scorecard) while doing a visual pass.

I chose this deliberately over the two alternatives (hide the unbuilt cards, or fake them as if live).
Hiding them would've made the redesign look half-finished and lost the roadmap's intent; faking them as
live would be lying to ourselves about what's done. Documenting them as mock keeps the demo honest and
gives future-me a clean punch list (§9c backlog: custom guardrail presets, per-user Anthropic key,
real `scheduled_at`). The cost is the discipline of keeping that "what's mock" list accurate every time
we add a surface — but that list is exactly what stops us from shipping a pretty lie.
