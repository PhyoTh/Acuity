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

# DB tables (first time + after pulling new migrations like D2's 0002)
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

## 3. Health checks (is it alive?)

- `http://localhost:8000/health` → `{"status":"ok"}`
- `http://localhost:8000/docs` → interactive API explorer (Swagger) for every endpoint
- `http://localhost:3000` → landing page

---

## 4. Deliverable 1 — full interview (two browser windows)

Use a **normal window** (recruiter) and an **incognito window** (candidate).

| # | Action | Expected | Proves |
|---|---|---|---|
| 1 | Normal → `/signup` → register recruiter | lands on `/dashboard` | Supabase auth (ES256/JWKS) + role routing |
| 2 | Create a room (set a prompt; **Hallucination = 100%**; preset `hints_only`) | green box with a `/join/<CODE>` link | room create + join code |
| 3 | Incognito → open the link → sign up as candidate | lands in the IDE | candidate invite + role=candidate |
| 4 | Recruiter → `/dashboard` → click the room | read-only mirror, header "live" | recruiter mirror + WebSocket |
| 5 | Candidate types code | recruiter's editor mirrors it (~0.4s) | live code sync + telemetry |
| 6 | Candidate asks the AI a question | candidate gets a Claude reply | agent end-to-end |
| 7 | Look at recruiter's copy of that AI reply | amber **"flagged: hallucinated"** (candidate never sees it) | hallucinator + flag redaction |
| 8 | Recruiter clicks **End interview** | **Scorecard** appears (4 scores + summary) | scorecard generator |

Make a second room with **Hallucination = 0%** and repeat 6–7 → recruiter replies show **no** flag.

---

## 5. Deliverable 2 — stretch goals

### 5a. Code execution + hidden tests
1. Recruiter creates a room: language `python`, prompt "Read two ints from stdin, print their sum."
   Add **test cases**: `stdin = 2 3`, `expected = 5` (mark a second one `4 5`→`9` as **hidden**).
2. Candidate joins, writes:
   ```python
   a, b = map(int, input().split())
   print(a + b)
   ```
   Click **Run** → "**2/2 tests passed**"; the hidden test shows only pass/fail, no values.
3. Break the code (`print(a - b)`) → Run → failures; the **public** test shows expected vs got, the
   hidden one just shows ✗. Recruiter view header shows `last run X/Y`.
   - *(Languages: python/javascript/typescript/java/cpp/go. Java needs `public class Main`.)*

### 5b. AI query quota
1. Recruiter sets **AI query quota = 2** on a room.
2. Candidate chat panel shows "AI queries left: 2/2". Send 2 messages (replies come), then a 3rd →
   blocked with "AI query quota reached"; no AI reply.

### 5c. Copy-paste cheat detection
1. Candidate pastes a large block (>40 chars) into the editor.
2. Recruiter view header shows **"⚠ 1 large paste(s)"** (increments per large paste).

### 5d. Replay timeline
1. After the candidate has typed for a bit, recruiter clicks **Replay**.
2. A slider appears — drag it to scrub through code snapshots over time (with timestamps). Click
   **Back to live** to resume.

### 5e. Real-time push-back questions
1. Recruiter creates a room with **"Enable real-time push-back questions"** checked.
2. Candidate chats with the AI. After a turn, the recruiter view shows a **"Suggested push-back
   questions"** panel (1–3 questions). The candidate never receives these.

---

## 6. Negative / guard tests (should be blocked)

- Candidate visits `http://localhost:3000/dashboard` → redirected away (role guard).
- Logged out, visit `/interview/<id>` → redirected to `/login`.
- Join with a wrong code → "Invalid join code".
- Candidate has no "End interview" button; backend ignores `interview_end` from non-recruiters.

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
$t = (uv run python scripts/mint_test_token.py --role recruiter | Select-Object -Last 1)
Invoke-RestMethod -Uri http://localhost:8000/auth/me -Headers @{ Authorization = "Bearer $t" }
```
Or open `http://localhost:8000/docs`, click **Authorize**, paste the token, and exercise
`POST /rooms`, `POST /rooms/join`, `POST /rooms/{id}/run`, `GET /rooms/{id}/events`, etc.

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
- **Stuck after sign-up** → email confirmation still on (see §1).
- **Run shows only stdout, no pass/fail** → that room has no test cases (add them in Create room).
- **Backend won't start / DB errors** → containers not up (`docker compose up -d`) or migration not
  applied (`uv run alembic upgrade head`).
- **First AI reply is slow** → cold model call; subsequent ones are faster.
- **`Failed to spawn: uvicorn ... Application Control policy has blocked this file (os error 4551)`**
  → Windows Smart App Control blocked the venv `uvicorn.exe` shim. Run it as a module instead:
  `uv run python -m uvicorn app.main:app --reload`. (Same trick works for any blocked shim, e.g.
  `uv run python -m alembic ...`.)
