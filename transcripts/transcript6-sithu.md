# Acuity (DevLens) — Session 6 Transcript (Summary Polish, Scorecard Fairness & Proposal Review)

> Auto-generated from the Claude Code chat session. All API keys, JWTs, secrets, and passwords
> have been redacted. (None appeared in this session.)
>
> User messages: 4 · Major assistant turns: 4
>
> Outcome: fixed three post-mortem UX bugs (key-turns markdown, scorecard fairness for
> non-AI-users + correct-solution scoring, display-name modal flicker), then patched a fabricated
> "Caught X/4 hallucinations" chip that fired when no hallucinations actually existed, and finally
> produced a marked-up proposal review document mapping each item in the original proposal to its
> implementation status in the current codebase.

---

### 👤 User

> After an interview ends and a session summary is generated, the key turns section is not
> rendered in markdown. As such, the conversation between the user and the AI looks off when the
> AI gives code outputs. Make it so that the key turns section is rendered in markdown for better
> readability.
>
> The AI scoring in session summary needs to be better. Re-evaluate how the scores are generated
> and make it more fair and realistic. From what I am seeing right now, even if the user gets the
> fully correct solution, they do not get a 10/10 in code correctness. Instead, they only receive
> 9/10 all the time for fully correct solutions. Additionally, I don't feel good that the user
> gets a very low overall score if they do not utilize AI because their scores on "prompt quality"
> and "caught AI errors" become very low.
>
> When I click into one of the sessions, I am noticing a very small flicker where it seems like
> it wants to take me into a session as I see the page to set my display name for a few
> milliseconds before seeing the session summary. Fix this flicker.

### 🤖 Assistant

Tackled all three issues in one pass.

**1. Key Turns markdown.** [`frontend/components/Dashboard/SummaryView.tsx`] was rendering
assistant turns with plain `whitespace-pre-wrap`, so code fences and lists came out as raw
backticks. Imported `ReactMarkdown` + `remark-gfm` (same renderer used by `ChatBox`) and
branched on `t.role === "assistant"` to render markdown for AI turns and plain text for
candidate turns. Bumped the truncation cap from 220 → 600 chars so code blocks aren't sliced
mid-fence.

**2. Scorecard fairness.** Rewrote the system prompt in
[`backend/app/services/scorecard.py`] with an explicit per-dimension rubric:

- **Code correctness:** "A fully-passing solution must score 10" — kills the reflexive 9.
- **Prompt quality:** if the candidate sent ≤1 prompts, return 7 (neutral) and mention
  "limited AI use" in the summary — no penalty for self-reliance.
- **Caught AI errors:** if there were 0 hallucinated turns in the transcript, return 7
  (neutral) — no penalty when there's nothing to catch.
- **Approach & independence:** "Solving without AI should score HIGH (8-10)" — flips the
  incentive so a confident solo solver isn't punished.

Also enriched the user-prompt with hard signals so the model grades against facts rather than
vibes: the latest `code_run` event's `passed/total`, the candidate-prompt count, and the
hallucination count, plus an inline directive ("ALL TESTS PASSED — code_correctness must be 10")
when the run was clean.

**3. Display-name modal flicker.** Diagnosed in
[`frontend/app/dashboard/[sessionId]/page.tsx`]: the render guards were ordered
`if (!nameReady && token) return <DisplayNameModal>` then `if (ended) return <SummaryView>`.
On mount, `setToken` fires before the async `getSession()` resolves, so React renders the
modal for one frame before discovering `status === "ended"` and switching to the summary view.

Fix: introduced a `bootReady` boolean that flips true only after the initial profile +
session fetch resolves, render a blank shell until then, and moved the `ended` guard above the
modal guard. Net effect: zero modal flash when opening any session — live or ended.

Ran `ruff check`, `mypy app/services/scorecard.py`, and `tsc --noEmit` — all green.

---

### 👤 User

> Despite their being no hallucinations from the AI, the AI summary had a tab that says that the
> candidate "Caught 3/4 hallucinations"

### 🤖 Assistant

The bug was in `SummaryView.tsx` — the chips block fabricated the label from the score alone:

```ts
if ((s.caught_ai_errors ?? 0) >= 6)
  chips.push({ kind: "warn",
    label: `Caught ${Math.round((s.caught_ai_errors ?? 0) * 0.4)}/4 hallucinations` });
```

With the new fairness rule, sessions with zero hallucinations get a neutral 7 for
`caught_ai_errors`, which trips the `>= 6` threshold, and the `/4` denominator is hardcoded
regardless of how many hallucinations actually fired.

Grounded the chip in transcript reality: count the actual hallucinated assistant turns from
`transcripts`, gate the chip on `hallucinationTotal > 0`, use that count as the denominator,
and compute the numerator as a proportion of the score capped at the real total. Sessions
with no hallucinations now show no chip; sessions with N hallucinations show "Caught X/N".

`tsc --noEmit` clean.

---

### 👤 User

> [pasted full original DevLens project proposal — title, one-sentence description, planned
> technologies, first deliverable, rough architecture (7 components), after-first-deliverable
> goals]
>
> Create a markdown of a document that is a "marked up" copy of my proposal. For each item in my
> proposal, indicate if it's (a) implemented as written/in-use as written, in which case you say
> where in the code that is, (b) planned to be implemented, in which case you should say where it
> will fit in, (c) no longer planned. The items you should report on are: Planned technologies,
> First deliverable, Rough architecture for first deliverable, After first deliverable goals.

### 🤖 Assistant

Spot-checked the codebase to verify claims before writing — confirmed the executor uses
Wandbox not Piston (Piston whitelist-only since 2026-02-15), confirmed `token_budget` replaced
`query_quota` in migration 0004, confirmed `guardrail_presets` (multi-select) on
`interview_sessions`, confirmed the `paste_flag` flow on `onPaste`, confirmed every service
file referenced in the proposal architecture exists.

Wrote [`PROPOSAL_REVIEW.md`] at the repo root. Structure:

- **Planned technologies** — table format, every proposed stack item gets ✅/🟡/❌ + a clickable
  file path. Render is the only 🟡 (deploy not yet wired); Anthropic Claude + uv/pnpm are
  flagged as extras not in the original document.
- **First deliverable** — narrative goals mapped to code files. All ✅; only a live deploy with
  real credentials remains.
- **Rough architecture for first deliverable** — each of the 7 components (Auth, IDE,
  Sync Gateway, Agent, Hallucinator, Telemetry, Scorecard) gets its Inputs/Outputs/Effects
  bullets traced to actual files. All seven are ✅ implemented, with notes where reality is
  richer than the proposal (multi-select guardrails, Redis-tracked presence, etc.).
- **After first deliverable goals** — 5 of 6 ✅; the "query quota" is 🟡 reshaped into a token
  budget (migration 0004 drops the old column); Piston is ❌ swapped for Wandbox. Plus
  sections listing things shipped beyond the proposal (waiting room, replay timeline,
  tab/cursor monitoring, Acuity design-system overhaul) and UI-promised-but-mock items
  (custom presets, BYO key, scheduling).
- **Explicitly dropped / replaced** — Piston (whitelist), `query_quota` (replaced by token
  budget), and the original "DevLens / recruiter / room" naming (renamed to
  Acuity / interviewer / session on 2026-05-26).

Every file reference uses clickable markdown links so the document doubles as a navigation
index from the proposal into the current codebase.

---

### 👤 User

> Export this conversation to the transcripts folder

### 🤖 Assistant

(this document)
