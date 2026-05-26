"use client";

import Link from "next/link";
import { useState } from "react";

import CreateSessionForm from "@/components/CreateSessionForm";
import type { SessionConfig } from "@/lib/types";

// Standalone "create a new interview session" page. Reached from the dashboard's
// "+ New session" button. After creation, shows the candidate invite link and links
// back to the dashboard or directly to the live interviewer view.
export default function NewSessionPage() {
  const [created, setCreated] = useState<SessionConfig | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">New interview session</h1>
        <Link href="/dashboard" className="text-sm text-neutral-400 underline">
          ← Back to dashboard
        </Link>
      </div>

      {created ? (
        <div className="space-y-4 rounded border border-green-800 bg-green-950/40 p-5 text-sm">
          <div>
            <h2 className="text-base font-semibold text-green-300">Session created.</h2>
            <p className="mt-1 text-neutral-300">
              Share the candidate invite link below. You can open the live view to watch as
              the candidate joins.
            </p>
          </div>
          <code className="block break-all rounded bg-neutral-900 px-3 py-2 text-green-300">
            {origin}/join/{created.join_code}
          </code>
          <div className="flex gap-3">
            <Link
              href={`/dashboard/${created.id}`}
              className="rounded bg-white px-4 py-2 text-sm font-medium text-black"
            >
              Open live view
            </Link>
            <Link
              href="/dashboard"
              className="rounded border border-neutral-700 px-4 py-2 text-sm"
            >
              Back to dashboard
            </Link>
          </div>
        </div>
      ) : (
        <CreateSessionForm onCreated={setCreated} />
      )}
    </main>
  );
}
