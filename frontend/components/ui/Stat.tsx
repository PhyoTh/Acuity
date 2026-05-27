import type { ReactNode } from "react";
import { Sparkline } from "./Sparkline";

// A card with section-label, big display-font number, and optional sparkline
// aligned-baseline to the right.
export function Stat({
  label,
  value,
  sub,
  accent = "var(--fg-0)",
  spark,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  accent?: string;
  spark?: number[];
}) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
      }}
    >
      <div className="section-label">{label}</div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <div
          className="display tabular"
          style={{ fontSize: 36, lineHeight: 1, color: accent }}
        >
          {value}
        </div>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} width={84} height={28} color={accent} />
        )}
      </div>
      {sub && (
        <div className="mono mt-2" style={{ color: "var(--fg-2)", fontSize: 11 }}>
          {sub}
        </div>
      )}
    </div>
  );
}

export default Stat;
