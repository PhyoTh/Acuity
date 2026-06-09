"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import ReplayTimeline from "@/components/Dashboard/ReplayTimeline";
import { Aperture, Avatar, Icon, Pill, Progress, SectionLabel, Wordmark } from "@/components/ui";
import type { EventRow, RunResult, Scorecard } from "@/lib/types";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

const DIM_LABELS: Record<string, string> = {
  prompt_quality:       "Prompt quality",
  caught_ai_errors:     "Caught AI errors",
  code_correctness:     "Code correctness",
  approach_independence:"Approach & independence",
};

// Canonical axis order for the radar chart. Keeps the polygon stable even if the LLM
// returns the dimensions in a different order between sessions.
const DIM_ORDER: readonly (keyof typeof DIM_LABELS)[] = [
  "prompt_quality",
  "caught_ai_errors",
  "code_correctness",
  "approach_independence",
];

// Post-mortem summary the interviewer sees after `End interview` (or when clicking a past
// session from `/dashboard`). Scorecard-first, with a radar profile, dimension bars, AI
// summary, replay scrubber, and the final code + key turns. Read-only by definition.
export default function SummaryView({
  title,
  createdAt,
  endedAt,
  prompt,
  code,
  language,
  transcripts,
  lastRun,
  scorecard,
  scorecardLoading,
  events = [],
}: {
  title: string;
  createdAt: string;
  endedAt: string | null;
  prompt: string;
  code: string;
  language: string;
  transcripts: ChatMessage[];
  lastRun: RunResult | { passed: number; total: number } | null;
  scorecard: Scorecard | null;
  scorecardLoading: boolean;
  events?: EventRow[];
}) {
  const startedDate = createdAt ? new Date(createdAt) : null;
  const endedDate = endedAt ? new Date(endedAt) : null;
  const duration = startedDate && endedDate
    ? formatDuration(endedDate.getTime() - startedDate.getTime())
    : null;
  const overall = scorecard?.overall ?? null;

  // The headline pill for the overall score. Roadmap: ≥7.5 = "Strong hire", ≥6 = "Lean hire",
  // else "Pass". Mirrors how a recruiter would summarize.
  let verdictKind: "live" | "signal" | "muted" = "muted";
  let verdictLabel = "—";
  if (overall != null) {
    if (overall >= 7.5) { verdictKind = "live"; verdictLabel = "Strong hire"; }
    else if (overall >= 6) { verdictKind = "signal"; verdictLabel = "Lean hire"; }
    else { verdictKind = "muted"; verdictLabel = "Pass"; }
  }

  // Heuristic chips derived from scorecard.scores (no separate backend field for them yet).
  // Per-dimension justifications + structured tags are visual-only.
  const hallucinationTotal = transcripts.filter(
    (t) => t.role === "assistant" && t.was_hallucinated,
  ).length;
  const chips: { kind: "live" | "warn" | "signal"; label: string }[] = [];
  if (scorecard) {
    const s = scorecard.scores;
    if ((s.approach_independence ?? 0) >= 8) chips.push({ kind: "live", label: "Independent debugger" });
    if (hallucinationTotal > 0 && (s.caught_ai_errors ?? 0) >= 6) {
      const caught = Math.min(
        hallucinationTotal,
        Math.round(((s.caught_ai_errors ?? 0) / 10) * hallucinationTotal),
      );
      chips.push({ kind: "warn", label: `Caught ${caught}/${hallucinationTotal} hallucinations` });
    }
    if ((s.prompt_quality ?? 0) >= 8) chips.push({ kind: "signal", label: "Clean prompt habits" });
  }

  // Pick the "key turns" — first user prompt, first hallucinated AI turn, etc. Best-effort
  // surface: if transcripts is empty we just hide the section.
  const keyTurns = pickKeyTurns(transcripts);

  return (
    <main style={{ background: "var(--bg-0)", minHeight: "100vh" }}>
      {/* Top header */}
      <header
        className="flex items-center justify-between"
        style={{ padding: "16px 32px", borderBottom: "1px solid var(--line-1)" }}
      >
        <div className="flex items-center gap-4">
          <Link href="/dashboard" className="btn btn-ghost btn-sm">
            <Icon name="chevron-left" size={14} /> Dashboard
          </Link>
          <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
          <Wordmark size={14} />
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-sm"
            title="Share a read-only summary link (not yet wired)"
            aria-disabled
          >
            <Icon name="share" size={12} /> Share read-only link
          </button>
          <button
            className="btn btn-sm"
            title="Export a PDF (not yet wired)"
            aria-disabled
          >
            <Icon name="copy" size={12} /> Export PDF
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "40px 32px 80px" }}>
        {/* Title row */}
        <div className="grid items-start gap-6" style={{ gridTemplateColumns: "1fr auto" }}>
          <div>
            <SectionLabel>Session summary</SectionLabel>
            <h1
              className="display mt-2"
              style={{ fontSize: 52, lineHeight: 1.04, letterSpacing: "-0.02em", color: "var(--fg-0)" }}
            >
              {title || "Untitled interview"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-3" style={{ fontSize: 13, color: "var(--fg-2)" }}>
              <span className="flex items-center gap-2">
                <Avatar name="candidate" size={20} /> candidate
              </span>
              {language && <Pill kind="signal">{language}</Pill>}
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
                {startedDate ? startedDate.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) : "—"}
                {duration ? ` · ${duration}` : ""}
              </span>
              <Pill kind="muted">ended</Pill>
            </div>
          </div>
          <div className="text-right">
            <SectionLabel>Overall</SectionLabel>
            <div className="mt-2 flex items-end gap-2 justify-end">
              <span
                className="display tabular"
                style={{
                  fontSize: 76,
                  lineHeight: 0.9,
                  color: overall != null ? "var(--live)" : "var(--fg-3)",
                }}
              >
                {overall != null ? overall.toFixed(1) : "—"}
              </span>
              <span className="mono" style={{ color: "var(--fg-2)", fontSize: 14, marginBottom: 10 }}>
                /10
              </span>
            </div>
            {overall != null && (
              <div className="mt-2 flex justify-end">
                <Pill kind={verdictKind}>{verdictLabel}</Pill>
              </div>
            )}
          </div>
        </div>

        {/* Profile + Dimensions */}
        <div className="mt-10 grid gap-5" style={{ gridTemplateColumns: "1fr 1.5fr" }}>
          {/* Profile card */}
          <Section
            title={
              <span className="flex items-center gap-2">
                <Aperture size={14} color="var(--live)" /> Profile
              </span>
            }
          >
            {scorecard ? (
              <RadarChart scores={scorecard.scores} overall={overall} />
            ) : (
              <PlaceholderBlock loading={scorecardLoading} />
            )}
          </Section>

          {/* Dimensions card */}
          <Section
            title={
              <span className="flex items-center gap-2">
                <Icon name="sparkle" size={14} color="var(--warn)" /> Dimensions
              </span>
            }
          >
            {scorecard ? (
              <div className="flex flex-col gap-5">
                {DIM_ORDER.map((key) => {
                  const value = scorecard.scores[key] ?? 0;
                  const color = value >= 8 ? "var(--live)" : value >= 6 ? "var(--fg-0)" : "var(--warn)";
                  return (
                    <div key={key}>
                      <div className="flex items-baseline justify-between">
                        <span style={{ color: "var(--fg-1)", fontSize: 13.5 }}>
                          {DIM_LABELS[key] ?? key}
                        </span>
                        <span className="display tabular" style={{ fontSize: 26, color }}>
                          {value.toFixed(1)}
                        </span>
                      </div>
                      <Progress value={value} max={10} color={color} />
                    </div>
                  );
                })}
              </div>
            ) : (
              <PlaceholderBlock loading={scorecardLoading} />
            )}
          </Section>
        </div>

        {/* AI summary */}
        <div className="mt-5">
          <Section
            title={
              <span className="flex items-center gap-2">
                <Aperture size={14} color="var(--live)" /> AI summary
              </span>
            }
            right={
              scorecard && (
                <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
                  claude · scorecard generator
                </span>
              )
            }
          >
            {scorecard ? (
              <>
                <p style={{ color: "var(--fg-1)", fontSize: 14, lineHeight: 1.6 }}>
                  {scorecard.summary || (
                    <span style={{ color: "var(--fg-3)" }}>
                      (no summary text)
                    </span>
                  )}
                </p>
                {chips.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    {chips.map((c) => (
                      <Pill key={c.label} kind={c.kind}>{c.label}</Pill>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <PlaceholderBlock loading={scorecardLoading} />
            )}
          </Section>
        </div>

        {/* Replay timeline */}
        {events.length > 0 && (
          <div className="mt-5">
            <Section
              title={
                <span className="flex items-center gap-2">
                  <Icon name="clock" size={14} color="var(--signal)" /> Session replay
                </span>
              }
              right={
                duration && (
                  <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>{duration}</span>
                )
              }
            >
              <ReplayTimeline events={events} />
            </Section>
          </div>
        )}

        {/* Bottom 2-col: final code + key turns */}
        <div className="mt-5 grid gap-5" style={{ gridTemplateColumns: "1fr 1fr" }}>
          <Section
            title={
              <span className="flex items-center gap-2">
                <Icon name="code" size={14} color="var(--live)" /> Final solution
              </span>
            }
            right={
              lastRun && "total" in lastRun && lastRun.total > 0 ? (
                <Pill kind={lastRun.passed === lastRun.total ? "live" : "warn"}>
                  {lastRun.passed}/{lastRun.total} tests
                </Pill>
              ) : null
            }
            padding={0}
          >
            <div style={{ height: 320 }}>
              <CodeEditor value={code} language={language} readOnly />
            </div>
            <div
              className="mono"
              style={{
                padding: "8px 14px",
                borderTop: "1px solid var(--line-1)",
                color: "var(--fg-3)",
                fontSize: 11,
                letterSpacing: "0.04em",
              }}
            >
              {prompt ? "candidate's final code" : "(no problem statement)"}
            </div>
          </Section>

          <Section
            title={
              <span className="flex items-center gap-2">
                <Icon name="user" size={14} color="var(--fg-1)" /> Key turns ({keyTurns.length} of {transcripts.length})
              </span>
            }
            padding={0}
          >
            <div style={{ maxHeight: 320, overflowY: "auto" }}>
              {keyTurns.length === 0 ? (
                <div style={{ padding: 16, color: "var(--fg-3)", fontSize: 13 }}>
                  No chat turns recorded.
                </div>
              ) : (
                <ul>
                  {keyTurns.map((t, i) => (
                    <li
                      key={i}
                      className="grid gap-3"
                      style={{
                        gridTemplateColumns: "56px 1fr",
                        padding: "12px 14px",
                        borderBottom: i < keyTurns.length - 1 ? "1px solid var(--line-1)" : "none",
                        fontSize: 12.5,
                      }}
                    >
                      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5, letterSpacing: "0.04em" }}>
                        {t.role}
                      </span>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span
                            className="mono"
                            style={{
                              color: t.role === "assistant"
                                ? t.was_hallucinated
                                  ? "var(--warn)"
                                  : "var(--live)"
                                : "var(--signal)",
                              fontSize: 10,
                              textTransform: "uppercase",
                              letterSpacing: "0.06em",
                            }}
                          >
                            {t.role === "assistant" ? (t.was_hallucinated ? "ai · corrupted" : "ai") : "candidate"}
                          </span>
                        </div>
                        {t.role === "assistant" ? (
                          <div
                            className="markdown-body"
                            style={{ color: "var(--fg-1)", lineHeight: 1.5 }}
                          >
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {truncate(t.content, 600)}
                            </ReactMarkdown>
                          </div>
                        ) : (
                          <div
                            className="whitespace-pre-wrap"
                            style={{ color: "var(--fg-1)", lineHeight: 1.5 }}
                          >
                            {truncate(t.content, 220)}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div
              className="flex items-center justify-between mono"
              style={{ padding: "8px 14px", borderTop: "1px solid var(--line-1)", color: "var(--fg-3)", fontSize: 11 }}
            >
              <span>{transcripts.length} turn{transcripts.length === 1 ? "" : "s"} total</span>
            </div>
          </Section>
        </div>

        {/* Full chat (collapsed by default) */}
        <details
          className="mt-5"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--line-1)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          <summary
            style={{
              cursor: "pointer",
              listStyle: "none",
              padding: "12px 16px",
              background: "var(--bg-2)",
              borderBottom: "1px solid var(--line-1)",
            }}
          >
            <span className="section-label">Full transcript ({transcripts.length} turn{transcripts.length === 1 ? "" : "s"})</span>
          </summary>
          <div style={{ minHeight: 200, height: 420 }}>
            <ChatBox messages={transcripts} readOnly />
          </div>
        </details>
      </div>
    </main>
  );
}

/* -------------------- helpers -------------------- */

function Section({
  title,
  right,
  children,
  padding = 18,
}: {
  title: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  padding?: number;
}) {
  return (
    <section
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "10px 16px", background: "var(--bg-2)", borderBottom: "1px solid var(--line-1)" }}
      >
        <span className="section-label">{title}</span>
        {right}
      </div>
      <div style={{ padding }}>{children}</div>
    </section>
  );
}

function PlaceholderBlock({ loading }: { loading: boolean }) {
  return (
    <div className="flex items-center gap-3" style={{ padding: 8 }}>
      <span
        className="live-pulse-dot"
        style={{ background: loading ? "var(--live)" : "var(--fg-3)" }}
      />
      <div>
        <div style={{ color: "var(--fg-0)", fontSize: 13, fontWeight: 600 }}>
          {loading ? "Generating scorecard…" : "Waiting for the scorecard…"}
        </div>
        <div style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 2 }}>
          Claude is analyzing the transcript and code. This usually takes a few seconds.
        </div>
      </div>
    </div>
  );
}

function RadarChart({
  scores,
  overall,
}: {
  scores: Record<string, number>;
  overall: number | null;
}) {
  const size = 260;
  const center = size / 2;
  const radius = size / 2 - 28;
  const axes = DIM_ORDER;

  // Polygon points: each axis maps to (value/10) * radius, angled around the circle.
  const angleFor = (i: number) => (i / axes.length) * Math.PI * 2 - Math.PI / 2;
  const pointFor = (i: number, magnitude: number) => {
    const a = angleFor(i);
    const r = radius * magnitude;
    return [center + Math.cos(a) * r, center + Math.sin(a) * r] as const;
  };
  const polygonPath = axes
    .map((k, i) => {
      const v = (scores[k] ?? 0) / 10;
      const [x, y] = pointFor(i, v);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ") + " Z";

  return (
    <div className="flex flex-col items-center" style={{ padding: 12 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        {/* Concentric rings at 25/50/75/100% */}
        {[0.25, 0.5, 0.75, 1].map((m) => (
          <polygon
            key={m}
            points={axes
              .map((_, i) => {
                const [x, y] = pointFor(i, m);
                return `${x.toFixed(2)},${y.toFixed(2)}`;
              })
              .join(" ")}
            fill="none"
            stroke="var(--line-1)"
            strokeWidth={1}
          />
        ))}
        {/* Axis lines */}
        {axes.map((_, i) => {
          const [x, y] = pointFor(i, 1);
          return (
            <line
              key={i}
              x1={center}
              y1={center}
              x2={x}
              y2={y}
              stroke="var(--line-1)"
              strokeWidth={1}
            />
          );
        })}
        {/* Score polygon */}
        <path
          d={polygonPath}
          fill="oklch(0.74 0.16 155 / 0.25)"
          stroke="var(--live)"
          strokeWidth={1.5}
        />
        {/* Vertex dots */}
        {axes.map((k, i) => {
          const v = (scores[k] ?? 0) / 10;
          const [x, y] = pointFor(i, v);
          return <circle key={k} cx={x} cy={y} r={3} fill="var(--live)" />;
        })}
        {/* Center overall */}
        {overall != null && (
          <text
            x={center}
            y={center + 6}
            textAnchor="middle"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 28,
              fill: "var(--fg-0)",
            }}
          >
            {overall.toFixed(1)}
          </text>
        )}
        {/* Axis labels */}
        {axes.map((k, i) => {
          const [x, y] = pointFor(i, 1.18);
          return (
            <text
              key={k}
              x={x}
              y={y}
              textAnchor="middle"
              dominantBaseline="middle"
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9,
                fill: "var(--fg-3)",
                letterSpacing: "0.04em",
                textTransform: "uppercase",
              }}
            >
              {(DIM_LABELS[k] ?? k).split(" ")[0]}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function pickKeyTurns(transcripts: ChatMessage[]): ChatMessage[] {
  if (transcripts.length === 0) return [];
  const max = 4;
  const selected: ChatMessage[] = [];
  // First user prompt
  const firstUser = transcripts.find((t) => t.role === "user");
  if (firstUser) selected.push(firstUser);
  // First hallucinated AI response
  const firstHallu = transcripts.find((t) => t.role === "assistant" && t.was_hallucinated);
  if (firstHallu && !selected.includes(firstHallu)) selected.push(firstHallu);
  // Last user turn
  const lastUser = [...transcripts].reverse().find((t) => t.role === "user");
  if (lastUser && !selected.includes(lastUser)) selected.push(lastUser);
  // Last AI turn
  const lastAi = [...transcripts].reverse().find((t) => t.role === "assistant");
  if (lastAi && !selected.includes(lastAi)) selected.push(lastAi);
  return selected.slice(0, max);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + "…";
}

function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}
