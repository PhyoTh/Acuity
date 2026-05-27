import type { CSSProperties, ReactNode } from "react";

// --bg-1 background, 1px --line-1 border, 10px radius. Optional mono uppercase
// header strip with a right-side slot.
export function Card({
  title,
  right,
  children,
  className,
  style,
  padding = 18,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  padding?: number;
}) {
  return (
    <div
      className={className}
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
        ...style,
      }}
    >
      {(title || right) && (
        <div
          className="flex items-center justify-between"
          style={{
            padding: "10px 14px",
            borderBottom: "1px solid var(--line-1)",
            background: "var(--bg-2)",
          }}
        >
          <span className="section-label">{title}</span>
          {right && <span style={{ color: "var(--fg-2)" }}>{right}</span>}
        </div>
      )}
      <div style={{ padding }}>{children}</div>
    </div>
  );
}

export default Card;
