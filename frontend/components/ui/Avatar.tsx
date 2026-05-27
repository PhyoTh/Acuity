// Round gradient avatar based on a stable hash of name, 2-letter initials.
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const HUE_PAIRS: ReadonlyArray<readonly [number, number]> = [
  [155, 230], [75, 155], [230, 280], [25, 75], [280, 200], [200, 155], [320, 240], [50, 130],
];

export function Avatar({
  name,
  size = 28,
  className,
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  const h = hash(name || "anon");
  const [a, b] = HUE_PAIRS[h % HUE_PAIRS.length];
  const bg = `linear-gradient(135deg, oklch(0.58 0.15 ${a}), oklch(0.42 0.13 ${b}))`;
  return (
    <span
      className={`inline-flex items-center justify-center ${className ?? ""}`}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        background: bg,
        color: "oklch(0.97 0.005 240)",
        fontSize: Math.max(9, Math.floor(size * 0.38)),
        fontWeight: 600,
        letterSpacing: "-0.01em",
        flexShrink: 0,
        boxShadow: "inset 0 0 0 1px oklch(0 0 0 / 0.15)",
        userSelect: "none",
      }}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export default Avatar;
