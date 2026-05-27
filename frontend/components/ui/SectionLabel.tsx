import type { ReactNode } from "react";

// Mono 10px, uppercase, 0.14em letterspacing, color --fg-3. Optional right-side extra slot.
export function SectionLabel({
  children,
  extra,
  className,
}: {
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between ${className ?? ""}`}>
      <span className="section-label">{children}</span>
      {extra && <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10 }}>{extra}</span>}
    </div>
  );
}

export default SectionLabel;
