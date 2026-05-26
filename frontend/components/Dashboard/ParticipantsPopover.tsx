"use client";

import { useEffect, useRef, useState } from "react";

export interface Participant {
  profile_id: string;
  role: string;
  admitted: boolean;
  display_name: string;
}

// Compact participant button + popover. Shown on the interviewer header instead of a sidebar
// panel. The button shows total count and badges the number of candidates waiting to be admitted.
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
        className="flex items-center gap-1.5 rounded border border-neutral-700 px-2 py-1 text-sm hover:border-neutral-500"
        aria-label="Show participants"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4"
        >
          <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
        <span>{participants.length}</span>
        {waiting > 0 && (
          <span className="ml-1 rounded-full bg-amber-500 px-1.5 text-[10px] font-semibold text-black">
            {waiting} waiting
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-neutral-800 bg-neutral-950 p-2 shadow-lg">
          <div className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-neutral-400">
            Participants ({participants.length})
          </div>
          <ul className="max-h-72 space-y-1 overflow-y-auto">
            {participants.map((p) => {
              const isMe = p.profile_id === myProfileId;
              const isWaiting = !p.admitted && p.role === "candidate";
              return (
                <li
                  key={p.profile_id}
                  className="rounded border border-neutral-800 p-2 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-neutral-200">
                        {p.display_name}
                        {isMe && <span className="ml-1 text-neutral-500">(you)</span>}
                      </div>
                      <div className="text-[10px] uppercase tracking-wider text-neutral-500">
                        {p.role}
                        {isWaiting ? " · waiting" : p.admitted ? " · admitted" : ""}
                      </div>
                    </div>
                    {!isMe && (
                      <div className="flex shrink-0 gap-1">
                        {isWaiting && (
                          <button
                            type="button"
                            onClick={() => onAdmit(p.profile_id)}
                            className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                          >
                            Admit
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onKick(p.profile_id)}
                          className="rounded border border-red-700 px-2 py-0.5 text-[10px] text-red-300"
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
              <li className="px-2 py-1 text-neutral-500">No one in this session yet.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
