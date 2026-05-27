import type { ReactNode } from "react";

export type PillKind = "live" | "warn" | "signal" | "bad" | "muted";

const TONE: Record<PillKind, { bg: string; border: string; fg: string }> = {
  live:   { bg: "var(--live-dim)",   border: "var(--live)",   fg: "var(--live)" },
  warn:   { bg: "var(--warn-dim)",   border: "var(--warn)",   fg: "var(--warn)" },
  signal: { bg: "var(--signal-dim)", border: "var(--signal)", fg: "var(--signal)" },
  bad:    { bg: "var(--bad-dim)",    border: "var(--bad)",    fg: "var(--bad)" },
  muted:  { bg: "var(--bg-2)",       border: "var(--line-1)", fg: "var(--fg-2)" },
};

// Inline-flex pill with mono uppercase label. Optional pulsing dot for live status.
export function Pill({
  kind = "muted",
  pulse = false,
  className,
  children,
}: {
  kind?: PillKind;
  pulse?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const tone = TONE[kind];
  return (
    <span
      className={`mono inline-flex items-center gap-1.5 ${className ?? ""}`}
      style={{
        background: tone.bg,
        border: `1px solid ${tone.border}`,
        color: tone.fg,
        padding: "3px 8px",
        borderRadius: "999px",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        whiteSpace: "nowrap",
      }}
    >
      {pulse && <span className="live-pulse-dot" style={{ background: tone.fg }} />}
      {children}
    </span>
  );
}

export default Pill;
