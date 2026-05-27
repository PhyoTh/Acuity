"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import ReplayTimeline from "@/components/Dashboard/ReplayTimeline";
import ScorecardPanel from "@/components/Dashboard/Scorecard";
import type { EventRow, RunResult, Scorecard } from "@/lib/types";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

// Post-mortem summary the interviewer sees after `End interview` (or when clicking a past
// session from `/dashboard`). Scorecard-first, with collapsible sections for the rest of the
// interview artifacts. Read-only by definition.
export default function SummaryView({
  title,
  createdAt,
  endedAt,
  prompt,
  code,
  language,
  transcripts,
  lastRun,
  scorecard,
  scorecardLoading,
  events = [],
}: {
  title: string;
  createdAt: string;
  endedAt: string | null;
  prompt: string;
  code: string;
  language: string;
  transcripts: ChatMessage[];
  lastRun: RunResult | { passed: number; total: number } | null;
  scorecard: Scorecard | null;
  scorecardLoading: boolean;
  events?: EventRow[];
}) {
  const startedDate = createdAt ? new Date(createdAt) : null;
  const endedDate = endedAt ? new Date(endedAt) : null;

  return (
    <main className="min-h-screen bg-black">
      <header className="border-b border-neutral-800 px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-neutral-500">
              Session summary
            </div>
            <h1 className="mt-1 text-2xl font-bold">{title || "Untitled interview"}</h1>
            <div className="mt-1 text-xs text-neutral-500">
              {startedDate && <>Started {startedDate.toLocaleString()}</>}
              {endedDate && <> · ended {endedDate.toLocaleString()}</>}
            </div>
          </div>
          <Link
            href="/dashboard"
            className="shrink-0 text-sm text-neutral-400 underline hover:text-neutral-200"
          >
            ← Back to dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl space-y-4 p-6">
        {/* Replay timeline — idle gaps + tab switches + pastes + runs at a glance. */}
        {events.length > 0 && (
          <section className="rounded-lg border border-neutral-800 p-4">
            <h2 className="mb-2 text-sm font-semibold text-neutral-200">Replay timeline</h2>
            <ReplayTimeline events={events} />
          </section>
        )}
        {/* Scorecard — the headline */}
        <section className="rounded-lg border border-neutral-800 p-4">
          {scorecard ? (
            <ScorecardPanel scorecard={scorecard} />
          ) : (
            <div className="flex items-center gap-3 text-sm text-neutral-400">
              <span className="inline-block h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
              <div>
                <div className="font-semibold text-neutral-200">
                  {scorecardLoading ? "Generating scorecard…" : "Waiting for the scorecard…"}
                </div>
                <div className="text-xs text-neutral-500">
                  Claude is analyzing the transcript and code. This usually takes a few seconds.
                </div>
              </div>
            </div>
          )}
        </section>

        {/* Problem statement */}
        <details className="group rounded-lg border border-neutral-800" open>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            <span className="inline-block w-4 text-neutral-500 group-open:rotate-90 transition-transform">▸</span>
            Problem statement
          </summary>
          <div className="border-t border-neutral-800 px-4 py-3">
            <pre className="whitespace-pre-wrap text-sm text-neutral-200">
              {prompt || <span className="text-neutral-500">(no problem statement)</span>}
            </pre>
          </div>
        </details>

        {/* Final code */}
        <details className="group rounded-lg border border-neutral-800" open>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            <span className="inline-block w-4 text-neutral-500 group-open:rotate-90 transition-transform">▸</span>
            Final code
          </summary>
          <div className="border-t border-neutral-800">
            <div className="h-80">
              <CodeEditor value={code} language={language} readOnly />
            </div>
          </div>
        </details>

        {/* AI chat */}
        <details className="group rounded-lg border border-neutral-800" open>
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            <span className="inline-block w-4 text-neutral-500 group-open:rotate-90 transition-transform">▸</span>
            AI chat ({transcripts.length} {transcripts.length === 1 ? "turn" : "turns"})
          </summary>
          <div className="border-t border-neutral-800" style={{ minHeight: 200 }}>
            <div className="h-96">
              <ChatBox messages={transcripts} readOnly />
            </div>
          </div>
        </details>

        {/* Terminal */}
        <details className="group rounded-lg border border-neutral-800">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            <span className="inline-block w-4 text-neutral-500 group-open:rotate-90 transition-transform">▸</span>
            Terminal (last run)
          </summary>
          <div className="border-t border-neutral-800 bg-black px-4 py-3 font-mono text-xs">
            {lastRun && "total" in lastRun && lastRun.total > 0 ? (
              <span className="text-neutral-300">
                {lastRun.passed}/{lastRun.total} tests passed
              </span>
            ) : (
              <span className="text-neutral-600">No test runs recorded.</span>
            )}
          </div>
        </details>
      </div>
    </main>
  );
}
