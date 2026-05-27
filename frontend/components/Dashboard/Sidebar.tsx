import Link from "next/link";
import { Avatar, Icon, SectionLabel, Wordmark } from "@/components/ui";

type SidebarNavItem = {
  label: string;
  href: string;
  icon: "menu" | "clock" | "code" | "users" | "sparkle";
  active?: boolean;
};

const NAV: SidebarNavItem[] = [
  { label: "Sessions",        href: "/dashboard",          icon: "menu",    active: true },
  { label: "Activity",        href: "#activity",            icon: "clock" },
  { label: "Problem library", href: "#problem-library",     icon: "code" },
  { label: "Candidates",      href: "#candidates",          icon: "users" },
  { label: "Scorecards",      href: "#scorecards",          icon: "sparkle" },
];

// Sticky 240px sidebar for the interviewer dashboard. Tabs other than
// "Sessions" are decorative — no backend yet (see plan.md §9b).
export function DashboardSidebar({ activeKey = "sessions" }: { activeKey?: string }) {
  return (
    <aside
      className="hidden lg:flex flex-col"
      style={{
        width: 240,
        background: "oklch(0.12 0.006 240 / 0.6)",
        borderRight: "1px solid var(--line-1)",
        position: "sticky",
        top: 0,
        height: "100vh",
        padding: "20px 16px",
      }}
    >
      <div style={{ padding: "0 8px 16px" }}>
        <Link href="/"><Wordmark size={16} /></Link>
      </div>

      <nav className="flex flex-col" style={{ gap: 2 }}>
        {NAV.map((n) => {
          const isActive = activeKey === n.label.toLowerCase().split(" ")[0] || n.active;
          return (
            <Link
              key={n.label}
              href={n.href}
              className="flex items-center gap-2.5"
              style={{
                padding: "8px 10px",
                borderRadius: "var(--radius)",
                color: isActive ? "var(--fg-0)" : "var(--fg-2)",
                fontSize: 13,
                background: isActive ? "var(--bg-2)" : "transparent",
                boxShadow: isActive ? "inset 2px 0 0 var(--live)" : "none",
                position: "relative",
              }}
            >
              <Icon name={n.icon} size={14} color={isActive ? "var(--live)" : "var(--fg-2)"} />
              {n.label}
            </Link>
          );
        })}
      </nav>

      <div className="mt-8" style={{ padding: "0 4px" }}>
        <SectionLabel>Team</SectionLabel>
        <div className="mt-3 flex flex-col gap-2.5">
          {["Phyo Thant", "Sithu Soe"].map((n) => (
            <div key={n} className="flex items-center gap-2.5" style={{ fontSize: 12.5, color: "var(--fg-1)" }}>
              <Avatar name={n} size={22} />
              <span>{n}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Anthropic key card — mock display per ROADMAP §3.3. Real keys are env-driven. */}
      <div
        className="mt-auto"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius)",
          padding: 12,
        }}
      >
        <SectionLabel>Anthropic key</SectionLabel>
        <div className="mono mt-2" style={{ color: "var(--fg-1)", fontSize: 12 }}>
          sk-ant-…7c2a
        </div>
        <div className="mono mt-2 flex items-center gap-1.5" style={{ fontSize: 10, color: "var(--fg-2)", letterSpacing: "0.04em" }}>
          <span className="live-pulse-dot" style={{ width: 5, height: 5 }} />
          connected · haiku-4-5
        </div>
      </div>
    </aside>
  );
}

export default DashboardSidebar;
