"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { api } from "@/lib/api";
import type { SessionStatus, SessionSummary } from "@/lib/types";

const STATUS_OPTIONS: ("all" | SessionStatus)[] = ["all", "pending", "active", "ended"];

// Interviewer dashboard home: a searchable, filterable list of the interviewer's sessions.
// The create form lives on its own route (`/dashboard/new`) reached via the "+ New session" button.
export default function DashboardHome() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<"all" | SessionStatus>("all");

  useEffect(() => {
    api
      .listSessions()
      .then((rows) => {
        setSessions(rows);
        setError(null);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load sessions"))
      .finally(() => setLoading(false));
  }, []);

  const languages = useMemo(
    () => Array.from(new Set(sessions.map((s) => s.language))).sort(),
    [sessions],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sessions.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (language !== "all" && s.language !== language) return false;
      if (q && !s.title.toLowerCase().includes(q) && !s.join_code.toLowerCase().includes(q))
        return false;
      return true;
    });
  }, [sessions, query, language, statusFilter]);

  const field = "rounded bg-neutral-900 px-3 py-2 text-sm outline-none";

  return (
    <main className="mx-auto max-w-4xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Interviewer dashboard</h1>
        <Link
          href="/dashboard/new"
          className="rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
        >
          + New session
        </Link>
      </div>

      <section className="space-y-3 rounded border border-neutral-800 p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            className={field}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by title or join code…"
          />
          <select
            className={field}
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
          >
            <option value="all">All languages</option>
            {languages.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
          <select
            className={field}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "all" | SessionStatus)}
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
        {loading && <p className="text-sm text-neutral-500">Loading…</p>}

        <ul className="space-y-2">
          {filtered.map((s) => (
            <li
              key={s.id}
              className="flex items-center justify-between rounded border border-neutral-800 p-3 text-sm hover:border-neutral-700"
            >
              <div className="min-w-0">
                <Link href={`/dashboard/${s.id}`} className="font-medium underline">
                  {s.title}
                </Link>
                <div className="text-xs text-neutral-500">
                  {s.language} · {s.status} ·{" "}
                  {new Date(s.created_at).toLocaleString()}
                </div>
              </div>
              <code className="text-xs text-neutral-400">{s.join_code}</code>
            </li>
          ))}
          {!loading && filtered.length === 0 && !error && (
            <p className="text-sm text-neutral-500">
              {sessions.length === 0
                ? "No sessions yet — click + New session to create one."
                : "No sessions match the current filters."}
            </p>
          )}
        </ul>
      </section>
    </main>
  );
}
