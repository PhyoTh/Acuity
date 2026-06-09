"use client";

import Link from "next/link";
import { useState } from "react";

import CreateSessionForm from "@/components/CreateSessionForm";
import { Icon, SectionLabel, Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import type { SessionConfig } from "@/lib/types";

// Standalone "create a new interview session" page. Reached from the dashboard's
// "+ New session" button. After creation, shows the candidate invite link and links
// back to the dashboard or directly to the live interviewer view.
export default function NewSessionPage() {
  const [created, setCreated] = useState<SessionConfig | null>(null);
  const [copied, setCopied] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const inviteUrl = created ? `${origin}/join/${created.join_code}` : "";

  function copyInvite() {
    if (!inviteUrl) return;
    void navigator.clipboard.writeText(inviteUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  }

  return (
    <main>
      {/* Topbar */}
      <header
        className="flex items-center justify-between"
        style={{ padding: "16px 32px", borderBottom: "1px solid var(--line-1)" }}
      >
        <div className="flex items-center gap-4">
          <Link href="/dashboard"><Wordmark size={16} /></Link>
          <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
          <SectionLabel>interviewer · new session</SectionLabel>
        </div>
        <Link href="/dashboard" className="btn btn-ghost btn-sm">
          <Icon name="chevron-left" size={14} /> Dashboard
        </Link>
      </header>

      <div style={{ maxWidth: 960, margin: "0 auto", padding: "32px 32px 80px" }}>
        {created ? (
          <SuccessCard
            inviteUrl={inviteUrl}
            sessionId={created.id}
            origin={origin}
            copied={copied}
            onCopy={copyInvite}
          />
        ) : (
          <CreateSessionForm onCreated={setCreated} />
        )}
      </div>
    </main>
  );
}

function SuccessCard({
  inviteUrl,
  sessionId,
  origin,
  copied,
  onCopy,
}: {
  inviteUrl: string;
  sessionId: string;
  origin: string;
  copied: boolean;
  onCopy: () => void;
}) {
  const [cohostUrl, setCohostUrl] = useState<string | null>(null);
  const [cohostCopied, setCohostCopied] = useState(false);
  const [cohostBusy, setCohostBusy] = useState(false);
  const [cohostError, setCohostError] = useState<string | null>(null);

  async function generateCohost() {
    setCohostBusy(true);
    setCohostError(null);
    try {
      const { interviewer_code } = await api.cohostLink(sessionId);
      setCohostUrl(`${origin}/join/${interviewer_code}`);
    } catch (e) {
      setCohostError(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setCohostBusy(false);
    }
  }

  function copyCohost() {
    if (!cohostUrl) return;
    void navigator.clipboard.writeText(cohostUrl).then(() => {
      setCohostCopied(true);
      setTimeout(() => setCohostCopied(false), 1600);
    });
  }

  return (
    <div className="flex flex-col items-center" style={{ paddingTop: 40 }}>
      <span
        style={{
          width: 64,
          height: 64,
          borderRadius: 999,
          background: "var(--live-dim)",
          border: "1px solid var(--live)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name="check" size={30} color="var(--live)" strokeWidth={2.2} />
      </span>
      <div className="display mt-5" style={{ fontSize: 40, color: "var(--fg-0)" }}>
        Session created.
      </div>
      <p className="mt-3 text-center" style={{ color: "var(--fg-2)", fontSize: 14.5, maxWidth: 520 }}>
        Share the candidate invite link below. The session goes live as soon as they join — you
        can watch it from the live view.
      </p>

      <div className="mt-7 w-full" style={{ maxWidth: 600 }}>
        <SectionLabel>Candidate invite link</SectionLabel>
        <div
          className="mt-2 flex items-center justify-between gap-3"
          style={{
            padding: "10px 12px",
            background: "var(--bg-0)",
            border: "1px solid var(--live)",
            borderRadius: "var(--radius)",
          }}
        >
          <code
            className="mono truncate"
            style={{ color: "var(--live)", fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
          >
            {inviteUrl}
          </code>
          <button onClick={onCopy} className="btn btn-sm">
            <Icon name="copy" size={12} /> {copied ? "Copied" : "Copy"}
          </button>
        </div>
        <p className="mt-1.5" style={{ color: "var(--fg-3)", fontSize: 11.5 }}>
          Only candidate accounts can join with this link.
        </p>
      </div>

      {/* Optional interviewer-only link for a co-interviewer who should observe, not solve. */}
      <div className="mt-5 w-full" style={{ maxWidth: 600 }}>
        <SectionLabel>Co-interviewer link (optional)</SectionLabel>
        {cohostUrl ? (
          <div
            className="mt-2 flex items-center justify-between gap-3"
            style={{
              padding: "10px 12px",
              background: "var(--bg-0)",
              border: "1px solid var(--line-2)",
              borderRadius: "var(--radius)",
            }}
          >
            <code
              className="mono truncate"
              style={{ color: "var(--fg-1)", fontSize: 12.5, flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}
            >
              {cohostUrl}
            </code>
            <button onClick={copyCohost} className="btn btn-sm">
              <Icon name="copy" size={12} /> {cohostCopied ? "Copied" : "Copy"}
            </button>
          </div>
        ) : (
          <div className="mt-2">
            <button
              onClick={generateCohost}
              className="btn btn-sm"
              disabled={cohostBusy}
              aria-disabled={cohostBusy}
            >
              {cohostBusy ? "Generating…" : "Generate interviewer link"}
            </button>
          </div>
        )}
        <p className="mt-1.5" style={{ color: "var(--fg-3)", fontSize: 11.5 }}>
          Only interviewer accounts can join with this link — they observe without taking the
          candidate seat.
        </p>
        {cohostError && (
          <p className="mono mt-1" style={{ color: "var(--bad)", fontSize: 11.5 }}>{cohostError}</p>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/dashboard" className="btn">Back to dashboard</Link>
        <a
          href={`/dashboard/${sessionId}`}
          target="_blank"
          rel="noopener"
          className="btn btn-primary"
        >
          Open live view <Icon name="arrow-right" size={14} />
        </a>
      </div>
    </div>
  );
}
