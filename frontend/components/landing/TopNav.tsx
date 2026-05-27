import Link from "next/link";
import { Icon, Wordmark } from "@/components/ui";

export function TopNav() {
  return (
    <nav
      className="sticky top-0 z-30"
      style={{
        padding: "20px 48px",
        borderBottom: "1px solid var(--line-1)",
        backdropFilter: "blur(8px)",
        WebkitBackdropFilter: "blur(8px)",
        background: "oklch(0.13 0.006 240 / 0.7)",
      }}
    >
      <div className="mx-auto flex max-w-[1320px] items-center justify-between">
        <Link href="/" aria-label="Acuity home">
          <Wordmark size={18} />
        </Link>
        <div className="flex items-center gap-6">
          <a href="#how-it-works" className="text-[13px]" style={{ color: "var(--fg-1)" }}>How it works</a>
          <a href="#features" className="text-[13px]" style={{ color: "var(--fg-1)" }}>Features</a>
          <a href="#contact" className="text-[13px]" style={{ color: "var(--fg-1)" }}>Contact</a>
          <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
          <Link href="/login" className="btn btn-ghost btn-sm">Log in</Link>
          <Link href="/signup" className="btn btn-primary btn-sm">
            Get access <Icon name="arrow-right" size={14} />
          </Link>
        </div>
      </div>
    </nav>
  );
}

export default TopNav;
