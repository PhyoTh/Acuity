"use client";
import { useState } from "react";
import { Aperture, Avatar, CodeBlock, HeatStrip, Icon, Pill, Progress, SectionLabel } from "@/components/ui";

type Step = {
  key: "trap" | "watch" | "grade";
  number: string;
  title: string;
  body: string;
  icon: "settings" | "eye" | "sparkle";
  accent: string;
};

const STEPS: readonly Step[] = [
  {
    key: "trap",
    number: "01",
    title: "Set the trap",
    body: "Pick an interview format, write the problem, and choose how often the AI should subtly lie. Every preset comes with a sensible token budget and guardrail.",
    icon: "settings",
    accent: "var(--signal)",
  },
  {
    key: "watch",
    number: "02",
    title: "Watch in silence",
    body: "Candidate codes in a real IDE with Claude beside them. You see their keystrokes, prompts, and pastes — plus a hidden flag on every reply we corrupted.",
    icon: "eye",
    accent: "var(--live)",
  },
  {
    key: "grade",
    number: "03",
    title: "Grade the judgement",
    body: "Acuity writes a four-dimension scorecard graded by Claude: prompt quality, errors caught, code correctness, and how independently they worked.",
    icon: "sparkle",
    accent: "var(--warn)",
  },
];

export function HowItWorks() {
  const [active, setActive] = useState<Step["key"]>("watch");
  const current = STEPS.find((s) => s.key === active) ?? STEPS[1];
  return (
    <section id="how-it-works" style={{ maxWidth: 1320, margin: "0 auto", padding: "100px 48px 0" }}>
      <SectionLabel>How it works</SectionLabel>
      <h2
        className="display mt-2"
        style={{ fontSize: 56, lineHeight: 1.04, letterSpacing: "-0.02em", maxWidth: 720 }}
      >
        Three surfaces, <span className="display-italic" style={{ color: "var(--live)" }}>one truth.</span>
      </h2>

      <div className="mt-12 grid gap-8" style={{ gridTemplateColumns: "0.85fr 1.15fr" }}>
        {/* Step cards */}
        <div className="flex flex-col gap-4">
          {STEPS.map((s) => {
            const isActive = s.key === active;
            return (
              <button
                key={s.key}
                onClick={() => setActive(s.key)}
                style={{
                  textAlign: "left",
                  padding: 22,
                  background: "var(--bg-1)",
                  border: `1px solid ${isActive ? s.accent : "var(--line-1)"}`,
                  borderRadius: "var(--radius-lg)",
                  boxShadow: isActive
                    ? `0 0 0 3px color-mix(in oklch, ${s.accent} 12%, transparent)`
                    : "none",
                  cursor: "pointer",
                  transition: "all 0.18s ease",
                }}
              >
                <div className="flex items-center gap-3">
                  <span
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      background: `color-mix(in oklch, ${s.accent} 14%, transparent)`,
                      border: `1px solid ${s.accent}`,
                      display: "inline-flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Icon name={s.icon} size={16} color={s.accent} />
                  </span>
                  <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em" }}>
                    Step {s.number}
                  </span>
                </div>
                <div
                  className="display mt-3"
                  style={{ fontSize: 24, lineHeight: 1.1, color: "var(--fg-0)" }}
                >
                  {s.title}
                </div>
                <p className="mt-2" style={{ color: "var(--fg-2)", fontSize: 13.5, lineHeight: 1.55 }}>
                  {s.body}
                </p>
              </button>
            );
          })}
        </div>

        {/* Preview pane */}
        <div
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--line-1)",
            borderRadius: "var(--radius-lg)",
            overflow: "hidden",
          }}
        >
          {/* Browser chrome */}
          <div
            className="flex items-center gap-3"
            style={{ padding: "10px 14px", background: "var(--bg-2)", borderBottom: "1px solid var(--line-1)" }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--bad)" }} />
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--warn)" }} />
            <span style={{ width: 10, height: 10, borderRadius: 999, background: "var(--live)" }} />
            <span
              className="mono ml-3 flex-1 text-center"
              style={{ color: "var(--fg-2)", fontSize: 11 }}
            >
              acuity.app — {current.title.toLowerCase()}
            </span>
            <Pill kind="muted">step {STEPS.indexOf(current) + 1}/3</Pill>
          </div>
          <div style={{ padding: 22, minHeight: 420 }}>
            {active === "trap" && <PreviewSetTrap />}
            {active === "watch" && <PreviewLive />}
            {active === "grade" && <PreviewGrade />}
          </div>
        </div>
      </div>

      <div className="mt-10">
        <EightFormats />
      </div>
    </section>
  );
}

function PreviewSetTrap() {
  const [format, setFormat] = useState("Debugging");
  const [severity, setSeverity] = useState(30);
  const severityLabel = severity < 20 ? "Subtle" : severity < 60 ? "Standard" : "Aggressive";
  const formats = ["Algorithm", "Debugging", "System design", "SQL"];
  return (
    <div className="flex flex-col gap-4">
      <SectionLabel>Pick a format</SectionLabel>
      <div className="grid grid-cols-2 gap-2">
        {formats.map((f) => {
          const isActive = f === format;
          return (
            <button
              key={f}
              onClick={() => setFormat(f)}
              style={{
                padding: "10px 12px",
                background: isActive ? "var(--live-dim)" : "var(--bg-2)",
                border: `1px solid ${isActive ? "var(--live)" : "var(--line-1)"}`,
                borderRadius: 6,
                fontSize: 13,
                color: "var(--fg-0)",
                textAlign: "left",
                cursor: "pointer",
              }}
            >
              {f}
            </button>
          );
        })}
      </div>
      <div>
        <div className="flex items-center justify-between">
          <SectionLabel>Hallucination severity</SectionLabel>
          <span className="mono" style={{ color: "var(--warn)", fontSize: 11 }}>{severityLabel}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          value={severity}
          onChange={(e) => setSeverity(Number(e.target.value))}
          style={{ accentColor: "var(--warn)", width: "100%", marginTop: 6 }}
        />
      </div>
      <div className="flex flex-col gap-2 text-[12px]" style={{ color: "var(--fg-2)" }}>
        {[
          ["Token budget", "6,000"],
          ["Guardrail preset", "hints_only"],
          ["Push-back hints", "off"],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-center justify-between"
            style={{ padding: "8px 12px", background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: 6 }}
          >
            <span>{k}</span>
            <span className="mono" style={{ color: "var(--fg-0)" }}>{v}</span>
          </div>
        ))}
      </div>
      <button className="btn btn-primary mt-2 w-full justify-center">
        Create session → share invite link
      </button>
    </div>
  );
}

function PreviewLive() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Pill kind="live" pulse>live · 04:32</Pill>
        <span className="mono" style={{ color: "var(--fg-2)", fontSize: 11 }}>K-th largest · debugging</span>
      </div>
      <CodeBlock
        code={`heap = []
for n in nums:
    if len(heap) < k:
        heapq.heappush(heap, n)
    elif n > heap[0]:`}
        language="python"
        highlightLines={[{ line: 3, color: "var(--signal)", label: "candidate cursor" }]}
      />
      <div
        style={{
          padding: 10,
          background: "oklch(0.80 0.16 75 / 0.06)",
          border: "1px solid oklch(0.80 0.16 75 / 0.35)",
          borderRadius: 8,
          fontSize: 12,
          color: "var(--fg-0)",
          lineHeight: 1.5,
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <Aperture size={14} color="var(--warn)" />
          <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            AI · 14:22:50
          </span>
          <Pill kind="warn">corrupted</Pill>
        </div>
        Heap ops are <span className="hallu">O(n)</span>; each one walks <span className="hallu">the full array</span>.
      </div>
      <div className="grid grid-cols-3 gap-2 mt-1">
        {[
          { k: "Tokens", v: "1,242 / 6,000", c: "var(--fg-0)" },
          { k: "Caught", v: "1 / 2", c: "var(--warn)" },
          { k: "Pastes", v: "0", c: "var(--fg-0)" },
        ].map((s) => (
          <div
            key={s.k}
            style={{ padding: 10, background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: 6 }}
          >
            <div className="section-label">{s.k}</div>
            <div className="mono tabular mt-1" style={{ color: s.c, fontSize: 14 }}>{s.v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PreviewGrade() {
  const dims = [
    { label: "Prompt quality", value: 82, color: "var(--signal)" },
    { label: "Caught AI errors", value: 75, color: "var(--warn)" },
    { label: "Code correctness", value: 60, color: "var(--fg-1)" },
    { label: "Approach", value: 88, color: "var(--live)" },
  ];
  return (
    <div className="flex flex-col gap-4">
      <div>
        <SectionLabel>Session summary</SectionLabel>
        <div className="display mt-1" style={{ fontSize: 22, color: "var(--fg-0)" }}>
          Alex Chen · debugging
        </div>
      </div>
      <div className="flex items-end gap-2">
        <span className="display tabular" style={{ fontSize: 64, lineHeight: 0.9, color: "var(--live)" }}>
          7.6
        </span>
        <span className="mono" style={{ color: "var(--fg-2)", fontSize: 13, marginBottom: 8 }}>/ 10</span>
        <Pill kind="live" className="ml-auto" pulse={false}>Strong hire</Pill>
      </div>
      <div className="flex flex-col gap-2.5">
        {dims.map((d) => (
          <div key={d.label}>
            <div className="flex items-center justify-between mb-1">
              <span style={{ fontSize: 12, color: "var(--fg-1)" }}>{d.label}</span>
              <span className="mono tabular" style={{ color: d.color, fontSize: 12 }}>{d.value}</span>
            </div>
            <Progress value={d.value} color={d.color} />
          </div>
        ))}
      </div>
      <div className="mt-2">
        <SectionLabel extra="52:14">Replay</SectionLabel>
        <ReplayDots />
      </div>
    </div>
  );
}

function ReplayDots() {
  const events: { at: number; c: string }[] = [
    { at: 4, c: "var(--signal)" },
    { at: 11, c: "var(--warn)" },
    { at: 15, c: "var(--live)" },
    { at: 23, c: "var(--warn)" },
    { at: 34, c: "var(--bad)" },
    { at: 41, c: "var(--fg-3)" },
    { at: 58, c: "var(--live)" },
    { at: 67, c: "var(--live)" },
  ];
  return (
    <div className="relative mt-2" style={{ height: 32 }}>
      <div style={{ position: "absolute", top: 14, left: 0, right: 0, height: 2, background: "var(--line-2)" }} />
      {events.map((e, i) => (
        <span
          key={i}
          style={{
            position: "absolute",
            left: `${e.at}%`,
            top: 8,
            width: 14,
            height: 14,
            borderRadius: 999,
            background: e.c,
            border: "2px solid var(--bg-1)",
          }}
        />
      ))}
      <div className="mono mt-5 flex justify-between" style={{ color: "var(--fg-3)", fontSize: 9, letterSpacing: "0.06em" }}>
        <span>00:00</span><span>13:00</span><span>26:00</span><span>39:00</span><span>52:14</span>
      </div>
    </div>
  );
}

const EIGHT: readonly { title: string; tag: string; tokens: string; guardrail: string }[] = [
  { title: "Algorithm / LeetCode", tag: "syntax-only · 0% halluc", tokens: "4k tokens", guardrail: "syntax_only" },
  { title: "API integration",      tag: "hints · 12k tokens",      tokens: "12k tokens", guardrail: "hints_only" },
  { title: "Debugging",            tag: "30% halluc",              tokens: "6k tokens",  guardrail: "hints_only" },
  { title: "Code review",          tag: "open · 4k tokens",        tokens: "4k tokens",  guardrail: "open" },
  { title: "Refactor / optimize",  tag: "same-behavior tests",     tokens: "6k tokens",  guardrail: "no_full_solutions" },
  { title: "SQL / data query",     tag: "expected-output",         tokens: "3k tokens",  guardrail: "hints_only" },
  { title: "Test writing (TDD)",   tag: "explain don't write",     tokens: "4k tokens",  guardrail: "explain_only" },
  { title: "System design",        tag: "open · 20k tokens",       tokens: "20k tokens", guardrail: "open" },
];

function EightFormats() {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "12px 18px", background: "var(--bg-2)", borderBottom: "1px solid var(--line-1)" }}
      >
        <SectionLabel>Eight interview formats included</SectionLabel>
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>change anytime</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--line-1)" }}>
        {EIGHT.map((f) => (
          <div key={f.title} style={{ background: "var(--bg-1)", padding: 18 }}>
            <div className="flex items-start justify-between gap-3">
              <div className="display" style={{ fontSize: 18, color: "var(--fg-0)" }}>{f.title}</div>
              <span className="mono" style={{ color: "var(--fg-2)", fontSize: 10, whiteSpace: "nowrap" }}>{f.tokens}</span>
            </div>
            <div className="mt-2" style={{ color: "var(--fg-2)", fontSize: 12.5 }}>{f.tag}</div>
            <div className="mono mt-3" style={{ color: "var(--fg-3)", fontSize: 10, letterSpacing: "0.04em" }}>
              {f.guardrail}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Force HeatStrip + Avatar referenced to avoid unused warnings in some configs.
void HeatStrip; void Avatar;
export default HowItWorks;
