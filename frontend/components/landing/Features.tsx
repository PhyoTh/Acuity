import type { ReactNode } from "react";
import { Aperture, Icon, Pill, SectionLabel } from "@/components/ui";

type FeatureCardProps = {
  tag: string;
  accent: string;
  title: string;
  body: string;
  span: number; // grid column span
  decoration?: ReactNode;
};

function FeatureCard({ tag, accent, title, body, span, decoration }: FeatureCardProps) {
  return (
    <div
      style={{
        gridColumn: `span ${span}`,
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        padding: 22,
        display: "flex",
        flexDirection: "column",
        gap: 14,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div className="flex items-center justify-between">
        <span
          className="mono"
          style={{
            color: accent,
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.14em",
          }}
        >
          {tag}
        </span>
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 999,
            background: accent,
            boxShadow: `0 0 0 3px color-mix(in oklch, ${accent} 18%, transparent)`,
          }}
        />
      </div>
      <div className="display" style={{ fontSize: 22, lineHeight: 1.2, color: "var(--fg-0)" }}>
        {title}
      </div>
      <p style={{ color: "var(--fg-2)", fontSize: 13.5, lineHeight: 1.55 }}>{body}</p>
      <div style={{ marginTop: "auto" }}>{decoration}</div>
    </div>
  );
}

export function Features() {
  return (
    <section id="features" style={{ maxWidth: 1320, margin: "0 auto", padding: "100px 48px 0" }}>
      <SectionLabel>Features</SectionLabel>
      <h2
        className="display mt-2"
        style={{ fontSize: 56, lineHeight: 1.04, letterSpacing: "-0.02em", maxWidth: 980 }}
      >
        Built for the way{" "}
        <span className="display-italic" style={{ color: "var(--live)" }}>
          engineers actually work
        </span>{" "}
        today.
      </h2>
      <div
        className="mt-12 grid"
        style={{
          gridTemplateColumns: "repeat(6, 1fr)",
          gridAutoRows: "minmax(260px, auto)",
          gap: 16,
        }}
      >
        <FeatureCard
          tag="integrity"
          accent="var(--warn)"
          title="Catch every suspicious moment, in order."
          body="Every paste, tab switch, idle gap, and AI corruption shows up as a marker on the replay scrubber — chronologically, never aggregated away."
          span={4}
          decoration={<IntegrityTimeline />}
        />
        <FeatureCard
          tag="dashboard"
          accent="var(--signal)"
          title="Mission-control dashboard."
          body="One screen for everything: live sessions, queued interviews, completed scorecards, with token spend and caught-rate trends across your team."
          span={2}
          decoration={<MiniDashboard />}
        />
        <FeatureCard
          tag="share"
          accent="var(--live)"
          title="One link. Zero install."
          body="Send candidates a single URL. They land in a real Monaco editor — no setup, no plugins, no zoom dance."
          span={2}
          decoration={<ShareLink />}
        />
        <FeatureCard
          tag="schedule"
          accent="var(--fg-0)"
          title="Schedule ahead. Or start cold."
          body="Create a session and run it now, or assign a time slot and the invite link goes live automatically when the window opens."
          span={2}
          decoration={<Calendar />}
        />
        <FeatureCard
          tag="privacy"
          accent="var(--signal)"
          title="Privacy by default."
          body="No webcam, no microphone, no screen recording. Just the code, the chat, and the moments that matter — explicitly logged and visible to both sides."
          span={2}
          decoration={<PrivacyMatrix />}
        />
        <FeatureCard
          tag="cost"
          accent="var(--live)"
          title="Always free. Bring your own Anthropic key."
          body="Acuity charges nothing. You pay Anthropic directly for the Claude calls your interviews use — a Haiku-powered 50-minute session lands well under a dollar."
          span={3}
          decoration={<CostFootprint />}
        />
        <FeatureCard
          tag="grading"
          accent="var(--warn)"
          title="Claude grades the judgement, not the typing."
          body="Four dimensions: prompt quality, errors caught, code correctness, and how much they leaned on the AI. With a written justification per dimension."
          span={3}
          decoration={<ScoreCallout />}
        />
      </div>
    </section>
  );
}

/* -------------------- decoration components -------------------- */

function IntegrityTimeline() {
  const events: { at: number; c: string; label: string }[] = [
    { at: 4,  c: "var(--signal)", label: "4% first edit" },
    { at: 11, c: "var(--warn)",   label: "11% AI corrupted" },
    { at: 15, c: "var(--live)",   label: "15% pushed back" },
    { at: 23, c: "var(--warn)",   label: "23% paste 142ch" },
    { at: 34, c: "var(--bad)",    label: "34% tab switch" },
    { at: 41, c: "var(--fg-3)",   label: "41% idle 92s" },
    { at: 58, c: "var(--live)",   label: "58% 3/3 ✓" },
    { at: 67, c: "var(--live)",   label: "67% submitted" },
  ];
  return (
    <div>
      <div className="relative" style={{ height: 80 }}>
        <div style={{ position: "absolute", top: 38, left: 0, right: 0, height: 2, background: "var(--line-2)" }} />
        {events.map((e, i) => {
          const above = i % 2 === 0;
          return (
            <div key={i} style={{ position: "absolute", left: `${e.at}%`, top: 0, height: 80 }}>
              <span
                style={{
                  position: "absolute",
                  top: 32,
                  left: -7,
                  width: 14,
                  height: 14,
                  borderRadius: 999,
                  background: e.c,
                  border: "2px solid var(--bg-1)",
                }}
              />
              <span
                className="mono"
                style={{
                  position: "absolute",
                  top: above ? 0 : 56,
                  left: -52,
                  width: 110,
                  textAlign: "center",
                  color: e.c === "var(--fg-3)" ? "var(--fg-3)" : "var(--fg-2)",
                  fontSize: 9,
                  letterSpacing: "0.04em",
                }}
              >
                {e.label}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex gap-4" style={{ fontSize: 10, color: "var(--fg-3)" }}>
        <Legend c="var(--signal)" label="edit" />
        <Legend c="var(--warn)" label="paste / AI" />
        <Legend c="var(--bad)" label="tab switch" />
        <Legend c="var(--live)" label="caught / done" />
      </div>
    </div>
  );
}

function Legend({ c, label }: { c: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 mono">
      <span style={{ width: 8, height: 8, borderRadius: 999, background: c }} />
      {label}
    </span>
  );
}

function MiniDashboard() {
  const rows = [
    { title: "Search infra — onsite #2", status: "live",    score: "—",   accent: "var(--live)" },
    { title: "Stripe payment flow",       status: "pending", score: "—",   accent: "var(--signal)" },
    { title: "Binary search — buggy",     status: "ended",   score: "8.6", accent: "var(--fg-2)" },
    { title: "Aggregate orders query",    status: "ended",   score: "7.4", accent: "var(--fg-2)" },
  ];
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: 6 }}>
      {rows.map((r, i) => (
        <div
          key={r.title}
          className="flex items-center justify-between gap-2"
          style={{
            padding: "8px 10px",
            borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line-1)",
            fontSize: 11.5,
          }}
        >
          <span style={{ color: "var(--fg-0)" }} className="truncate">{r.title}</span>
          <span className="mono uppercase" style={{ color: r.accent, fontSize: 10, letterSpacing: "0.06em" }}>
            {r.status}
          </span>
          <span className="mono tabular" style={{ color: "var(--fg-2)", width: 28, textAlign: "right" }}>
            {r.score}
          </span>
        </div>
      ))}
    </div>
  );
}

function ShareLink() {
  return (
    <div className="flex flex-col gap-2">
      <div
        className="mono flex items-center justify-between"
        style={{
          padding: "8px 12px",
          background: "var(--bg-0)",
          border: "1px solid var(--live)",
          borderRadius: 6,
          color: "var(--live)",
          fontSize: 12,
        }}
      >
        acuity.app/join/7I1Q5K5Y
        <Icon name="copy" size={14} color="var(--live)" />
      </div>
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10 }}>
        link is single-use · expires when session ends
      </span>
    </div>
  );
}

function Calendar() {
  // June 2026: starts on Monday (1). 21 days shown.
  const today = 14;
  const scheduled = new Set([16, 18]);
  const days: (number | null)[] = [null]; // start col offset for week
  for (let d = 1; d <= 21; d++) days.push(d);
  return (
    <div>
      <div className="mono mb-2 flex items-center justify-between" style={{ color: "var(--fg-2)", fontSize: 11 }}>
        <span>JUN 2026</span>
        <span style={{ color: "var(--fg-3)" }}>S M T W T F S</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {days.map((d, i) => {
          if (d == null) return <span key={i} />;
          const isToday = d === today;
          const isScheduled = scheduled.has(d);
          return (
            <span
              key={i}
              className="mono flex items-center justify-center"
              style={{
                height: 24,
                fontSize: 11,
                borderRadius: 4,
                background: isToday
                  ? "var(--live)"
                  : isScheduled
                  ? "var(--signal-dim)"
                  : "transparent",
                border: isScheduled ? "1px solid var(--signal)" : "1px solid transparent",
                color: isToday ? "oklch(0.10 0.01 155)" : isScheduled ? "var(--signal)" : "var(--fg-2)",
                fontWeight: isToday ? 600 : 400,
              }}
            >
              {d}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PrivacyMatrix() {
  const rows: { label: string; cand: "y" | "n" | "-"; intv: "y" | "n" | "-" }[] = [
    { label: "Code & chat",       cand: "y", intv: "y" },
    { label: "Webcam / mic",      cand: "n", intv: "n" },
    { label: "Screen recording",  cand: "n", intv: "n" },
    { label: "Halluc flags",      cand: "-", intv: "y" },
  ];
  const cell = (v: "y" | "n" | "-") =>
    v === "y" ? <Icon name="check" size={14} color="var(--live)" />
    : v === "n" ? <Icon name="x" size={14} color="var(--bad)" />
    : <span className="mono" style={{ color: "var(--fg-3)" }}>—</span>;
  return (
    <div style={{ background: "var(--bg-2)", border: "1px solid var(--line-1)", borderRadius: 6 }}>
      <div
        className="grid mono"
        style={{
          gridTemplateColumns: "1fr 40px 40px",
          padding: "6px 12px",
          fontSize: 10,
          color: "var(--fg-3)",
          letterSpacing: "0.06em",
          borderBottom: "1px solid var(--line-1)",
        }}
      >
        <span></span><span className="text-center">CAND</span><span className="text-center">INTV</span>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.label}
          className="grid items-center"
          style={{
            gridTemplateColumns: "1fr 40px 40px",
            padding: "8px 12px",
            fontSize: 12,
            color: "var(--fg-1)",
            borderBottom: i === rows.length - 1 ? "none" : "1px solid var(--line-1)",
          }}
        >
          <span>{r.label}</span>
          <span className="flex justify-center">{cell(r.cand)}</span>
          <span className="flex justify-center">{cell(r.intv)}</span>
        </div>
      ))}
    </div>
  );
}

function CostFootprint() {
  return (
    <div>
      <div
        className="grid items-center"
        style={{
          gridTemplateColumns: "1fr 1fr",
          padding: 16,
          background: "var(--bg-2)",
          border: "1px solid var(--line-1)",
          borderRadius: 8,
        }}
      >
        <div>
          <div className="section-label">Per session</div>
          <div className="display tabular" style={{ fontSize: 36, lineHeight: 1, color: "var(--live)", marginTop: 4 }}>
            $0.32
          </div>
        </div>
        <div className="text-right">
          <div className="mono" style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase" }}>
            billed by
          </div>
          <div className="mono mt-1" style={{ color: "var(--fg-0)", fontSize: 13 }}>
            Anthropic, not us
          </div>
        </div>
      </div>
      <p className="mt-3" style={{ color: "var(--fg-2)", fontSize: 12.5, lineHeight: 1.5 }}>
        Typical 50-minute interview · <span className="mono">claude-haiku-4-5</span> · ~5k tokens.
        Your key, your bill.
      </p>
    </div>
  );
}

function ScoreCallout() {
  const bars = [
    { label: "Prompt quality", value: 82, color: "var(--signal)" },
    { label: "Caught AI errors", value: 75, color: "var(--warn)" },
    { label: "Code correctness", value: 60, color: "var(--fg-1)" },
    { label: "Approach", value: 88, color: "var(--live)" },
  ];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-end gap-3">
        <span className="display tabular" style={{ fontSize: 48, lineHeight: 0.95, color: "var(--live)" }}>7.6</span>
        <span className="mono" style={{ color: "var(--fg-2)", fontSize: 12, marginBottom: 6 }}>/10 · Alex Chen</span>
        <Pill kind="live" className="ml-auto">Strong hire</Pill>
      </div>
      <div className="flex flex-col gap-1.5">
        {bars.map((b) => (
          <div key={b.label} className="grid items-center" style={{ gridTemplateColumns: "1fr 64px 32px", gap: 8, fontSize: 11 }}>
            <span style={{ color: "var(--fg-2)" }}>{b.label}</span>
            <span style={{ height: 4, background: "var(--bg-2)", borderRadius: 999 }}>
              <span style={{ display: "block", height: "100%", width: `${b.value}%`, background: b.color, borderRadius: 999 }} />
            </span>
            <span className="mono tabular text-right" style={{ color: b.color }}>{b.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// keep Aperture import in case future variants need it
void Aperture;
export default Features;
