// Tiny bar-chart of vertical bars (4px wide), opacity scales with magnitude.
export function HeatStrip({
  values,
  height = 18,
  color = "var(--signal)",
  className,
}: {
  values: number[];
  height?: number;
  color?: string;
  className?: string;
}) {
  if (!values.length) return null;
  const max = Math.max(...values, 1);
  return (
    <div
      className={`flex items-end gap-[2px] ${className ?? ""}`}
      style={{ height }}
    >
      {values.map((v, i) => {
        const o = Math.min(1, Math.max(0.12, v / max));
        const h = Math.max(2, (v / max) * height);
        return (
          <span
            key={i}
            style={{
              width: 4,
              height: h,
              background: color,
              opacity: o,
              borderRadius: 1,
              display: "inline-block",
            }}
          />
        );
      })}
    </div>
  );
}

export default HeatStrip;
