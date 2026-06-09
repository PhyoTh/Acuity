"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { Icon } from "@/components/ui";
import type { SessionSummary } from "@/lib/types";

// Interactive month calendar for the interviewer dashboard. Highlights today and any day
// that has a `pending` (scheduled) session. Clicking a scheduled day opens a popover
// listing the sessions for that day with their join codes — click one to open it.
//
// Limitation: we don't have a `scheduled_at` column on `interview_sessions` yet, so we
// use `created_at` as a proxy. True scheduled-time support is on the
// "unwired" list.
export function ScheduleCalendar({
  sessions,
}: {
  sessions: SessionSummary[];
}) {
  const today = new Date();
  const [month, setMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [popoverDay, setPopoverDay] = useState<number | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  // Bucket pending sessions by day-of-month for the current view.
  const byDay = useMemo(() => {
    const buckets = new Map<number, SessionSummary[]>();
    for (const s of sessions) {
      if (s.status !== "pending") continue;
      const d = new Date(s.created_at);
      if (d.getFullYear() !== month.getFullYear() || d.getMonth() !== month.getMonth()) continue;
      const day = d.getDate();
      const list = buckets.get(day) ?? [];
      list.push(s);
      buckets.set(day, list);
    }
    return buckets;
  }, [sessions, month]);

  const isCurrentMonth = month.getFullYear() === today.getFullYear() && month.getMonth() === today.getMonth();
  const todayDay = isCurrentMonth ? today.getDate() : -1;

  // 6 weeks × 7 days = the full visible grid. First weekday offset + last day-of-month.
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay(); // 0=Sun..6=Sat
  const lastDate = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= lastDate; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const monthLabel = month.toLocaleDateString(undefined, { month: "short", year: "numeric" }).toUpperCase();
  const popoverSessions = popoverDay != null ? byDay.get(popoverDay) ?? [] : [];

  return (
    <div ref={wrapperRef} className="relative flex h-full flex-col">
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Previous month"
          onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)); setPopoverDay(null); }}
        >
          <Icon name="chevron-left" size={12} />
        </button>
        <span className="mono" style={{ color: "var(--fg-1)", fontSize: 11, letterSpacing: "0.08em" }}>
          {monthLabel}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          aria-label="Next month"
          onClick={() => { setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)); setPopoverDay(null); }}
        >
          <Icon name="chevron-right" size={12} />
        </button>
      </div>

      <div className="grid mono" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4, fontSize: 10, color: "var(--fg-3)", marginBottom: 4 }}>
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
          <span key={i} className="text-center" style={{ letterSpacing: "0.04em" }}>{d}</span>
        ))}
      </div>

      <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (d == null) return <span key={i} />;
          const isToday = d === todayDay;
          const scheduled = byDay.get(d);
          const isScheduled = !!scheduled && scheduled.length > 0;
          const isOpen = popoverDay === d;
          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                if (isScheduled) setPopoverDay(isOpen ? null : d);
              }}
              className="mono relative flex flex-col items-center justify-center"
              disabled={!isScheduled && !isToday}
              style={{
                height: 32,
                fontSize: 11,
                borderRadius: 4,
                background: isToday
                  ? "var(--live)"
                  : isScheduled
                  ? "var(--signal-dim)"
                  : "transparent",
                color: isToday
                  ? "oklch(0.10 0.01 155)"
                  : isScheduled
                  ? "var(--signal)"
                  : "var(--fg-2)",
                border: isOpen
                  ? "1px solid var(--signal)"
                  : isScheduled
                  ? "1px solid var(--signal)"
                  : "1px solid transparent",
                fontWeight: isToday ? 600 : 400,
                cursor: isScheduled ? "pointer" : "default",
                position: "relative",
              }}
            >
              {d}
              {isScheduled && (
                <span
                  className="mono tabular"
                  style={{
                    position: "absolute",
                    bottom: 2,
                    fontSize: 8,
                    color: isToday ? "oklch(0.10 0.01 155)" : "var(--signal)",
                    lineHeight: 1,
                  }}
                >
                  {scheduled!.length > 1 ? `${scheduled!.length}` : "•"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {popoverDay != null && (
        <SchedulePopover
          sessions={popoverSessions}
          dayLabel={new Date(month.getFullYear(), month.getMonth(), popoverDay).toLocaleDateString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
          })}
          onClose={() => setPopoverDay(null)}
        />
      )}
    </div>
  );
}

function SchedulePopover({
  sessions,
  dayLabel,
  onClose,
}: {
  sessions: SessionSummary[];
  dayLabel: string;
  onClose: () => void;
}) {
  return (
    <div
      // Backdrop is invisible but captures clicks-outside.
      style={{ position: "absolute", inset: 0, zIndex: 5 }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: "100%",
          left: "50%",
          transform: "translate(-50%, 8px)",
          minWidth: 280,
          maxWidth: 360,
          background: "var(--bg-0)",
          border: "1px solid var(--signal)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 24px 48px -16px black",
          padding: 12,
        }}
      >
        <div className="flex items-center justify-between">
          <div className="mono" style={{ fontSize: 10.5, color: "var(--signal)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
            {dayLabel}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="btn btn-ghost btn-sm"
            aria-label="Close"
            style={{ padding: 4 }}
          >
            <Icon name="x" size={12} />
          </button>
        </div>
        <ul className="mt-3 flex flex-col gap-2">
          {sessions.map((s) => {
            const time = new Date(s.created_at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
            return (
              <li key={s.id}>
                <Link
                  href={`/dashboard/${s.id}`}
                  className="flex items-start gap-3"
                  style={{
                    padding: "8px 10px",
                    background: "var(--bg-1)",
                    border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius)",
                    textDecoration: "none",
                  }}
                >
                  <span
                    className="mono tabular"
                    style={{ color: "var(--signal)", fontSize: 11, marginTop: 2, minWidth: 50 }}
                  >
                    {time}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate" style={{ color: "var(--fg-0)", fontSize: 12.5 }}>{s.title}</div>
                    <div className="mono mt-0.5" style={{ color: "var(--fg-3)", fontSize: 10 }}>
                      {s.interview_type} · {s.language} · {s.join_code}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="mono mt-3" style={{ color: "var(--fg-3)", fontSize: 9.5, letterSpacing: "0.04em", lineHeight: 1.4 }}>
          times shown from session creation — true scheduled-time support is coming.
        </p>
      </div>
    </div>
  );
}

export default ScheduleCalendar;
