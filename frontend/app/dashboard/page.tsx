"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import { ScheduleCalendar } from "@/components/Dashboard/ScheduleCalendar";
import { Avatar, HeatStrip, Icon, Pill, Progress, SectionLabel, Sparkline } from "@/components/ui";
import { api } from "@/lib/api";
import { ACTIVITY, API_BALANCE, TOKENS_MINE } from "@/lib/mocks";
import type { Profile, SessionStatus, SessionSummary } from "@/lib/types";

const FILTERS: ("all" | SessionStatus)[] = ["all", "active", "pending", "ended"];

// Interviewer home — sidebar nav, 4-stat row (mock), live-session callout (real
// active session if any), filterable sessions table (real), and a side column
// with Quick start + Recent activity (mock).
export default function DashboardHome() {
  const [me, setMe] = useState<Profile | null>(null);
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
  }, []);

  function refresh() {
    setLoading(true);
    api
      .listSessions()
      .then((rows) => { setSessions(rows); setError(null); })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }

  useEffect(refresh, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.join_code.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [sessions, query, statusFilter]);

  const liveSession = useMemo(
    () => sessions.find((s) => s.status === "active"),
    [sessions],
  );

  const displayName = me?.display_name ?? "interviewer";
  const greeting = greetingForNow();
  const liveCount = sessions.filter((s) => s.status === "active").length;

  return (
    <div className="flex">
      <DashboardSidebar activeKey="sessions" />
      <main className="flex-1" style={{ padding: "32px 40px 80px" }}>
        {/* Header */}
        <header className="flex items-start justify-between">
          <div>
            <SectionLabel>{displayName} · interviewer</SectionLabel>
            <h1
              className="display mt-2"
              style={{ fontSize: 44, lineHeight: 1.04, letterSpacing: "-0.02em", maxWidth: 760 }}
            >
              {greeting}.{" "}
              <span className="display-italic" style={{ color: "var(--live)" }}>
                {liveCount === 0
                  ? "No sessions live."
                  : liveCount === 1
                  ? "One session is live."
                  : `${liveCount} sessions live.`}
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button className="btn btn-ghost btn-sm" onClick={refresh}>
              <Icon name="refresh" size={14} /> Refresh
            </button>
            <Link href="/dashboard/new" className="btn btn-primary">
              <Icon name="plus" size={14} /> New session
            </Link>
          </div>
        </header>

        {/* Header row: my tokens + shared API balance | separator | schedule calendar.
            Both stat tiles are mock — we don't yet aggregate Anthropic
            usage per-user and there's no billing API integration. */}
        <div
          className="mt-8 grid items-stretch gap-6"
          style={{ gridTemplateColumns: "1fr 1fr auto 1.4fr" }}
        >
          <UsageTile
            label="Your tokens"
            value={TOKENS_MINE.value}
            sub={TOKENS_MINE.sub}
            spark={TOKENS_MINE.spark}
            accent="var(--live)"
            footnote="just your sessions"
          />
          <UsageTile
            label="API balance"
            value={API_BALANCE.spentLabel}
            sub={`/ ${API_BALANCE.totalLabel} · ${API_BALANCE.remainingLabel}`}
            progress={{ value: API_BALANCE.used, max: API_BALANCE.total, color: "var(--signal)" }}
            accent="var(--signal)"
            footnote="shared across the team"
          />
          {/* Visual separator between personal usage (left) and team-wide schedule (right). */}
          <div
            aria-hidden
            style={{
              width: 1,
              alignSelf: "stretch",
              background: "var(--line-2)",
              margin: "4px 4px",
            }}
          />
          <div
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--line-1)",
              borderRadius: "var(--radius-lg)",
              padding: 16,
            }}
          >
            <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
              <SectionLabel>Schedule</SectionLabel>
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10 }}>
                click a dot to view
              </span>
            </div>
            <ScheduleCalendar sessions={sessions} />
          </div>
        </div>

        {/* Live session callout */}
        {liveSession ? (
          <Link
            href={`/dashboard/${liveSession.id}`}
            className="mt-6 block"
            style={{
              background:
                "linear-gradient(135deg, var(--bg-1), oklch(0.18 0.012 155 / 0.5))",
              border: "1px solid var(--live)",
              borderRadius: "var(--radius-lg)",
              padding: 22,
              textDecoration: "none",
              boxShadow: "0 0 0 1px oklch(0.74 0.16 155 / 0.06)",
            }}
          >
            <div className="grid items-center gap-6" style={{ gridTemplateColumns: "1.4fr 1fr 1fr auto" }}>
              <div>
                <div className="flex items-center gap-3">
                  <Pill kind="live" pulse>live</Pill>
                  <span className="mono" style={{ color: "var(--fg-2)", fontSize: 11 }}>
                    {liveSession.join_code}
                  </span>
                </div>
                <div className="display mt-2" style={{ fontSize: 24, color: "var(--fg-0)" }}>
                  {liveSession.title}
                </div>
                <div className="mt-1 flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--fg-2)" }}>
                  <Avatar name="candidate" size={20} />
                  candidate · {liveSession.interview_type} · {liveSession.language}
                </div>
              </div>
              <div>
                <SectionLabel>Token budget</SectionLabel>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="display tabular" style={{ fontSize: 28, color: "var(--fg-0)" }}>1,242</span>
                  <span className="mono" style={{ color: "var(--fg-2)", fontSize: 12 }}>/ 6,000</span>
                </div>
                <div className="mt-2"><Progress value={1242} max={6000} color="var(--live)" /></div>
              </div>
              <div>
                <SectionLabel>AI corruption</SectionLabel>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="display tabular" style={{ fontSize: 28, color: "var(--warn)" }}>1 / 2</span>
                  <span className="mono" style={{ color: "var(--fg-2)", fontSize: 12 }}>caught</span>
                </div>
                <div className="mt-2"><HeatStrip values={[1, 2, 1, 3, 1, 0, 2, 1]} color="var(--warn)" /></div>
              </div>
              <span className="btn btn-primary">
                Open live view <Icon name="arrow-right" size={14} />
              </span>
            </div>
          </Link>
        ) : null}

        {/* Sessions table + side column */}
        <div className="mt-8 grid gap-6" style={{ gridTemplateColumns: "1fr 320px" }}>
          {/* Sessions table */}
          <div>
            <div className="flex items-center justify-between">
              <SectionLabel>All sessions</SectionLabel>
              <div className="flex items-center gap-3">
                <div
                  className="relative"
                  style={{
                    background: "var(--bg-1)",
                    border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius)",
                    width: 260,
                  }}
                >
                  <span style={{ position: "absolute", top: 9, left: 10 }}>
                    <Icon name="search" size={14} color="var(--fg-3)" />
                  </span>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="search title or code…"
                    className="input"
                    style={{ paddingLeft: 32, border: "none", background: "transparent" }}
                  />
                </div>
                <div
                  className="flex"
                  style={{
                    background: "var(--bg-1)",
                    border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius)",
                    padding: 2,
                  }}
                >
                  {FILTERS.map((f) => {
                    const isActive = f === statusFilter;
                    return (
                      <button
                        key={f}
                        onClick={() => setStatusFilter(f)}
                        className="mono"
                        style={{
                          padding: "5px 10px",
                          background: isActive ? "var(--bg-3)" : "transparent",
                          color: isActive ? "var(--fg-0)" : "var(--fg-2)",
                          fontSize: 11,
                          textTransform: "uppercase",
                          letterSpacing: "0.06em",
                          borderRadius: 4,
                          border: "none",
                          cursor: "pointer",
                        }}
                      >
                        {f}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div
              className="mt-3"
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-lg)",
                overflow: "hidden",
              }}
            >
              {loading && (
                <div className="mono" style={{ padding: 16, color: "var(--fg-3)", fontSize: 12 }}>
                  loading…
                </div>
              )}
              {error && (
                <div className="mono" style={{ padding: 16, color: "var(--bad)", fontSize: 12 }}>
                  {error}
                </div>
              )}
              {!loading && filtered.length === 0 && !error && (
                <div style={{ padding: 18, color: "var(--fg-2)", fontSize: 13 }}>
                  {sessions.length === 0
                    ? "No sessions yet — click + New session to create one."
                    : "No sessions match the current filters."}
                </div>
              )}
              {filtered.map((s, i) => (
                <SessionRow key={s.id} session={s} divider={i < filtered.length - 1} />
              ))}
            </div>
          </div>

          {/* Side column */}
          <aside className="flex flex-col gap-5">
            <div
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-lg)",
                padding: 18,
              }}
            >
              <div className="flex items-center gap-2">
                <Icon name="sparkle" size={14} color="var(--live)" />
                <SectionLabel>Quick start</SectionLabel>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {[
                  { title: "Algorithm",     sub: "syntax_only · 4k tokens" },
                  { title: "Debugging",     sub: "hints_only · 30% halluc · 6k" },
                  { title: "System design", sub: "open · 20k tokens" },
                ].map((p) => (
                  <Link
                    key={p.title}
                    href="/dashboard/new"
                    className="flex items-start justify-between gap-2"
                    style={{
                      padding: "10px 12px",
                      background: "var(--bg-2)",
                      border: "1px solid var(--line-1)",
                      borderRadius: "var(--radius)",
                      textDecoration: "none",
                    }}
                  >
                    <div>
                      <div style={{ color: "var(--fg-0)", fontSize: 13 }}>{p.title}</div>
                      <div className="mono mt-0.5" style={{ color: "var(--fg-3)", fontSize: 10 }}>
                        {p.sub}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>

            <div
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-lg)",
                padding: 18,
              }}
            >
              <div className="flex items-center gap-2">
                <Icon name="clock" size={14} color="var(--signal)" />
                <SectionLabel>Recent activity</SectionLabel>
              </div>
              <div className="mt-3 flex flex-col gap-2.5">
                {ACTIVITY.map((a, i) => (
                  <div key={i} className="flex items-start gap-2.5" style={{ fontSize: 12.5 }}>
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: 999,
                        marginTop: 6,
                        background: `var(--${a.color === "fg-2" ? "fg-2" : a.color})`,
                        flexShrink: 0,
                      }}
                    />
                    <div className="flex-1">
                      <span style={{ color: "var(--fg-0)" }}>{a.who}</span>
                      <span style={{ color: "var(--fg-2)" }}> {a.what} </span>
                      <span style={{ color: "var(--fg-1)" }}>{a.target}</span>
                    </div>
                    <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10 }}>{a.when}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SessionRow({ session, divider }: { session: SessionSummary; divider: boolean }) {
  const statusPill: Record<SessionStatus, React.ReactNode> = {
    active:  <Pill kind="live" pulse>live</Pill>,
    pending: <Pill kind="signal">pending</Pill>,
    ended:   <Pill kind="muted">ended</Pill>,
  };
  return (
    <Link
      href={`/dashboard/${session.id}`}
      className="grid items-center gap-3"
      style={{
        gridTemplateColumns: "2fr 100px 1fr 1fr 1fr 80px",
        padding: "14px 18px",
        borderBottom: divider ? "1px solid var(--line-1)" : "none",
        background: "transparent",
        textDecoration: "none",
        transition: "background 0.12s ease",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "var(--bg-2)")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
    >
      <div className="min-w-0">
        <div className="truncate" style={{ color: "var(--fg-0)", fontSize: 13.5 }}>{session.title}</div>
        <div className="mono mt-0.5" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
          {session.interview_type} · {session.language}
        </div>
      </div>
      {statusPill[session.status]}
      <div className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--fg-2)" }}>
        <Avatar name="candidate" size={20} />
        candidate
      </div>
      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
        {new Date(session.created_at).toLocaleString()}
      </span>
      <span className="mono" style={{ color: "var(--fg-2)", fontSize: 10.5 }}>
        {session.status === "ended" ? "scorecard ready" : ""}
      </span>
      <span className="mono text-right" style={{ color: "var(--fg-2)", fontSize: 10.5 }}>
        {session.join_code}
      </span>
    </Link>
  );
}

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

// Big number + optional sparkline or progress bar + small footnote clarifying scope
// (your own vs shared). Used for the "your tokens" / "API balance" tiles.
function UsageTile({
  label,
  value,
  sub,
  spark,
  progress,
  accent,
  footnote,
}: {
  label: string;
  value: string;
  sub: string;
  spark?: number[];
  progress?: { value: number; max: number; color: string };
  accent: string;
  footnote: string;
}) {
  return (
    <div
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        padding: 18,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div className="flex items-center justify-between">
        <SectionLabel>{label}</SectionLabel>
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase" }}>
          {footnote}
        </span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-3">
        <div className="display tabular" style={{ fontSize: 36, lineHeight: 1, color: accent }}>
          {value}
        </div>
        {spark && spark.length > 0 && (
          <Sparkline values={spark} width={84} height={28} color={accent} />
        )}
      </div>
      {progress && (
        <div className="mt-3">
          <Progress value={progress.value} max={progress.max} color={progress.color} />
        </div>
      )}
      <div className="mono mt-2" style={{ color: "var(--fg-2)", fontSize: 11 }}>{sub}</div>
    </div>
  );
}
