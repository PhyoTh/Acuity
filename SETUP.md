# DevLens — Setup Guide

A step-by-step guide to run DevLens end-to-end, written for someone setting up **Supabase** and
**Anthropic** for the first time. Everything except the Anthropic API usage is **free**.

> Already know the stack? The TL;DR is at the bottom.

## 0. Install prerequisites

- [Docker Desktop](https://docs.docker.com/get-docker/) (for local Postgres + Redis) — **make sure
  it is running** before you start.
- [uv](https://docs.astral.sh/uv/getting-started/installation/) (Python) — `pip install uv` works too.
- [Node 18+](https://nodejs.org/) and [pnpm](https://pnpm.io/installation) — `npm i -g pnpm`.

## 1. Supabase (auth + database) — free

1. Create an account at [supabase.com](https://supabase.com) and click **New project**. Pick any
   name, set a database password (save it somewhere), choose a region near you, and wait ~2 min for
   it to provision.
2. **Get your keys.** Project → **Settings → API**. Copy:
   - **Project URL** → `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `SUPABASE_ANON_KEY` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key (keep secret!) → `SUPABASE_SERVICE_ROLE_KEY`
   - **JWT Secret** (under *JWT Settings*; may be labeled *Legacy JWT secret*) → `SUPABASE_JWT_SECRET`
3. **Turn OFF email confirmation for dev.** Authentication → **Sign In / Providers → Email** →
   disable **Confirm email** (and Save). This lets sign-up return a session immediately so the
   recruiter/candidate flows work without an inbox round-trip. (Re-enable for production.)

   > **JWT note:** DevLens verifies Supabase tokens for **both** signing setups automatically —
   > asymmetric **ES256/RS256** user tokens via Supabase's JWKS endpoint, and legacy **HS256** (the
   > shared JWT Secret) for locally minted dev tokens. Either configuration works out of the box; the
   > JWT Secret is still used by `scripts/mint_test_token.py`. You do **not** need to create database
   > tables in the Supabase UI — our Alembic migration does that (step 4).

## 2. Anthropic (the AI) — small cost, free credit to start

1. Sign up at [console.anthropic.com](https://console.anthropic.com). New accounts get a small
   **free credit** — enough for lots of interview testing.
2. **Settings → API Keys → Create Key.** Copy it → `ANTHROPIC_API_KEY`.
3. **Cost control (already configured for you):** DevLens defaults to the cheapest capable model
   (`claude-haiku-4-5-20251001`), caps `max_tokens`, and caps chat history. With Haiku, a full
   mock interview costs only a few cents. To raise quality later, set
   `ANTHROPIC_MODEL=claude-sonnet-4-6` (more expensive).

## 3. Fill in environment files

```bash
cp backend/.env.example backend/.env
cp frontend/.env.local.example frontend/.env.local
```

Edit `backend/.env` — set `SUPABASE_*`, `SUPABASE_JWT_SECRET`, and `ANTHROPIC_API_KEY`. Leave
`DATABASE_URL` / `REDIS_URL` as the local Docker defaults.

Edit `frontend/.env.local` — set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
Leave the `API`/`WS` URLs as the localhost defaults.

## 4. Start infra + create the database tables

```bash
docker compose up -d                       # Postgres + Redis
cd backend
uv sync                                     # install deps into .venv
uv run alembic upgrade head                 # creates the 6 tables in the Docker Postgres
```

> For **production**, point `DATABASE_URL` at your Supabase connection-pooler string
> (Settings → Database → Connection pooling) and run `alembic upgrade head` once against it.

## 5. Run the apps (two terminals)

```bash
# Terminal 1 — backend
cd backend
uv run python -m uvicorn app.main:app --reload        # http://localhost:8000  (GET /health -> {"status":"ok"})

# Terminal 2 — frontend
cd frontend
pnpm install
pnpm dev                                     # http://localhost:3000
```

## 6. Try the full flow

1. Go to `http://localhost:3000/signup` → create a **recruiter** account → you land on `/dashboard`.
2. Fill **New interview room** (language, prompt, guardrail preset, hallucination %) → **Create
   room**. Copy the **candidate invite link** it shows (`/join/<CODE>`).
3. Open that link in an **incognito window**, sign up as the candidate, and you land in the IDE.
4. Candidate: type code + chat with the AI. Recruiter: open the room from `/dashboard` to watch the
   live code + chat mirror (recruiter sees the **hallucinated** flag; candidate does not).
5. Recruiter clicks **End interview** → the LLM **scorecard** appears on the dashboard.
6. Inspect `events` / `transcripts` / `scorecards` in the Supabase **Table editor** (or your local
   Postgres) to see the telemetry.

## Backend-only testing without Supabase (optional)

Mint a local token signed with your `SUPABASE_JWT_SECRET` and call the API directly:

```bash
cd backend
uv run python scripts/mint_test_token.py --role recruiter   # prints a JWT
# curl -H "Authorization: Bearer <token>" http://localhost:8000/auth/me
```

## Deliverable 2 features (already built)

After pulling D2, apply the new migration once (Docker up): `cd backend && uv run alembic upgrade head`
(adds test cases / quota / token limit / push-back columns). Then in **Create room** you can set
test cases (for the candidate **Run** button + hidden grading), an AI query quota, an AI token limit,
and toggle real-time push-back questions. Code execution uses the free **Wandbox** API — no setup or
key required. Recruiter dashboard adds a **Replay** scrubber, a large-paste cheat warning, and a
push-back panel.

## Deploying to Render (later)

Two services: the FastAPI backend (`uvicorn app.main:app`) and the Next.js frontend. Set the same
env vars in Render, point `DATABASE_URL` at the Supabase pooler, and set `FRONTEND_ORIGIN` /
`NEXT_PUBLIC_*` to the deployed URLs. (Not configured in this deliverable.)

## TL;DR

```bash
cp backend/.env.example backend/.env          # fill SUPABASE_* + ANTHROPIC_API_KEY
cp frontend/.env.local.example frontend/.env.local
docker compose up -d
cd backend && uv sync && uv run alembic upgrade head && uv run python -m uvicorn app.main:app --reload
# new terminal:
cd frontend && pnpm install && pnpm dev
```
