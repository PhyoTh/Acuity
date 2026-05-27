import { Aperture } from "./Aperture";

// Aperture icon + the text "Acuity" in Instrument Serif italic.
export function Wordmark({
  size = 18,
  className,
  color = "var(--live)",
}: {
  size?: number;
  className?: string;
  color?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className ?? ""}`}
      style={{ color: "var(--fg-0)" }}
    >
      <Aperture size={size + 4} color={color} />
      <span
        className="display-italic"
        style={{ fontSize: size, lineHeight: 1, letterSpacing: "-0.01em" }}
      >
        Acuity
      </span>
    </span>
  );
}

export default Wordmark;
