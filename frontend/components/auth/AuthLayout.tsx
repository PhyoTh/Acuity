import Link from "next/link";
import type { ReactNode } from "react";
import { Aperture, Icon, Wordmark } from "@/components/ui";

// Two-column shell shared by /login and /signup. Left = form column with a
// minimal topbar and a footer credit. Right = promo column with a large
// faded Aperture decoration behind the slot content.
export function AuthLayout({
  side,
  children,
}: {
  side: ReactNode;
  children: ReactNode;
}) {
  return (
    <main
      className="grid"
      style={{
        minHeight: "100vh",
        gridTemplateColumns: "1fr 1fr",
      }}
    >
      {/* LEFT — form */}
      <div className="flex flex-col" style={{ position: "relative" }}>
        <div
          className="flex items-center justify-between"
          style={{ padding: "20px 40px" }}
        >
          <Link href="/" aria-label="Acuity home"><Wordmark size={16} /></Link>
          <Link href="/" className="btn btn-ghost btn-sm" aria-label="Back">
            <Icon name="chevron-left" size={14} /> Back
          </Link>
        </div>
        <div className="flex flex-1 items-center justify-center" style={{ padding: "0 40px" }}>
          <div style={{ width: "100%", maxWidth: 380 }}>{children}</div>
        </div>
        <div
          className="mono"
          style={{
            padding: "20px 40px",
            color: "var(--fg-3)",
            fontSize: 11,
            letterSpacing: "0.06em",
          }}
        >
          © 2026 Acuity
        </div>
      </div>

      {/* RIGHT — promo */}
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, var(--bg-1), oklch(0.18 0.012 155 / 0.4))",
          borderLeft: "1px solid var(--line-1)",
          padding: 48,
          display: "flex",
          alignItems: "center",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -120,
            left: -120,
            opacity: 0.08,
            pointerEvents: "none",
          }}
        >
          <Aperture size={480} color="var(--live)" />
        </div>
        <div style={{ position: "relative", maxWidth: 520 }}>{side}</div>
      </div>
    </main>
  );
}

export default AuthLayout;
