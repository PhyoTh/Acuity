"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import ScorecardPanel from "@/components/Dashboard/Scorecard";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { Scorecard } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

interface Snapshot {
  code: string;
  at: string;
}

// Interviewer's hidden live view: read-only mirror of code + chat (with hallucination flag),
// cheat/run indicators, push-back questions, replay timeline, and the post-interview scorecard.
export default function InterviewerSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [status, setStatus] = useState("connecting");
  const [pushback, setPushback] = useState<string[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ passed: number; total: number } | null>(null);
  const [replay, setReplay] = useState<{ snapshots: Snapshot[]; index: number } | null>(null);
  const socketRef = useRef<SessionSocket | null>(null);

  useEffect(() => {
    let socket: SessionSocket | null = null;
    let active = true;

    function handleEvent(e: SessionEvent) {
      if (e.type === "code_change") {
        const p = e.payload as { code?: string; language?: string };
        if (typeof p.code === "string") setCode(p.code);
        if (p.language) setLanguage(p.language);
      } else if (e.type === "chat_message") {
        const p = e.payload as { content: string };
        setMessages((m) => [...m, { role: "user", content: p.content }]);
      } else if (e.type === "ai_response") {
        const p = e.payload as { content: string; was_hallucinated?: boolean };
        setMessages((m) => [
          ...m,
          { role: "assistant", content: p.content, was_hallucinated: p.was_hallucinated },
        ]);
      } else if (e.type === "code_run") {
        setLastRun(e.payload as { passed: number; total: number });
      } else if (e.type === "paste_flag") {
        setPasteCount((c) => c + 1);
      } else if (e.type === "pushback") {
        setPushback((e.payload as { questions: string[] }).questions);
      } else if (e.type === "scorecard_ready") {
        api.getScorecard(sessionId).then(setScorecard).catch(() => undefined);
      }
    }

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) {
        setStatus("not signed in");
        return;
      }
      try {
        const interview = await api.getSession(sessionId);
        if ("language" in interview) setLanguage(interview.language);
        if ("starting_code" in interview && interview.starting_code) setCode(interview.starting_code);
      } catch {
        // non-fatal
      }
      if (!active) return;
      socket = new SessionSocket(sessionId, token);
      socketRef.current = socket;
      socket.connect({
        onOpen: () => setStatus("live"),
        onClose: () => setStatus("disconnected"),
        onEvent: handleEvent,
      });
    })();

    return () => {
      active = false;
      socket?.close();
    };
  }, [sessionId]);

  function endInterview() {
    socketRef.current?.send("interview_end", {});
  }

  async function loadReplay() {
    const events = await api.getEvents(sessionId);
    const snapshots: Snapshot[] = events
      .filter((e) => e.type === "code_change" && typeof e.payload.code === "string")
      .map((e) => ({ code: e.payload.code as string, at: e.created_at }));
    if (snapshots.length > 0) setReplay({ snapshots, index: snapshots.length - 1 });
  }

  const editorValue = replay ? (replay.snapshots[replay.index]?.code ?? "") : code;

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">Interviewer view · {status}</h1>
        {lastRun && lastRun.total > 0 && (
          <span className="text-xs text-neutral-300">
            last run {lastRun.passed}/{lastRun.total}
          </span>
        )}
        {pasteCount > 0 && (
          <span className="text-xs font-semibold text-amber-400">⚠ {pasteCount} large paste(s)</span>
        )}
        <div className="ml-auto flex gap-2">
          {replay ? (
            <button
              type="button"
              onClick={() => setReplay(null)}
              className="rounded border border-neutral-700 px-3 py-1 text-sm"
            >
              Back to live
            </button>
          ) : (
            <button
              type="button"
              onClick={loadReplay}
              className="rounded border border-neutral-700 px-3 py-1 text-sm"
            >
              Replay
            </button>
          )}
          <button
            type="button"
            onClick={endInterview}
            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white"
          >
            End interview
          </button>
        </div>
      </header>

      {replay && (
        <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-1.5 text-xs">
          <span className="text-neutral-400">Replay</span>
          <input
            type="range"
            min={0}
            max={replay.snapshots.length - 1}
            value={replay.index}
            onChange={(e) => setReplay({ ...replay, index: Number(e.target.value) })}
            className="flex-1"
          />
          <span className="text-neutral-500">
            {replay.index + 1}/{replay.snapshots.length} ·{" "}
            {new Date(replay.snapshots[replay.index]?.at ?? "").toLocaleTimeString()}
          </span>
        </div>
      )}

      <div className="grid flex-1 grid-cols-[1fr_380px] overflow-hidden">
        <div className="border-r border-neutral-800">
          <CodeEditor value={editorValue} language={language} readOnly />
        </div>
        <div className="flex flex-col overflow-hidden">
          <div className="flex-1 overflow-hidden">
            <ChatBox messages={messages} readOnly />
          </div>
          {pushback.length > 0 && (
            <div className="border-t border-neutral-800 p-3">
              <h3 className="mb-1 text-xs font-semibold text-neutral-300">
                Suggested push-back questions
              </h3>
              <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-400">
                {pushback.map((q, i) => (
                  <li key={i}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          {scorecard && (
            <div className="border-t border-neutral-800 p-3">
              <ScorecardPanel scorecard={scorecard} />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
