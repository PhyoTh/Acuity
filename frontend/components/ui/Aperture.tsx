// SVG lens-iris logo: a circle with 6 radial blades and a center dot.
// Acuity's wordmark companion. Per ROADMAP §1.4.
export function Aperture({
  size = 16,
  color = "var(--live)",
  className,
}: {
  size?: number;
  color?: string;
  className?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 1;
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      fill="none"
      stroke={color}
      strokeWidth={size > 32 ? 1.4 : 1.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <circle cx={cx} cy={cy} r={r} />
      {Array.from({ length: 6 }).map((_, i) => {
        const angle = (i * Math.PI) / 3 - Math.PI / 2;
        const x1 = cx + Math.cos(angle) * (r * 0.25);
        const y1 = cy + Math.sin(angle) * (r * 0.25);
        const x2 = cx + Math.cos(angle) * r;
        const y2 = cy + Math.sin(angle) * r;
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
      })}
      <circle cx={cx} cy={cy} r={Math.max(1, size * 0.06)} fill={color} stroke="none" />
    </svg>
  );
}

export default Aperture;
