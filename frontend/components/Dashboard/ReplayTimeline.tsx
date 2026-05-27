"use client";

import { useMemo, useState } from "react";

import type { EventRow } from "@/lib/types";

// Activity event types: presence in any of these signals the candidate is active. Gaps between
// successive activity events that exceed `IDLE_THRESHOLD_MS` are rendered as idle bands.
const ACTIVITY_TYPES = new Set([
  "code_change",
  "cursor_move",
  "mouse_move",
  "chat_message",
  "code_run",
  "paste_flag",
]);
const IDLE_THRESHOLD_MS = 15_000;

interface IdleRange {
  startMs: number;
  endMs: number;
  durationMs: number;
}

interface TimelineMarker {
  atMs: number;
  type: string;
  label: string;
  color: string;
}

function formatGap(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

// Replay timeline for the interviewer's post-mortem. Mirrors YouTube's yellow ad bands but for
// candidate-idle periods: light grey track + amber idle bands + sticky "idle Xs" labels on hover.
// Also surfaces tab-switch and large-paste markers so the interviewer can scrub straight to
// suspicious moments. Pure-CSS, no media playback — the events feed is the truth.
export default function ReplayTimeline({ events }: { events: EventRow[] }) {
  const { startMs, endMs, idleRanges, markers, totalMs } = useMemo(() => {
    if (events.length === 0) {
      return { startMs: 0, endMs: 0, idleRanges: [], markers: [], totalMs: 0 };
    }
    const stamps = events.map((e) => new Date(e.created_at).getTime());
    const startMs = Math.min(...stamps);
    const endMs = Math.max(...stamps);
    const totalMs = Math.max(endMs - startMs, 1);

    // Compute idle ranges from the activity stream.
    const activityTimes: number[] = [];
    for (const e of events) {
      if (ACTIVITY_TYPES.has(e.type)) {
        activityTimes.push(new Date(e.created_at).getTime());
      }
    }
    activityTimes.sort((a, b) => a - b);
    const idleRanges: IdleRange[] = [];
    for (let i = 1; i < activityTimes.length; i += 1) {
      const gap = activityTimes[i] - activityTimes[i - 1];
      if (gap >= IDLE_THRESHOLD_MS) {
        idleRanges.push({
          startMs: activityTimes[i - 1],
          endMs: activityTimes[i],
          durationMs: gap,
        });
      }
    }

    // Notable event markers — keep them sparse so the bar reads at a glance.
    const markers: TimelineMarker[] = [];
    for (const e of events) {
      const t = new Date(e.created_at).getTime();
      if (e.type === "tab_switch") {
        const hidden = Boolean((e.payload as { hidden?: boolean }).hidden);
        if (hidden) {
          markers.push({ atMs: t, type: e.type, label: "tab hidden", color: "#ef4444" });
        }
      } else if (e.type === "paste_flag") {
        markers.push({ atMs: t, type: e.type, label: "large paste", color: "#f59e0b" });
      } else if (e.type === "code_run") {
        markers.push({ atMs: t, type: e.type, label: "ran code", color: "#10b981" });
      }
    }

    return { startMs, endMs, idleRanges, markers, totalMs };
  }, [events]);

  const [hoverPct, setHoverPct] = useState<number | null>(null);
  const [hoverLabel, setHoverLabel] = useState<string | null>(null);

  if (events.length === 0) {
    return (
      <p className="text-xs text-neutral-500">No events recorded for this session.</p>
    );
  }

  const idleTotalMs = idleRanges.reduce((acc, r) => acc + r.durationMs, 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-[11px] text-neutral-400">
        <span>
          Duration {formatGap(totalMs)} · {idleRanges.length} idle period
          {idleRanges.length === 1 ? "" : "s"} ({formatGap(idleTotalMs)} total)
        </span>
        <span className="text-neutral-500">15s+ no activity → idle</span>
      </div>
      <div
        className="relative h-7 w-full overflow-hidden rounded bg-neutral-800"
        onMouseLeave={() => {
          setHoverPct(null);
          setHoverLabel(null);
        }}
      >
        {/* Idle bands — YouTube-yellow analog, in amber so it doesn't clash with success green. */}
        {idleRanges.map((r, i) => {
          const left = ((r.startMs - startMs) / totalMs) * 100;
          const width = (r.durationMs / totalMs) * 100;
          return (
            <div
              key={`idle-${i}`}
              className="group absolute top-0 h-full bg-amber-500/70 hover:bg-amber-400"
              style={{ left: `${left}%`, width: `${Math.max(width, 0.3)}%` }}
              onMouseEnter={() => {
                setHoverPct(left + width / 2);
                setHoverLabel(`idle ${formatGap(r.durationMs)}`);
              }}
            >
              <div className="pointer-events-none absolute -top-7 left-1/2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-amber-500 px-1.5 py-0.5 text-[10px] font-semibold text-black group-hover:block">
                idle {formatGap(r.durationMs)}
              </div>
            </div>
          );
        })}
        {/* Notable markers (tab switches, pastes, runs). 2-px ticks on the track. */}
        {markers.map((m, i) => {
          const left = ((m.atMs - startMs) / totalMs) * 100;
          return (
            <div
              key={`mark-${i}`}
              className="group absolute top-0 h-full w-[2px]"
              style={{ left: `${left}%`, background: m.color }}
              onMouseEnter={() => {
                setHoverPct(left);
                setHoverLabel(m.label);
              }}
            />
          );
        })}
        {/* Hover label rendered once, repositioned by hoverPct. */}
        {hoverLabel && hoverPct !== null && (
          <div
            className="pointer-events-none absolute -top-7 z-10 -translate-x-1/2 whitespace-nowrap rounded bg-neutral-200 px-1.5 py-0.5 text-[10px] font-semibold text-black"
            style={{ left: `${hoverPct}%` }}
          >
            {hoverLabel}
          </div>
        )}
      </div>
      <div className="flex items-center gap-3 text-[10px] text-neutral-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 rounded bg-amber-500/70" /> idle
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-[2px] bg-red-500" /> tab hidden
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-[2px] bg-amber-500" /> large paste
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-[2px] bg-emerald-500" /> ran code
        </span>
      </div>
    </div>
  );
}
