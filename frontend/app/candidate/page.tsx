"use client";

import { useEffect, useState } from "react";

import { api } from "@/lib/api";
import { INTERVIEW_TYPES } from "@/lib/types";
import type { CandidateSessionLog } from "@/lib/types";

// Candidate dashboard — intentionally a bare log. The candidate sees what kind of interview
// they took and when; they never see the problem statement, their own code, the chat, or the
// scorecard. To enter an active interview, they use the original invite link.
export default function CandidateDashboard() {
  const [sessions, setSessions] = useState<CandidateSessionLog[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">Your interviews</h1>
      <p className="text-sm text-neutral-500">
        A log of the interviews you&apos;ve participated in. To enter an active interview, use
        the invite link your interviewer shared with you.
      </p>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}

        <ul className="space-y-2">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border border-neutral-800 p-3 text-sm"
            >
              <div>
                <div className="font-medium text-neutral-200">{typeLabel(s.interview_type)}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              <span
                className={`text-xs uppercase tracking-wider ${
                  s.status === "ended"
                    ? "text-neutral-500"
                    : s.status === "active"
                      ? "text-emerald-400"
                      : "text-amber-300"
                }`}
              >
                {s.status}
              </span>
            </li>
          ))}
          {!loading && sessions.length === 0 && !error && (
            <p className="text-sm text-neutral-500">
              No interviews yet. They&apos;ll appear here after your first session.
            </p>
          )}
        </ul>
      </section>
    </main>
  );
}
