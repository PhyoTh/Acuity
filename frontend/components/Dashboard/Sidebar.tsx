import Link from "next/link";
import { Avatar, Icon, SectionLabel, Wordmark } from "@/components/ui";

type SidebarNavItem = {
  key: string;
  label: string;
  href: string;
  icon: "menu" | "clock" | "code" | "users" | "sparkle" | "settings";
};

const NAV: SidebarNavItem[] = [
  { key: "sessions",  label: "Sessions",        href: "/dashboard",          icon: "menu" },
  { key: "activity",  label: "Activity",        href: "#activity",            icon: "clock" },
  { key: "library",   label: "Problem library", href: "#problem-library",     icon: "code" },
  { key: "candidates",label: "Candidates",      href: "#candidates",          icon: "users" },
  { key: "scorecards",label: "Scorecards",      href: "#scorecards",          icon: "sparkle" },
  { key: "settings",  label: "Settings",        href: "/dashboard/settings",  icon: "settings" },
];

// Sticky 240px sidebar for the interviewer dashboard. Tabs other than "Sessions" and
// "Settings" are decorative — no backend yet.
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
      {/* Wordmark is intentionally non-clickable here — interviewers shouldn't accidentally
          leave their authenticated dashboard for the public landing page. */}
      <div style={{ padding: "0 8px 16px" }}>
        <Wordmark size={16} />
      </div>

      <nav className="flex flex-col" style={{ gap: 2 }}>
        {NAV.map((n) => {
          const isActive = activeKey === n.key;
          return (
            <Link
              key={n.key}
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
                textDecoration: "none",
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
    </aside>
  );
}

export default DashboardSidebar;
