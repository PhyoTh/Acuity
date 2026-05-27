# Acuity — Frontend Implementation Roadmap

> **Context for the implementing agent:** This document is the complete spec for rebuilding the Acuity (formerly DevLens) frontend based on a design prototype made in Claude Design. The prototype was written in React+JSX via Babel-in-browser (a single HTML file). Your job is to port that prototype into the **existing Next.js + Tailwind codebase** in this repo, preserving every visual detail.
>
> The source-of-truth prototype lives at the **bottom of this document** in the "Reference: prototype JSX" section — read it before you start. It contains exact JSX, inline styles, copy, and interactions. When in doubt, **match the prototype exactly**.

---

## 0. Repo orientation & ground rules

Before writing code:

1. Read `app/` (Next.js App Router), check what pages already exist, what's in `components/`, and what the current Tailwind config looks like.
2. **Do not delete working backend wiring** — only swap the visuals. If a page already calls an API or has a real Monaco editor, keep that scaffolding and replace the surrounding chrome.
3. **Stack expectations:**
   - Next.js (App Router) + React 18
   - Tailwind for layout/spacing utilities
   - **Custom CSS variables** in `app/globals.css` for the color tokens (Tailwind theme isn't expressive enough — we use OKLCH)
   - Fonts: load from Google Fonts via `next/font`
   - Icons: re-create as inline SVG components (the prototype has its own minimal set — no icon library)
4. **No emoji in UI text.** The prototype is deliberately restrained.
5. **One signature treatment**: the "Hallucination" amber-underlined span with a hover popover revealing the original AI text. This must work pixel-perfect.

---

## 1. Design system

### 1.1 Color tokens (drop into `app/globals.css`)

All colors are OKLCH. They cannot be expressed in Tailwind's default theme, so define them as CSS custom properties on `:root` and reference via `var(--name)` in Tailwind via `bg-[var(--bg-1)]` or extend Tailwind theme with `colors: { 'bg-0': 'var(--bg-0)', … }`.

```css
:root {
  /* Cool near-black palette */
  --bg-0: oklch(0.13 0.006 240);     /* deepest — page background */
  --bg-1: oklch(0.165 0.007 240);    /* surface */
  --bg-2: oklch(0.20 0.008 240);     /* raised */
  --bg-3: oklch(0.245 0.009 240);    /* hover */

  --line-1: oklch(0.26 0.008 240);   /* hairline */
  --line-2: oklch(0.32 0.010 240);   /* stronger border */

  --fg-0: oklch(0.97 0.005 240);     /* primary text */
  --fg-1: oklch(0.82 0.006 240);     /* secondary */
  --fg-2: oklch(0.62 0.008 240);     /* muted */
  --fg-3: oklch(0.46 0.008 240);     /* faint */

  /* Signal colors — equal lightness/chroma, hue varies */
  --live:    oklch(0.74 0.16 155);   /* emerald — live / ok / primary action */
  --warn:    oklch(0.80 0.16 75);    /* amber — hallucination / caution */
  --signal:  oklch(0.78 0.14 230);   /* ice blue — data / metrics */
  --bad:     oklch(0.70 0.20 25);    /* red — errors / kick */

  --live-dim:   oklch(0.74 0.16 155 / 0.14);
  --warn-dim:   oklch(0.80 0.16 75 / 0.14);
  --signal-dim: oklch(0.78 0.14 230 / 0.14);
  --bad-dim:    oklch(0.70 0.20 25 / 0.14);

  --radius: 6px;
  --radius-lg: 10px;

  --font-display: "Instrument Serif", "Times New Roman", serif;
  --font-sans:    "Geist", "Helvetica Neue", system-ui, sans-serif;
  --font-mono:    "JetBrains Mono", "SF Mono", "Menlo", monospace;
}

html, body { margin: 0; padding: 0; background: var(--bg-0); color: var(--fg-0); }
body {
  font-family: var(--font-sans);
  font-size: 14px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  font-feature-settings: "ss01", "cv11";
  letter-spacing: -0.005em;
  overflow-x: hidden;
}
```

### 1.2 Atmospheric background

The whole app sits on a subtle radial bloom + faint grid. Add to `body::before` and `body::after`:

```css
body::before {
  content: "";
  position: fixed; inset: 0;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, oklch(0.74 0.16 155 / 0.06), transparent 60%),
    radial-gradient(ellipse 60% 50% at 100% 100%, oklch(0.78 0.14 230 / 0.04), transparent 60%);
  pointer-events: none;
  z-index: 0;
}
body::after {
  content: "";
  position: fixed; inset: 0;
  background-image:
    linear-gradient(to right, var(--line-1) 1px, transparent 1px),
    linear-gradient(to bottom, var(--line-1) 1px, transparent 1px);
  background-size: 64px 64px;
  opacity: 0.18;
  pointer-events: none;
  z-index: 0;
  mask-image: radial-gradient(ellipse 100% 80% at 50% 30%, black 30%, transparent 80%);
}
/* All page content should sit above the atmosphere */
#__next, main, body > div[id="root"] { position: relative; z-index: 1; }
```

### 1.3 Typography

Load via `next/font/google` in `app/layout.tsx`:

- **Instrument Serif** (weights 400, italic) — display headings & accent words. Use for the wordmark, hero `h1`, screen titles. Apply slight italic variant for the highlighted word in headings.
- **Geist** (weights 300, 400, 500, 600, 700) — body, buttons, all UI.
- **JetBrains Mono** (weights 400, 500, 600) — code, IDs, timestamps, ALL-CAPS section labels, sparkline numbers.

Helper classes:

```css
.display        { font-family: var(--font-display); font-weight: 400; letter-spacing: -0.02em; }
.display-italic { font-family: var(--font-display); font-style: italic; font-weight: 400; letter-spacing: -0.01em; }
.mono           { font-family: var(--font-mono); font-feature-settings: "ss01", "ss02"; }
.tabular        { font-variant-numeric: tabular-nums; }
```

### 1.4 Common components

Build these once as React components in `components/ui/`:

| Component | Spec |
|---|---|
| `<Aperture size={n} color="var(--live)" />` | SVG lens-iris logo: a circle with 6 radial blades and a center dot. See exact SVG in prototype `ui.jsx` lines 8–29. |
| `<Wordmark size={18} />` | `<Aperture size={size+4}/>` + the text "Acuity" in Instrument Serif italic, color `--fg-0`. |
| `<Pill kind="live\|warn\|signal\|bad\|muted">` | Inline flex, 999px radius, 3×8 padding, mono 11px, uppercase, 0.04em letterspacing. Optional pulsing dot (live status). |
| `<Sparkline values width height color fill />` | SVG path with optional 12%-opacity area fill underneath. |
| `<SectionLabel>` | Mono 10px, uppercase, 0.14em letterspacing, color `--fg-3`. Optionally a right-side `extra` slot. |
| `<Card title right>` | `--bg-1` background, 1px `--line-1` border, 10px radius. Optional mono uppercase header strip. |
| `<Stat label value sub accent spark>` | A `Card` with a section-label, big display-font number, and optional sparkline aligned-baseline to the right. |
| `<Avatar name size />` | Round, gradient based on hash of name, 2-letter initials. See lines 129–142 of prototype `ui.jsx`. |
| `<Icon name size />` | Minimal stroke icons. **Use only what's listed in `ui.jsx` paths object** (lines 150–184). Don't import lucide/heroicons. |
| `<CodeBlock code language activeLine highlightLines>` | Faux Monaco view — line numbers in `--fg-3`, syntax-highlighted by a small tokenizer, supports per-line highlight bg + left-border accent + a right-side mono label. See `ui.jsx` lines 189–287. |
| `<HeatStrip values height color>` | Tiny bar-chart of vertical bars, 4px wide, opacity scales with magnitude. |
| `<Progress value max color height>` | Plain rounded-pill progress bar. |

### 1.5 Button & input styles

```css
.btn {
  display: inline-flex; align-items: center; gap: 8px;
  padding: 8px 14px; border-radius: var(--radius);
  font-family: var(--font-sans); font-size: 13px; font-weight: 500;
  cursor: pointer; transition: all 0.12s ease;
  border: 1px solid var(--line-2);
  background: var(--bg-2); color: var(--fg-0);
  letter-spacing: -0.005em;
}
.btn:hover { background: var(--bg-3); border-color: oklch(0.40 0.010 240); }
.btn-primary {
  background: var(--live); border-color: var(--live);
  color: oklch(0.10 0.01 155); font-weight: 600;
}
.btn-primary:hover {
  background: oklch(0.80 0.16 155); border-color: oklch(0.80 0.16 155);
  box-shadow: 0 0 0 4px var(--live-dim);
}
.btn-ghost  { background: transparent; border-color: transparent; color: var(--fg-1); }
.btn-ghost:hover { color: var(--fg-0); background: var(--bg-2); }
.btn-danger { color: oklch(0.95 0.05 25); background: oklch(0.40 0.18 25);
              border-color: oklch(0.50 0.20 25); }
.btn-danger:hover { background: oklch(0.45 0.20 25); }
.btn-sm { padding: 5px 10px; font-size: 12px; }

.input, .textarea, .select {
  width: 100%;
  background: var(--bg-1); border: 1px solid var(--line-1);
  border-radius: var(--radius); color: var(--fg-0);
  padding: 9px 12px; font-family: var(--font-sans); font-size: 13px;
  outline: none; transition: all 0.12s ease;
}
.input:focus, .textarea:focus, .select:focus {
  border-color: var(--live); box-shadow: 0 0 0 3px var(--live-dim);
}
```

### 1.6 The signature: hallucination spans

```css
.hallu {
  background: linear-gradient(180deg, transparent 60%, oklch(0.80 0.16 75 / 0.25) 60%);
  border-bottom: 1px dashed var(--warn);
  cursor: help;
  position: relative;
}
.hallu:hover { background: oklch(0.80 0.16 75 / 0.2); }
```

Hover behavior: render an absolutely-positioned popover above the span containing:
- A header row: amber warn icon + "rewritten span" (uppercase, 0.06em letterspacing)
- "Original: `<original text in mono+green>`"
- A wrap-allowed reason line in `--fg-2`

The popover box: `--bg-0` background, 1px amber border, 6px radius, drop-shadow `0 12px 24px -8px black`, z-index 10–20.

---

## 2. Routes & screens

The prototype is a single-page app that swaps a `screen` state. In Next.js, map these to actual routes:

| Screen | Route | Source file (prototype) |
|---|---|---|
| Landing (marketing) | `/` | `screens/landing.jsx` + `screens/landing-sections.jsx` |
| Log in | `/login` | `screens/auth.jsx` → `Login` |
| Sign up | `/signup` | `screens/auth.jsx` → `Signup` |
| Interviewer dashboard | `/interviewer` (or `/dashboard`) | `screens/interviewer-home.jsx` |
| Create session wizard | `/interviewer/new` | `screens/auth.jsx` → `CreateWizard` |
| Live session (interviewer) | `/interviewer/session/[id]` | `screens/live-session.jsx` |
| Session summary | `/interviewer/session/[id]/summary` | `screens/summary.jsx` |
| Candidate home (log of own sessions) | `/candidate` | `screens/auth.jsx` → `CandidateHome` |
| Candidate IDE | `/candidate/session/[id]` or `/join/[code]` | `screens/candidate-ide.jsx` |

Each screen below describes layout, anchors, and copy. The prototype JSX in the appendix is the literal source — match it.

---

## 3. Screen specs

### 3.1 Landing (`/`)

**Anchor sections** with smooth-scroll nav: Hero → How it works → Features → Contact → Footer.

#### Top nav
- Sticky, `padding: 20px 48px`, bottom hairline border, `backdrop-filter: blur(8px)`, semi-transparent bg `oklch(0.13 0.006 240 / 0.7)`.
- Left: `<Wordmark size={18}/>`
- Right (in order): "How it works", "Features", "Contact" (anchor links with smooth scroll) → small vertical divider → "Log in" ghost button → "Get access" primary button with arrow icon.

#### Hero
- Two-column grid `1.05fr 1fr`, 64px gap, 80px top padding, max-width 1320px, centered.
- **Left**:
  - `h1` 92px Instrument Serif, line-height 0.96, letter-spacing -0.03em. **Four lines:**
    ```
    Measure how
    they prompt.        <-- "prompt" italic, color var(--live)
    Measure what
    they catch.         <-- "catch" italic, color var(--warn)
    ```
  - Subhead 17px / line-height 1.55 / `--fg-1` / max-width 540px / margin-top 28px:
    > "Acuity drops candidates into a live IDE with an AI pair-programmer on a strict token budget — then quietly corrupts a slice of its replies. You watch from the other side as they ration prompts and catch the lies. Or don't."
  - Single CTA "Start a session →" (`btn btn-primary`)
  - Tiny line below: green bullet + "Acuity is free — you only pay Anthropic for the AI calls" + mono link "(bring your own API key)" pointing to `console.anthropic.com`.

- **Right — live hallucination demo card:**
  - Container: `--bg-1` bg, 1px hairline, 12px radius, shadow `0 40px 80px -40px oklch(0.74 0.16 155 / 0.25), 0 0 0 1px oklch(0.74 0.16 155 / 0.06)`.
  - Header row: amber dot + mono uppercase "Interviewer view · hallucination injector"; right side: section label "Probability", range slider `accentColor: var(--warn)`, mono `{pct}%` in amber, default `pct=30`.
  - Body: two chat bubbles —
    - User: avatar "Sithu" + mono timestamp + grey bubble: "What's the time complexity of heapq.heappush and heappop?"
    - AI: aperture-icon avatar (color switches between live emerald when clean and warn amber when any corruption is active) + timestamp + a `corrupted` or `clean` pill + bubble containing the **segmented message**.
  - **The message is an array of segments**. Each segment has either `t` (plain), `mono: true`, or `c` (corrupted text), `orig` (original), `tier` (1-4 ordering), `reason` (popover text). See prototype lines 11–24 for the exact segments. Active count = `Math.ceil((pct/100)*4)`; segments with `tier <= activeCount` show their `.c` value with the `.hallu` class and a hover popover.
  - Footer strip: green live dot, `tokens 1,242 / 6,000`, `injected N / 4` (turns amber when N > 0), right-aligned mono `session · 7I1Q5K5Y`.
- **Hero hints** (educational pointers that auto-dismiss after first interaction):
  - Below the slider, while `hasDragged === false`: amber mono "↑ drag to change" (bounce-Y animation).
  - Below the AI bubble after any span is corrupted but before user has hovered: dashed amber pill "↑ hover the underlined spans" (pulse animation).
  - Animations: `pointerBounceY`, `pointerFadePulse` keyframes — copy from CSS at prototype lines 215–227.

#### How it works (`#how-it-works`)
- Section label + `h2` "Three surfaces, **one truth**." (italic "one truth" in live emerald), 56px display.
- Two-column grid `0.85fr 1.15fr`, 32px gap:
  - **Left — three step cards.** Click to switch active. Default step = 2.
    - Card: 22px padding, gets accent border + 12%-opacity glow when active.
    - Step 01: "Set the trap" / icon `settings` / accent `--signal`
    - Step 02: "Watch in silence" / icon `eye` / accent `--live`
    - Step 03: "Grade the judgement" / icon `sparkle` / accent `--warn`
    - Body copy is in the prototype.
  - **Right — preview pane.** Browser-chrome header with red/yellow/green dots, mono fake URL `acuity.app — {step title}`, "step N/3" muted pill.
    - Step 1 preview: a `PreviewSetTrap` panel — 4 format buttons (Algorithm/Debugging★/System design/SQL), an amber slider with severity label ("Subtle/Standard/Aggressive"), and 3 read-only rows (Token budget 6,000 / Guardrail preset / Push-back hints) + a primary CTA "Create session → share invite link".
    - Step 2 preview: a `PreviewLive` panel — live pill + small session title + mono code mirror snippet (4 lines, candidate cursor highlight on `if len(heap) < k:`) + an amber-bordered AI chat snippet showing 2 `.hallu` spans + a 3-up telemetry strip (Tokens 1,242/6,000 / Caught 1/2 amber / Pastes 0).
    - Step 3 preview: a `PreviewGrade` panel — section label + display "Alex Chen · debugging" + big "7.6" / "10" + 4 bar-graphs (Prompt quality 82, Caught AI errors 75, Code correctness 60, Approach 88) + a replay scrubber with 8 colored event dots and 00:00 / 13:00 / 26:00 / 39:00 / 52:14 axis labels.

- **Below the 2-col grid:** an "Eight interview formats included" card. Header strip + 4-column grid (8 cells, separated by 1px lines using `gap: 1; background: var(--line-1)`). Each cell: title / one-line description / mono token-budget badge top-right / mono guardrail key bottom. Exact list:
  1. Algorithm / LeetCode — syntax-only · 0% halluc — 4k tokens
  2. API integration — hints · 12k tokens — 12k tokens
  3. Debugging ★ — 30% halluc — 6k tokens
  4. Code review — open · 4k tokens — 4k tokens
  5. Refactor / optimize — same-behavior tests — 6k tokens
  6. SQL / data query — expected-output — 3k tokens
  7. Test writing (TDD) — explain don't write — 4k tokens
  8. System design — open · 20k tokens — 20k tokens

#### Features bento (`#features`)
- Section label + `h2` 56px: "Built for the way **engineers actually work** today." (italic + emerald on the middle phrase).
- Grid: `grid-template-columns: repeat(6, 1fr)`, `grid-auto-rows: minmax(260px, auto)`, 16px gap.
- 7 cards (each is a `FeatureCard` with a mono tag in its accent color, a colored dot top-right, a 22px display title, a body paragraph, and a decoration component in its bottom):

| Card | Span | Tag | Accent | Title |
|---|---|---|---|---|
| Integrity timeline | col-4 | `integrity` | `--warn` | "Catch every suspicious moment, in order." |
| Mission-control dashboard | col-2 | `dashboard` | `--signal` | "Mission-control dashboard." |
| One link. Zero install. | col-2 | `share` | `--live` | "One link. Zero install." |
| Schedule ahead. Or start cold. | col-2 | `schedule` | `--fg-0` | "Schedule ahead. Or start cold." |
| Privacy by default. | col-2 | `privacy` | `--signal` | "Privacy by default." |
| Always free. Bring your own Anthropic key. | col-3 | `cost` | `--live` | "Always free. Bring your own Anthropic key." |
| Claude grades the judgement, not the typing. | col-3 | `grading` | `--warn` | "Claude grades the judgement, not the typing." |

Decoration components (defined in `landing-sections.jsx`):
- **IntegrityTimeline** — horizontal axis with 8 colored dots and alternating-above/below mono labels: `4% first edit (signal)`, `11% AI corrupted (warn)`, `15% pushed back (live)`, `23% paste 142ch (warn)`, `34% tab switch (bad)`, `41% idle 92s (fg-3)`, `58% 3/3 ✓ (live)`, `67% submitted (live)`. Legend row below.
- **MiniDashboard** — 4-row mini table inside `--bg-2`: rows are session title / status pill / score-or-dash (right-aligned mono). Sessions: "Search infra — onsite #2"/live, "Stripe payment flow"/pending, "Binary search — buggy"/ended/8.6, "Aggregate orders query"/ended/7.4.
- **ShareLink** — green-bordered mono pill containing `acuity.app/join/7I1Q5K5Y` + copy icon, plus muted sub-line "link is single-use · expires when session ends".
- **Calendar** — June 2026, 21 days in 7-col grid; today=14 (emerald filled), scheduled=16,18 (signal-tinted, signal border).
- **PrivacyMatrix** — 3-column header CAND/INTV + 4 rows: "Code & chat" ✓✓, "Webcam / mic" ✗✗, "Screen recording" ✗✗, "Halluc flags" — ✓ (✗ in `--bad`, ✓ in `--live`, "—" in `--fg-3`).
- **CostFootprint** — a 2-col row in `--bg-2`: left section-label "Per session" + display "$0.32" emerald; right mono "billed by" / "Anthropic, not us". Below: "Typical 50-minute interview · claude-haiku-4-5 · ~5k tokens. Your key, your bill."
- **ScoreCallout** — display "7.6" + mono "/10 · Alex Chen" + live "Strong hire" pill, followed by 4 mini-bars.

#### Contact (`#contact`)
- Big rounded section with gradient bg `linear-gradient(160deg, var(--bg-1), oklch(0.18 0.012 155 / 0.35))`, 16px radius, 56×48 padding, 1px hairline.
- Decorative low-opacity giant `<Aperture size={420}/>` absolutely positioned top-right at -120,-120, opacity 0.06.
- Two-column grid `1fr 1.1fr`, 56px gap:
  - **Left:** section-label "Contact" + `h2` 48px "Get in touch with **the team**." (italic+emerald on "the team") + paragraph: "Acuity is always free — you only pay Anthropic for the AI calls you use. Tell us a bit about how you'd use it and we'll send you a sandbox key and walk through the platform together." + a 3-row info list with icon squares: Cost / "Free, forever" / sparkle-live, Bring your own AI / "Plug in your Anthropic key" / aperture-signal, Response time / "Usually under 24 hours" / clock-fg-1.
  - **Right — form** (`Card` 28px padding):
    - Name + Email (2-col)
    - Company (1-col)
    - "What brings you here?" — 3 segmented buttons: Try Acuity / Book a demo / Something else (default selected = Try Acuity, accent live).
    - Message (textarea, 4 rows)
    - Submit primary: "Send message →"
  - On submit, replace form with a success card: big check inside emerald-dim circle, display "We'll be in touch.", "Thanks {firstName} — we got your message and will reply within 24 hours.", "Send another" secondary button.

#### Footer
- Top hairline, 32×48 padding, between `--fg-3` text:
  - Left: `<Wordmark size={14}/>` + `by Phyo Thant & Sithu Soe`
  - Right: 3 anchor links (same as nav). No "© 2026", no version string.

---

### 3.2 Auth screens (`/login`, `/signup`)

Shared `AuthLayout` — 2-col grid, 1fr 1fr:
- **Left (form column):** topbar with `<Wordmark size={16}/>` + a "← Back" ghost link returning to landing. Form centered (max-width 380), tiny `© 2026 Acuity` muted footer.
- **Right (promo column):** bg `linear-gradient(160deg, var(--bg-1), oklch(0.18 0.012 155 / 0.4))`, left hairline, 48px padding. Decorative `<Aperture size={480} color="var(--live)"/>` at -120,-120, opacity 0.08.

#### `/login`
- Side promo content:
  - `h2` 56px "Welcome **back**." (italic+emerald on "back")
  - Paragraph: "Pick up where you left off. Active sessions, scorecards, and your problem library are waiting."
- Form: section-label "Sign in" + `h1` 40px "Log in" + Email field (default `phyo@ucsd.edu`) + Password field with "Forgot?" link aligned right + primary "Continue →" full-width + muted line: "Interviewer? Create an account. Candidates join via their invite link."

#### `/signup`
- Side promo content:
  - `h2` 56px "A **better** coding interview." (italic+emerald on "better")
  - Paragraph: "Acuity makes interviews about how you _use_ AI — not whether you can copy from it."
  - 4 checklist rows (live check icon):
    - Drop candidates into a real Monaco IDE
    - Subtly corrupt AI replies at a probability you set
    - Grade four dimensions with an LLM scorecard
    - Replay every keystroke, paste, and prompt
- Form: section-label "Get started" + `h1` 40px "Create account" +
  - Role picker: 2 cards (interviewer with eye icon / candidate with code icon). Selected card: live border + 8%-opacity live bg + check icon in corner. Title + subtitle each.
  - Email + Password fields + "Create account →" primary + "Already have an account? Log in." muted line.
- On submit: route to `/interviewer` (if interviewer) or `/candidate` (if candidate).

---

### 3.3 Interviewer home (`/interviewer`)

2-col grid `240px 1fr`:

#### Sidebar (sticky, 100vh)
- Subtle background `oklch(0.12 0.006 240 / 0.6)`, right hairline.
- Wordmark + nav links (with inset 2px live left-bar when active): Sessions (active), Activity, Problem library, Candidates, Scorecards.
- Subsection "Team" with avatars: Phyo Thant, Sithu Soe.
- Footer card (pushed to bottom via `margin-top: auto`): section label "Anthropic key", mono `sk-ant-…7c2a`, "● connected · haiku-4-5" small status.

#### Main
- Header: section-label "Phyo Thant · interviewer" + `h1` 44px display "Good afternoon. **One session is live.**" (italic+emerald accent), right side has Refresh ghost button + primary "+ New session".
- **Stats row — 4 columns, 16px gap:** each is a `<Stat>` card.
  | Label | Value | Sub | Sparkline | Accent |
  |---|---|---|---|---|
  | Sessions this week | 14 | +3 vs last week | rising series | `--fg-0` |
  | Avg. caught AI errors | 62% | across 8 debugging runs | up-and-down | `--warn` |
  | Median scorecard | 7.4 | of 10 | wavy | `--signal` |
  | Tokens spent | 84.2K | $0.32 est. | exponential rise | `--live` |
- **Live session callout card** — bg gradient `linear-gradient(135deg, var(--bg-1), oklch(0.18 0.012 155 / 0.5))`, live-tinted border. 4-column inner grid:
  1. Live pill (pulsing) + mono code "7I1Q5K5Y" / display title "Search infra — onsite #2" / row with avatar + "Sithu Soe · Debugging · python"
  2. "Token budget" section-label / "1,242" display + "/ 6,000" mono / `<Progress value=1242 max=6000>`
  3. "AI corruption" section-label / display "1 / 2" amber / "caught" mono / `<HeatStrip>` amber
  4. Centered primary button "Open live view →"
- Below: 2-col `1fr 320px`, 24px gap:
  - **Left — sessions table.** Header row with section-label "All sessions" + search input (260px wide, with search icon inside on the left) + segmented filter "all/active/pending/ended". Then a single card containing rows. Each row is a 6-column grid: title + mono subtype, status pill, candidate (avatar+name), mono "started" line, score-or-caught-info, mono session code. Hover bg `--bg-2`. Click navigates to `/interviewer/session/[id]` (if active) or its summary (if ended). See prototype for exact session data (5 sessions: active/pending/3 ended).
  - **Right — side column:**
    - "⚡ Quick start" card: 3 buttons listing Algorithm / Debugging (recommended pill) / System design with mono subtypes.
    - "🕐 Recent activity" card: 5 activity rows — colored dot, "{who} {what} {target}", mono ago.

---

### 3.4 Create session wizard (`/interviewer/new`)

Top bar with wordmark + section-label "interviewer · new session" + a ghost "← Dashboard" link.

Main column max-width 960px, padding 32px.

Header: section-label "New session" + dynamic `h1` ("The basics" / "Pick a format" / "Write the problem" / "Tune the **AI**" with italic+live on "AI"), right side a ghost "× Discard" returning to dashboard.

**Stepper:** 4 numbered chips connected by lines, current = filled live circle with 4px live-dim ring, completed = check icon on live bg.

Body card (28px padding, hairline border, 10px radius):
- **Step 1 — Basics:** Title input (default "Search infra — onsite #2"), Language select (python default).
- **Step 2 — Pick a format:** intro paragraph, 2-col grid of 8 type cards. Selected: live border + 8%-opacity live bg. Each card has title, optional `★ signature` warn pill (Debugging), description, mono "guardrail · halluc % · token count" footer. Picking a type pre-fills preset/pct/budget for step 4.
- **Step 3 — Problem:** Problem-statement textarea (default Kth-largest brief), Starting-code textarea (mono, default heapq solution with the bug), and a "Test cases" sub-card showing "3 tests · 1 hidden · 2 visible to candidate" + "+ Add test" small button.
- **Step 4 — AI behavior:**
  - Intro line: "Pre-filled from `{type}`. Override anything below."
  - Guardrail preset select with 5 options.
  - Hallucination probability range (with `{pct}%` warn pill in the label) + scale legend "0% — pristine · 50% · 100% — chaos".
  - Token budget mono input.
  - Checkbox "Enable real-time push-back suggestions (extra LLM cost)".

Footer of card: Back / Next, switching to "Create session ✓" on last step.

**On create:** show a centered success card — circle-check, display "Session created.", paragraph, an emerald-bordered mono share-URL card with copy button (`acuity.app/join/7I1Q5K5Y`), and two buttons "Back to dashboard" / primary "Open live view ↗".

---

### 3.5 Live session — interviewer (`/interviewer/session/[id]`)

THIS IS THE SIGNATURE SCREEN. It's a full-bleed 3-panel app layout, fixed/no-scroll.

Top bar (12×24 padding, --bg-0): Back ghost + divider + wordmark + divider + live-pulse pill `live · 04:32` + session title "Search infra — onsite #2" + mono code; right side: small users count button, "Invite link" button, settings cog, **danger "End interview"** button.

Body grid: `1fr 1.6fr 380px` columns, flex-1.

#### LEFT — problem + telemetry sidebar
- **Candidate strip:** "Candidate" label + avatar 36 + name + mono "sithu@ucsd.edu · joined 4m 32s ago" + live-pulse "typing" pill.
- **Problem block:** "Problem" label + `h3` display 22px "K-th largest element" + 3 pills (Debugging / signal python / warn "halluc 30%") + the problem paragraph with mono live `k` highlighted + collapsible `<details>` "Hidden test cases (3)" showing 3 mono lines.
- **Telemetry block** (the dense info-dense column):
  - "Telemetry" label with right-aligned "last 4m" small mono.
  - Token budget row: icon+label, mono "1,242 / 6,000", `<Progress>` below.
  - Code changes: icon+label, mono signal "+47 −12" right, full `<HeatStrip color="--signal">`.
  - AI exchanges: icon+label, mono "3 turns", live heat-strip.
  - Paste events: icon+label, mono warn "2 flagged", warn heat-strip.
  - **Hallucinations card** (--bg-2): section label, display 30px warn "1 / 2" + "caught by candidate", small "Latest: 14:22:50 — pushed back on O(n) claim".
  - **Push-back suggestion card** (signal-tinted): sparkle icon + signal section-label "Suggested push-back", body paragraph with mono signal code span, "→ Suggest to candidate" full-width button.

#### CENTER — code mirror + run output
- Header: "Editor mirror" label + mono "solution.py · python 3.11 · saved" (toggles to "saving…" every 1.2s); right side ghost buttons "Watch cursor", "Replay".
- Body: a `<CodeBlock>` with the K-th largest code (lines 16–33 of prototype). Highlight line 11 with `if len(heap) < k:` and label "candidate cursor" (signal). Auto-toggle active line between 11 and 12 every ~1.2s.
- Bottom terminal pane (max 200px height): "Terminal · last run" + live "2/3 passed" pill + mono "14:20:17 · wandbox". Contents:
  ```
  $ python solution.py
  ✓ test_basic ([3,2,1,5,6,4], k=2) → 5         (--live)
  ✓ test_single ([1], k=1) → 1                  (--live)
  ✗ test_duplicates ([7,7,7,7,7], k=3) → IndexError   (--bad)
    IndexError: list index out of range          (--fg-3)
    at solution.py:14 in find_kth_largest        (--fg-3)
  ```

#### RIGHT — AI chat (interviewer view)
- Header: section-label "AI chat (mirror)", mono "claude-haiku-4-5" + warn "halluc 30%" pill; right-side ghost toggle "Reveal/Mask" controlling whether hallucination styling shows.
- 6 chat messages (see prototype `live-session.jsx` lines 35–73). User bubbles use avatar. AI bubbles use the aperture icon (color = warn when hallucinated AND `showHallu`, otherwise live). Hallucinated AI bubble gets amber border + amber-tint bg. Message-3 has two corrupted spans: `O(n)` (orig `O(log n)`) and `the full array` (orig `log n levels`); both render as `.hallu` with hover popovers when `showHallu`.
- Footer strip: "Read-only mirror — candidate doesn't see corruption flags" + mono "6 turns · 294 tokens".

---

### 3.6 Candidate IDE (`/candidate/session/[id]` or `/join/[code]`)

The candidate's mirror of the live screen — but **stripped of all interviewer telemetry and corruption flags.**

Top bar (10×20): wordmark + divider + title block ("K-th largest element" + mono "python · debugging · session 7I1Q5K5Y") on left. Right side: clock icon + mono running timer (counts up from 04:32), divider, avatar+name, "Leave" button.

Body grid `320px 1fr 380px`:

#### LEFT — problem statement
- Section-label "Problem statement"
- `h1` display 28px "K-th largest element"
- Pills: Debugging / signal python
- Body: paragraph "Given an unsorted array…", paragraph about the provided buggy solution, mono "Constraints:" block.
- Sub-section "Examples" with a mono I/O snippet in a `--bg-1` card.

#### CENTER — editor + terminal
- Tab strip on `--bg-1`: a "tab" looking like a chrome tab — small file with live-dot indicator: `solution.py ●`. Right side: ghost "Format" + primary "Run ⌘↵".
- Editor body: same `<CodeBlock>` as the live session (line-11 highlighted live emerald).
- Terminal area (max 240px): tab strip with **Output** | **Tests · 2/3** (active tab has bottom 2px live border). Right-aligned mono "last run 14:20:17". Body switches:
  - Output:
    ```
    $ python solution.py
    5
    —
    process exited with code 0 · 124ms
    ```
  - Tests: same 3 lines as live-session terminal.

#### RIGHT — AI assistant chat (candidate view, no corruption flagging)
- Header card: aperture icon + display 18px "AI assistant" + "hints only" pill; below it a token budget row + `<Progress>`.
- Chat: 6 messages, plain text (NO hallu spans, NO popovers — the candidate just sees the corrupted output as if it's the truth). User uses avatar, AI uses aperture-icon avatar.
- Composer: textarea inside a bordered card + small code/clear icon buttons + primary "Send ↵" (disabled until input is non-empty).
- Tiny disclaimer: "AI may produce incorrect output — verify before relying on it."

---

### 3.7 Session summary (`/interviewer/session/[id]/summary`)

Top header: Dashboard back button + divider + wordmark; right: "Share read-only link" + "Export PDF" secondary buttons.

Main max-width 1280, padding 40×32×80×32.

#### Title row
- Left: section-label "Session summary" + `h1` 52px display "Binary search — **buggy**" (italic+live on "buggy") + sub row: avatar + "Alex Chen", "Debugging · python", mono "Mon, May 25 · 52m 14s", "ended" muted pill.
- Right: section-label "Overall" + giant display tabular `7.6` (76px, live emerald) + mono `/10` + live "Strong hire" pill below.

#### Profile + dimensions (2-col, 1fr 1.5fr)
- **Profile card** — header `<Aperture/> Profile`. Body: an SVG radar chart, 4 axes (Prompt quality / Caught AI errors / Code correctness / Approach & independence) with rings at 25/50/75/100%. Filled emerald polygon at the four scores 8.2/7.5/6.0/8.8. Center text big "7.6".
- **Dimensions card** — header sparkle "Dimensions". 4 stacked rows: dim name / big number (color depends: ≥8 live, ≥6 fg-0, else warn) / `<Progress>` colored / mono justification text below.

Scores (verbatim):
| Dim | Value | Note |
|---|---|---|
| Prompt quality | 8.2 | 5 targeted prompts; built context iteratively. |
| Caught AI errors | 7.5 | Spotted 3 of 4 corrupted spans; missed one on big-O. |
| Code correctness | 6.0 | Fixed primary bug; missed edge case (k > heap size). |
| Approach & independence | 8.8 | Started without AI; only used for verification. |

#### AI summary card
- Header: aperture icon + "AI summary" + right-side mono "claude-sonnet-4-6 · 1.2K tokens".
- Body paragraph (verbatim from prototype, with `O(n²)` mono-warn span and the "Recommended for on-site." emphasized in `--fg-0`).
- Tag row: live "Independent debugger" / warn "Caught 3/4 hallucinations" / signal "Clean prompt habits".

#### Replay timeline card (full-width below)
- Header: clock + "Session replay · 52m 14s" + right "Play from start" ghost button.
- The `ReplayTimeline`: 14 colored dots along a 52-minute axis, alternating above/below labels (see prototype lines 230–280 for exact event list). Axis labels: 00:00, 13:00, 26:00, 39:00, 52:14. Legend row below.

#### Bottom 2-col
- **Final solution card** — `<CodeBlock>` with the cleaned-up `find_kth_largest` (uses `heapify` + `heapreplace`). Below code: "3/3 tests passed · 47 edits · 0 pastes from chat".
- **Key turns card** — title "Key turns (4 of 18)". 4 mock chat turn cards (mono time gutter + colored who-line + content). Two are clean, one is `warn`/corrupted, one is `caught` ✓. Bottom: ghost button "View full transcript (18 turns) →".

---

### 3.8 Candidate home (`/candidate`)

- Top header: wordmark + right side avatar + name + logout icon.
- Main max 880 px, padding 60×32:
  - Section-label "Your interviews" + `h1` 48px display "Three sessions, **all wrapped up**." (italic+live on "all wrapped up").
  - Lead paragraph (verbatim): "A log of every interview you've participated in. To enter an active session, use the invite link your interviewer shared with you — it's a URL like `acuity.app/join/XXXXXXXX`."
  - **Join card** (signal-tinted): "⚡ Have an invite? Paste the join code below to enter your session." + a side-by-side mono input (placeholder `e.g. 7I1Q5K5Y`) and primary "Join" button.
  - Section-label "History" + a card with 3 ended-session rows (icon square, type+date, "ended" muted pill, mono id `#0001` style).

---

## 4. Interaction details that matter

These are the small things that make the prototype feel alive — implement them.

1. **Hero hallucination demo** — driven by the probability slider. Map 0/30/75/100 → 0/2/3/4 corrupted spans (`Math.ceil((pct/100) * 4)`, but treat pct=0 as 0 exactly). Each span renders with the `.hallu` class and a hover popover.
2. **Hero hints** — `hasDragged` and `hasHovered` local state. Both auto-dismiss with `display: none` (or unmount) on first interaction with their respective control.
3. **How-it-works steps** — clicking a step swaps the right-side preview pane. Animate the active card with `box-shadow: 0 0 0 3px color-mix(in oklch, {accent} 12%, transparent)` and a colored border.
4. **Sessions filter** — purely client-side: `filter` state + `q` search string. `sessions.filter(s => (filter==='all' || s.status===filter) && match(q))`.
5. **Live session ticker** — `setInterval(1200ms)` toggles `saved` ↔ `saving…` and bounces the candidate cursor line between 11 and 12.
6. **Reveal/Mask** in live-session AI chat — when off: no amber styling, no popovers, AI avatar reverts to live emerald (i.e., the interviewer is choosing to "see what the candidate sees").
7. **Hallu popover** — must not get clipped. If a span is near the right edge of its container, prefer transform-origin from the center but the popover stays absolutely-positioned. Don't worry about flipping it — just keep its z-index above siblings.
8. **Form success state** — local `submitted` boolean replaces the form with the success card. "Send another" resets state and form values.
9. **Stepper** — clicking a completed step number should NOT navigate (it's read-only); only Back/Next buttons move between steps.
10. **Tweaks panel** — In the prototype it lets the user change accent hue (emerald/violet/cyan/amber) and density (comfortable/compact). **You can omit this in production.** If you keep it as a dev-only knob, gate it behind `process.env.NODE_ENV === 'development'`.

---

## 5. Mock data — copy into a `lib/mocks.ts`

```ts
export const SESSIONS = [
  { id: "a1f3", title: "Search infra — onsite #2", type: "Debugging",       lang: "python",     code: "7I1Q5K5Y", status: "active",  candidate: "Sithu Soe",   started: "2 min ago",        tokens: 1242,  budget: 6000,  halluc: 30, caught: "1/2", paste: 0 },
  { id: "b2e4", title: "Stripe payment flow",       type: "API integration", lang: "typescript", code: "CG05IT9J", status: "pending", candidate: "—",           started: "scheduled 4:00 PM", tokens: 0,     budget: 12000, halluc: 0,  caught: "—",   paste: 0 },
  { id: "c5d8", title: "Aggregate orders query",    type: "SQL / data query", lang: "sql",       code: "0P1WZ2UE", status: "ended",   candidate: "Phyo Thant",  started: "yesterday · 47m",   tokens: 2840,  budget: 3000,  halluc: 0,  caught: "0/0", paste: 2, score: 7.4 },
  { id: "d9k1", title: "Binary search — buggy",     type: "Debugging",       lang: "python",     code: "K3M2P7TQ", status: "ended",   candidate: "Alex Chen",   started: "Mon · 52m",         tokens: 5612,  budget: 6000,  halluc: 30, caught: "3/4", paste: 0, score: 8.6 },
  { id: "e3h7", title: "Rate limiter design",       type: "System design",   lang: "—",          code: "TR8XLM4F", status: "ended",   candidate: "Maria López", started: "Mon · 1h 12m",      tokens: 18420, budget: 20000, halluc: 0,  caught: "—",   paste: 1, score: 6.8 },
];

export const STATS = {
  sessionsThisWeek:    { value: "14",    sub: "+3 vs last week",        spark: [3,5,4,7,6,9,8,11,10,12,14] },
  avgCaught:           { value: "62%",   sub: "across 8 debugging runs", spark: [40,55,60,52,68,72,65,62] },
  medianScore:         { value: "7.4",   sub: "of 10",                   spark: [6.8,7.0,6.5,7.4,7.6,7.2,7.4] },
  tokensSpent:         { value: "84.2K", sub: "$0.32 est.",              spark: [8,12,10,18,22,28,32,42,48,56,64,72,84] },
};

export const ACTIVITY = [
  { who: "Sithu Soe",   what: "joined",    target: "Search infra — onsite #2", when: "2m",  color: "live"   },
  { who: "Phyo Thant",  what: "scheduled", target: "Stripe payment flow",      when: "32m", color: "signal" },
  { who: "Alex Chen",   what: "completed", target: "Binary search — buggy",    when: "Mon", color: "fg-2"   },
  { who: "AI",          what: "flagged",   target: "3 hallucinations rewritten", when: "Mon", color: "warn" },
  { who: "Maria López", what: "submitted", target: "Rate limiter design",      when: "Mon", color: "fg-2"   },
];

export const KTH_LARGEST_CODE = `def find_kth_largest(nums, k):
    """Return the k-th largest element in nums."""
    import heapq

    # Build a min-heap of size k
    heap = []
    for n in nums:
        if len(heap) < k:
            heapq.heappush(heap, n)
        elif n > heap[0]:
            heapq.heappop(heap)
            heapq.heappush(heap, n)

    return heap[0]


# test
print(find_kth_largest([3, 2, 1, 5, 6, 4], 2))`;
```

---

## 6. Build order (recommended)

Knock this out in roughly this sequence — each step is a clean commit boundary:

1. **Design tokens & base CSS** (`app/globals.css`, `tailwind.config.ts`). Make sure `--bg-0` shows up as the body bg with the radial+grid atmosphere.
2. **Load fonts** via `next/font/google` in `app/layout.tsx`.
3. **Build `components/ui/`**: Aperture, Wordmark, Pill, Sparkline, SectionLabel, Card, Stat, Avatar, Icon, CodeBlock, HeatStrip, Progress. Match the prototype exactly. Build a Storybook/scratch page if it helps.
4. **Landing page** — the hero is the most labor-intensive piece (segmented message + slider + hints). Get the hero working first, then How-it-works (and its three preview panels), then the Features bento, then Contact, then footer.
5. **Auth pages** — Login + Signup share `AuthLayout`.
6. **Interviewer dashboard** — sidebar + stats row + live-callout + sessions table + side column.
7. **Create wizard** — 4-step state machine + success card.
8. **Live session screen** — the signature page. Build LEFT panel last; CENTER (the `CodeBlock`) and RIGHT (chat with `.hallu` spans) first.
9. **Candidate IDE** — copy-paste from live session and *remove* the corruption styling.
10. **Summary** — the radar SVG is custom; copy the math from the prototype.
11. **Candidate home** — small, last.

---

## 7. Reference: prototype JSX (source of truth)

The complete React/JSX prototype lives at:
- `project/Acuity.html` — entry
- `project/styles.css` — all CSS (already inlined above in §1)
- `project/ui.jsx` — shared components
- `project/screens/landing.jsx` — hero
- `project/screens/landing-sections.jsx` — How-it-works, Features, Contact
- `project/screens/auth.jsx` — login, signup, candidate-home, create-wizard
- `project/screens/interviewer-home.jsx` — dashboard
- `project/screens/live-session.jsx` — live signature view
- `project/screens/candidate-ide.jsx` — candidate IDE
- `project/screens/summary.jsx` — scorecard

**Open each one and copy the JSX structure, inline styles, copy strings, and pixel values exactly.** Translate React-with-inline-styles into your preferred Tailwind+component style, but **don't make creative substitutions** — colors, font sizes, padding, gaps, and copy were all chosen deliberately.

If a value isn't called out in this roadmap, fall back to the prototype as the canonical source. When the prototype and this roadmap disagree, the prototype wins.

---

## 8. Things you can skip (or defer to v2)

- The bottom floating "screen switcher" pill — that's a prototyping aid, drop it.
- The Tweaks settings panel — also a prototyping aid.
- The "Name lab" page (`project/Name lab.html`) — that's exploratory naming, not part of the product.
- Loading real Monaco — use the `<CodeBlock>` faux-Monaco for now; swap in real Monaco later in the live + candidate-IDE screens.
- The 1.2-second cursor bounce — nice-to-have, not critical.

Everything else: build it.
