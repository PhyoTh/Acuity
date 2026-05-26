# DevLens — Testing Guide

How to run everything locally and test Deliverable 1 + Deliverable 2 yourself. Commands are
PowerShell; run terminals from the repo root (`DevLens/`) unless noted.

---

## 1. One-time prerequisites

- **Start Docker Desktop** and wait until it says "running" (DevLens needs local Postgres + Redis).
- In **Supabase → Authentication → Sign In / Providers → Email → turn OFF "Confirm email"** → Save.
  (Otherwise browser sign-up won't return a session.)
- `.env` files already exist (`backend/.env`, `frontend/.env.local`). Code execution uses the free
  Wandbox API — no key needed.

## 2. Start the stack

```powershell
# infra
docker compose up -d

# DB tables (first time + after pulling new migrations like the 0003 rename)
cd backend
uv run alembic upgrade head
# backend (leave running)
uv run python -m uvicorn app.main:app --reload          # http://localhost:8000

# frontend — second terminal, from repo root
cd frontend
pnpm dev                                        # http://localhost:3000
```
If `pnpm` isn't found: `$env:Path += ";C:\Users\patri\AppData\Roaming\npm"`.
If `uv` warns `VIRTUAL_ENV ... does not match` — harmless.

> **Access the app at `http://localhost:3000`**, not the LAN IP printed by `pnpm dev`. The
> frontend bakes `NEXT_PUBLIC_API_URL=http://localhost:8000` into its bundle and the backend's
> CORS allow-list is `http://localhost:3000`; hitting the LAN IP gives "Failed to fetch" in
> the browser console.

## 3. Health checks (is it alive?)

- `http://localhost:8000/health` → `{"status":"ok"}` (the bare `/` returns 404 — that's expected;
  it's not a route)
- `http://localhost:8000/docs` → interactive API explorer (Swagger) for every endpoint
- `http://localhost:3000` → landing page

---

## 4. Deliverable 1 — full interview (two browser windows)

Use a **normal window** (interviewer) and an **incognito window** (candidate). The roles **must**
be different Supabase accounts — re-using one account on both pages makes the "candidate" side act
as an interviewer and chat messages get silently dropped server-side.

| # | Action | Expected | Proves |
|---|---|---|---|
| 1 | Normal → `/signup` → register interviewer | lands on `/dashboard` (empty list) | Supabase auth (ES256/JWKS) + role routing |
| 2 | Click **+ New session** → fill prompt + set **Hallucination = 100%** + preset `hints_only` → **Create session** | green panel with the `/join/<CODE>` link + "Open live view" | session create + join code |
| 3 | Incognito → open the link → sign up as candidate | lands in the IDE at `/interview/<sessionId>` | candidate invite + role=candidate |
| 4 | Interviewer clicks **Open live view** (or opens the row from `/dashboard`) | read-only mirror, header "live" | interviewer mirror + WebSocket |
| 5 | Candidate types code | interviewer's editor mirrors it (~0.4s) | live code sync + telemetry |
| 6 | Candidate asks the AI a question | candidate gets a Claude reply | agent end-to-end |
| 7 | Look at interviewer's copy of that AI reply | amber **"flagged: hallucinated"** (candidate never sees it) | hallucinator + flag redaction |
| 8 | Interviewer clicks **End interview** | **Scorecard** appears (4 scores + summary) | scorecard generator |

Make a second session with **Hallucination = 0%** and repeat 6–7 → interviewer replies show **no** flag.

---

## 5. Deliverable 2 — stretch goals

### 5a. Code execution + hidden tests
1. Interviewer creates a session: language `python`, prompt "Read two ints from stdin, print their
   sum." Add **test cases**: `stdin = 2 3`, `expected = 5` (mark a second one `4 5`→`9` as **hidden**).
2. Candidate joins, writes:
   ```python
   a, b = map(int, input().split())
   print(a + b)
   ```
   Click **Run** → "**2/2 tests passed**"; the hidden test shows only pass/fail, no values.
3. Break the code (`print(a - b)`) → Run → failures; the **public** test shows expected vs got, the
   hidden one just shows ✗. Interviewer view header shows `last run X/Y`.
   - *(Languages: python/javascript/typescript/java/cpp/go. Java needs `public class Main`.)*

### 5b. AI query quota
1. Interviewer sets **AI query quota = 2** on a session.
2. Candidate chat panel shows "AI queries left: 2/2". Send 2 messages (replies come), then a 3rd →
   blocked with "AI query quota reached"; no AI reply.

### 5c. Copy-paste cheat detection
1. Candidate pastes a large block (>40 chars) into the editor.
2. Interviewer view header shows **"⚠ 1 large paste(s)"** (increments per large paste).

### 5d. Replay timeline
1. After the candidate has typed for a bit, interviewer clicks **Replay**.
2. A slider appears — drag it to scrub through code snapshots over time (with timestamps). Click
   **Back to live** to resume.

### 5e. Real-time push-back questions
1. Interviewer creates a session with **"Enable real-time push-back questions"** checked.
2. Candidate chats with the AI. After a turn, the interviewer view shows a **"Suggested push-back
   questions"** panel (1–3 questions). The candidate never receives these.

---

## 6. Negative / guard tests (should be blocked)

- Candidate visits `http://localhost:3000/dashboard` → redirected away (role guard).
- Logged out, visit `/interview/<id>` → redirected to `/login`.
- Join with a wrong code → "Invalid join code".
- Candidate has no "End interview" button; backend ignores `interview_end` from non-interviewers.

## 7. Inspect the recorded data

App data is in **local Postgres** (auth users are in Supabase → Authentication → Users):

```powershell
docker exec devlens-postgres psql -U devlens -d devlens -c "select role, was_hallucinated, left(content,50) from transcripts order by created_at;"
docker exec devlens-postgres psql -U devlens -d devlens -c "select actor, type, payload from events order by created_at desc limit 15;"
docker exec devlens-postgres psql -U devlens -d devlens -c "select overall, scores from scorecards;"
```
Look for `code_change`, `code_run`, `paste_flag` events and flagged assistant transcripts.

## 8. Backend-only API testing (no browser)

```powershell
cd backend
$t = (uv run python scripts/mint_test_token.py --role interviewer | Select-Object -Last 1)
Invoke-RestMethod -Uri http://localhost:8000/auth/me -Headers @{ Authorization = "Bearer $t" }
```
Or open `http://localhost:8000/docs`, click **Authorize**, paste the token, and exercise
`POST /sessions`, `POST /sessions/join`, `POST /sessions/{id}/run`, `GET /sessions/{id}/events`, etc.

## 9. Reset to a clean slate

```powershell
docker compose down -v
docker compose up -d
cd backend ; uv run alembic upgrade head
```
(Clears local app data only; Supabase auth users remain — delete `*@example.com` test users in
Supabase Auth if you like.)

## 10. Troubleshooting

- **`docker ...` "cannot find the file specified"** → Docker Desktop isn't running. Start it.
- **"Failed to fetch" in the browser** → you're accessing the frontend at the LAN IP (e.g.
  `192.168.x.x:3000`) but the bundled API URL is `localhost:8000` and the backend's CORS list is
  `localhost:3000`. Use `http://localhost:3000` instead, or update both env files and restart.
- **AI doesn't reply and the interviewer doesn't see the candidate's chat message** → you're
  testing both sides from the same Supabase account (the one logged in as interviewer). The WS
  handler drops `chat_message` from non-candidates. Open the candidate side in an incognito window
  and sign up via the `/join/<CODE>` link.
- **Stuck after sign-up** → email confirmation still on (see §1).
- **Run shows only stdout, no pass/fail** → that session has no test cases (add them in Create session).
- **Backend won't start / DB errors** → containers not up (`docker compose up -d`) or migrations
  not applied (`uv run alembic upgrade head`).
- **First AI reply is slow** → cold model call; subsequent ones are faster.
- **`Failed to spawn: uvicorn ... Application Control policy has blocked this file (os error 4551)`**
  → Windows Smart App Control blocked the venv `uvicorn.exe` shim. Run it as a module instead:
  `uv run python -m uvicorn app.main:app --reload`. (Same trick works for any blocked shim, e.g.
  `uv run python -m alembic ...`.)
