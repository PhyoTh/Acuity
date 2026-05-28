"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, Icon, Pill, SectionLabel } from "@/components/ui";

export interface Participant {
  profile_id: string;
  role: string;
  admitted: boolean;
  display_name: string;
  // Server-tracked: true iff a WS is currently open from this profile. Older sessions
  // (or sessions running against an older backend) may omit this field, so treat
  // missing as "we don't know" and fall back to admitted-as-presence.
  connected?: boolean;
}

// Compact participant button + popover. Shown on the interviewer header instead of a sidebar
// panel. The count badge now reflects participants who are CURRENTLY connected (have an open
// WS), not everyone who has ever joined — so the moment a candidate closes their tab the
// number drops without waiting for an explicit "leave" action.
export default function ParticipantsPopover({
  participants,
  myProfileId,
  onAdmit,
  onKick,
}: {
  participants: Participant[];
  myProfileId: string | null;
  onAdmit: (profileId: string) => void;
  onKick: (profileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const waiting = participants.filter((p) => p.role === "candidate" && !p.admitted).length;
  // Count = connected admitted participants. If `connected` is undefined (older backend
  // payload), fall back to counting admitted participants so the badge isn't blank.
  const liveCount = participants.filter((p) => {
    if (!p.admitted) return false;
    return p.connected ?? true;
  }).length;

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-sm"
        aria-label="Show participants"
      >
        <Icon name="users" size={14} />
        <span className="mono tabular" style={{ fontSize: 12 }}>{liveCount}</span>
        {waiting > 0 && (
          <span
            className="mono ml-1"
            style={{
              background: "var(--warn)",
              color: "oklch(0.10 0.01 75)",
              fontSize: 9.5,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 999,
              letterSpacing: "0.04em",
            }}
          >
            {waiting} WAITING
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 z-40 mt-2"
          style={{
            width: 300,
            background: "var(--bg-1)",
            border: "1px solid var(--line-1)",
            borderRadius: "var(--radius-lg)",
            padding: 10,
            boxShadow: "0 24px 48px -16px black",
          }}
        >
          <div style={{ padding: "4px 6px 8px" }}>
            <SectionLabel
              extra={`${liveCount} live · ${participants.length} joined`}
            >
              Participants
            </SectionLabel>
          </div>
          <ul className="space-y-1.5" style={{ maxHeight: 320, overflowY: "auto" }}>
            {participants.map((p) => {
              const isMe = p.profile_id === myProfileId;
              const isWaiting = !p.admitted && p.role === "candidate";
              const isConnected = p.connected ?? true;
              const isLeft = p.admitted && !isConnected;
              return (
                <li
                  key={p.profile_id}
                  style={{
                    padding: 8,
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius)",
                    opacity: isLeft ? 0.55 : 1,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <Avatar name={p.display_name} size={22} />
                      <div className="min-w-0">
                        <div
                          className="truncate"
                          style={{ color: "var(--fg-0)", fontSize: 12.5 }}
                        >
                          {p.display_name}
                          {isMe && (
                            <span className="mono ml-1" style={{ color: "var(--fg-3)", fontSize: 10 }}>
                              (you)
                            </span>
                          )}
                        </div>
                        <div
                          className="mono mt-0.5 flex items-center gap-1.5"
                          style={{
                            color: "var(--fg-3)",
                            fontSize: 9.5,
                            letterSpacing: "0.06em",
                            textTransform: "uppercase",
                          }}
                        >
                          {p.role}
                          {isWaiting && <span style={{ color: "var(--warn)" }}>· waiting</span>}
                          {isLeft && <span style={{ color: "var(--fg-3)" }}>· left</span>}
                          {!isWaiting && !isLeft && p.admitted && (
                            <span style={{ color: "var(--live)" }}>· in session</span>
                          )}
                        </div>
                      </div>
                    </div>
                    {!isMe && (
                      <div className="flex shrink-0 gap-1.5">
                        {isWaiting && (
                          <button
                            type="button"
                            onClick={() => onAdmit(p.profile_id)}
                            className="btn btn-primary btn-sm"
                            style={{ fontSize: 10.5 }}
                          >
                            Admit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onKick(p.profile_id)}
                          className="btn btn-danger btn-sm"
                          style={{ fontSize: 10.5 }}
                        >
                          Kick
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
            {participants.length === 0 && (
              <li
                className="mono"
                style={{ padding: "8px 10px", color: "var(--fg-3)", fontSize: 11 }}
              >
                No one in this session yet.
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

// Suppress unused — Pill is exported for callers who want to render their own status pills
// adjacent to this component. (Kept the import so future tweaks don't have to re-add it.)
void Pill;
