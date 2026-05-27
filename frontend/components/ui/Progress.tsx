// Plain rounded-pill progress bar.
export function Progress({
  value,
  max = 100,
  color = "var(--live)",
  height = 6,
  className,
}: {
  value: number;
  max?: number;
  color?: string;
  height?: number;
  className?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / Math.max(1, max)) * 100));
  return (
    <div
      className={className}
      style={{
        width: "100%",
        height,
        background: "var(--bg-2)",
        borderRadius: 999,
        overflow: "hidden",
        border: "1px solid var(--line-1)",
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
}

export default Progress;
