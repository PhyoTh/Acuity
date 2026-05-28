"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Avatar, Icon, Pill, SectionLabel, Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { CandidateSessionLog, Profile } from "@/lib/types";
import { INTERVIEW_TYPES } from "@/lib/types";

// Candidate dashboard — intentionally a bare log. The candidate sees what kind of interview
// they took and when; they never see the problem statement, their own code, the chat, or the
// scorecard. To enter an active interview, they use the original invite link.
export default function CandidateDashboard() {
  const router = useRouter();
  const [sessions, setSessions] = useState<CandidateSessionLog[]>([]);
  const [me, setMe] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
    api
      .listMyCandidateSessions()
      .then((rows) => {
        setSessions(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  function typeLabel(value: string): string {
    return INTERVIEW_TYPES.find((t) => t.value === value)?.label ?? value;
  }

  function onJoinSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = joinCode.trim();
    if (code) router.push(`/join/${code}`);
  }

  async function onLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  const ended = sessions.filter((s) => s.status === "ended");
  const active = sessions.filter((s) => s.status !== "ended");
  const totalLabel = sessions.length === 0
    ? "Nothing yet."
    : sessions.length === 1
    ? "One session"
    : `${sessions.length} sessions`;

  return (
    <main style={{ minHeight: "100vh" }}>
      {/* Top bar */}
      <header
        className="flex items-center justify-between"
        style={{ padding: "16px 32px", borderBottom: "1px solid var(--line-1)" }}
      >
        <Wordmark size={16} />
        <div className="flex items-center gap-3">
          {me && (
            <span className="flex items-center gap-2" style={{ fontSize: 12.5, color: "var(--fg-1)" }}>
              <Avatar name={me.display_name ?? "candidate"} size={22} />
              {me.display_name ?? "candidate"}
            </span>
          )}
          <button onClick={onLogout} className="btn btn-ghost btn-sm" aria-label="Log out">
            <Icon name="logout" size={14} />
          </button>
        </div>
      </header>

      <div style={{ maxWidth: 880, margin: "0 auto", padding: "60px 32px 80px" }}>
        <SectionLabel>Your interviews</SectionLabel>
        <h1
          className="display mt-2"
          style={{ fontSize: 48, lineHeight: 1.04, letterSpacing: "-0.02em" }}
        >
          {sessions.length === 0 ? (
            <>No sessions <span className="display-italic" style={{ color: "var(--live)" }}>yet</span>.</>
          ) : ended.length === sessions.length ? (
            <>{totalLabel}, <span className="display-italic" style={{ color: "var(--live)" }}>all wrapped up</span>.</>
          ) : (
            <>{totalLabel}, <span className="display-italic" style={{ color: "var(--live)" }}>{active.length} live</span>.</>
          )}
        </h1>
        <p className="mt-5" style={{ color: "var(--fg-2)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 660 }}>
          A log of every interview you&apos;ve participated in. To enter an active session, use
          the invite link your interviewer shared with you — it&apos;s a URL like{" "}
          <span className="mono" style={{ color: "var(--fg-1)" }}>acuity.app/join/XXXXXXXX</span>.
        </p>

        {/* Join card */}
        <form
          onSubmit={onJoinSubmit}
          className="mt-7"
          style={{
            background: "linear-gradient(135deg, var(--bg-1), oklch(0.78 0.14 230 / 0.10))",
            border: "1px solid var(--signal)",
            borderRadius: "var(--radius-lg)",
            padding: 20,
          }}
        >
          <div className="flex items-center gap-2">
            <Icon name="sparkle" size={14} color="var(--signal)" />
            <SectionLabel>Have an invite?</SectionLabel>
          </div>
          <p className="mt-2" style={{ color: "var(--fg-1)", fontSize: 13.5 }}>
            Paste the join code below to enter your session.
          </p>
          <div className="mt-4 flex items-center gap-2">
            <input
              className="input mono"
              style={{ flex: 1, fontSize: 13 }}
              placeholder="e.g. 7I1Q5K5Y"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
            />
            <button type="submit" className="btn btn-primary" disabled={!joinCode.trim()}>
              Join <Icon name="arrow-right" size={14} />
            </button>
          </div>
        </form>

        <div className="mt-10">
          <SectionLabel
            extra={
              sessions.length > 0
                ? `${sessions.length} session${sessions.length === 1 ? "" : "s"}`
                : undefined
            }
          >
            History
          </SectionLabel>

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
            {!loading && sessions.length === 0 && !error && (
              <div style={{ padding: 18, color: "var(--fg-2)", fontSize: 13 }}>
                No interviews yet. They&apos;ll appear here after your first session.
              </div>
            )}
            {sessions.map((s, i) => (
              <CandidateRow
                key={s.id}
                session={s}
                typeLabel={typeLabel(s.interview_type)}
                divider={i < sessions.length - 1}
                index={sessions.length - i}
              />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

function CandidateRow({
  session,
  typeLabel,
  divider,
  index,
}: {
  session: CandidateSessionLog;
  typeLabel: string;
  divider: boolean;
  index: number;
}) {
  const created = new Date(session.created_at);
  const statusKind: "live" | "signal" | "muted" =
    session.status === "active"
      ? "live"
      : session.status === "pending"
      ? "signal"
      : "muted";
  const isActive = session.status === "active";
  return (
    <div
      style={{
        padding: "14px 18px",
        borderBottom: divider ? "1px solid var(--line-1)" : "none",
      }}
    >
      <div
        className="grid items-center gap-3"
        style={{ gridTemplateColumns: "auto 1fr auto auto" }}
      >
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            background: "var(--bg-2)",
            border: "1px solid var(--line-1)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="code" size={14} color="var(--fg-1)" />
        </span>
        <div className="min-w-0">
          <div style={{ color: "var(--fg-0)", fontSize: 13.5 }}>{typeLabel}</div>
          <div className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5, marginTop: 2 }}>
            {created.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
            {" · "}
            {created.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
          </div>
        </div>
        <Pill kind={statusKind} pulse={isActive}>
          {session.status}
        </Pill>
        <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
          #{String(index).padStart(4, "0")}
        </span>
      </div>
      {isActive && (
        // Active = the interview is still running but the candidate isn't currently in the
        // IDE. Tell them they can rejoin via the original invite link the interviewer sent,
        // not by clicking here — that would bypass the admit flow.
        <div
          className="flex items-start gap-2"
          style={{
            marginTop: 10,
            marginLeft: 48,
            padding: "8px 12px",
            background: "var(--live-dim)",
            border: "1px dashed var(--live)",
            borderRadius: "var(--radius)",
            fontSize: 12,
            color: "var(--fg-1)",
            lineHeight: 1.5,
          }}
        >
          <Icon name="sparkle" size={12} color="var(--live)" />
          <span>
            This session is still running. To return, open the original invite link your
            interviewer sent you (
            <span className="mono" style={{ color: "var(--fg-2)" }}>acuity.app/join/XXXXXXXX</span>
            ).
          </span>
        </div>
      )}
    </div>
  );
}
