"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

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

interface Participant {
  profile_id: string;
  role: string;
  admitted: boolean;
  display_name: string;
}

// Interviewer's hidden live view: same CodeSignal-style resizable layout as the candidate, but
// the editor is read-only and the right column hosts the participants panel (admit/kick),
// chat mirror (with hallucination flag), push-back suggestions, and the final scorecard.
export default function InterviewerSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [language, setLanguage] = useState("python");
  const [code, setCode] = useState("");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [status, setStatus] = useState("connecting");
  const [pushback, setPushback] = useState<string[]>([]);
  const [pasteCount, setPasteCount] = useState(0);
  const [lastRun, setLastRun] = useState<{ passed: number; total: number } | null>(null);
  const [replay, setReplay] = useState<{ snapshots: Snapshot[]; index: number } | null>(null);
  const [budget, setBudget] = useState<{ used: number; budget: number; remaining: number } | null>(
    null,
  );
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
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
      } else if (e.type === "token_budget") {
        const p = e.payload as { used: number; budget: number; remaining: number };
        setBudget({ used: p.used, budget: p.budget, remaining: p.remaining });
      } else if (e.type === "participants") {
        setParticipants((e.payload as { participants: Participant[] }).participants);
      } else if (e.type === "scorecard_ready") {
        api.getScorecard(sessionId).then(setScorecard).catch(() => undefined);
      }
    }

    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      setMyProfileId(data.session?.user.id ?? null);
      if (!token) {
        setStatus("not signed in");
        return;
      }
      try {
        const interview = await api.getSession(sessionId);
        if ("language" in interview) setLanguage(interview.language);
        if ("starting_code" in interview && interview.starting_code) setCode(interview.starting_code);
        if ("prompt" in interview) setPrompt(interview.prompt);
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

  function admit(profileId: string) {
    socketRef.current?.send("admit", { profile_id: profileId });
  }

  function kick(profileId: string) {
    if (!confirm("Remove this participant from the session?")) return;
    socketRef.current?.send("kick", { profile_id: profileId });
  }

  async function loadReplay() {
    const events = await api.getEvents(sessionId);
    const snapshots: Snapshot[] = events
      .filter((e) => e.type === "code_change" && typeof e.payload.code === "string")
      .map((e) => ({ code: e.payload.code as string, at: e.created_at }));
    if (snapshots.length > 0) setReplay({ snapshots, index: snapshots.length - 1 });
  }

  const editorValue = replay ? (replay.snapshots[replay.index]?.code ?? "") : code;
  const waitingCandidates = participants.filter((p) => p.role === "candidate" && !p.admitted);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">Interviewer view · {status}</h1>
        {budget && (
          <span className="text-xs text-neutral-400">
            AI tokens: {budget.used.toLocaleString()}/{budget.budget.toLocaleString()}
          </span>
        )}
        {lastRun && lastRun.total > 0 && (
          <span className="text-xs text-neutral-300">
            last run {lastRun.passed}/{lastRun.total}
          </span>
        )}
        {pasteCount > 0 && (
          <span className="text-xs font-semibold text-amber-400">
            ⚠ {pasteCount} large paste(s)
          </span>
        )}
        {waitingCandidates.length > 0 && (
          <span className="text-xs font-semibold text-amber-300">
            {waitingCandidates.length} waiting to be admitted
          </span>
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

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="interview-interviewer-h">
          <Panel defaultSize={22} minSize={5} collapsible collapsedSize={3}>
            <PanelGroup direction="vertical" autoSaveId="interview-interviewer-left">
              <Panel defaultSize={55} minSize={15}>
                <div className="flex h-full flex-col border-r border-neutral-800 bg-neutral-950">
                  <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Problem
                  </div>
                  <div className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-sm text-neutral-200">
                    {prompt || (
                      <span className="text-neutral-500">(no problem statement)</span>
                    )}
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-900 transition hover:bg-emerald-700" />
              <Panel defaultSize={45} minSize={10}>
                <div className="flex h-full flex-col border-r border-t border-neutral-800 bg-neutral-950">
                  <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    Participants ({participants.length})
                  </div>
                  <ul className="flex-1 space-y-1 overflow-y-auto p-2 text-xs">
                    {participants.map((p) => {
                      const isMe = p.profile_id === myProfileId;
                      const isWaiting = !p.admitted && p.role === "candidate";
                      return (
                        <li
                          key={p.profile_id}
                          className="rounded border border-neutral-800 p-2"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="min-w-0">
                              <div className="truncate font-medium text-neutral-200">
                                {p.display_name}
                                {isMe && (
                                  <span className="ml-1 text-neutral-500">(you)</span>
                                )}
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
                                    onClick={() => admit(p.profile_id)}
                                    className="rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-semibold text-white"
                                  >
                                    Admit
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => kick(p.profile_id)}
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
                      <li className="text-neutral-500">No one in this session yet.</li>
                    )}
                  </ul>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-900 transition hover:bg-emerald-700" />
          <Panel defaultSize={53} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="interview-interviewer-v">
              <Panel defaultSize={70} minSize={20}>
                <div className="h-full">
                  <CodeEditor value={editorValue} language={language} readOnly />
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-900 transition hover:bg-emerald-700" />
              <Panel defaultSize={30} minSize={8} collapsible collapsedSize={4}>
                <div className="flex h-full flex-col border-t border-neutral-800 bg-black">
                  <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    <span>Terminal (candidate runs)</span>
                    {lastRun && (
                      <span className="text-neutral-500">
                        last {lastRun.passed}/{lastRun.total}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-2 font-mono text-xs text-neutral-500">
                    {lastRun
                      ? `Candidate's last run: ${lastRun.passed}/${lastRun.total} tests passed.`
                      : "Waiting for the candidate to click Run…"}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-900 transition hover:bg-emerald-700" />
          <Panel defaultSize={25} minSize={5} collapsible collapsedSize={3}>
            <div className="flex h-full flex-col border-l border-neutral-800">
              <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                AI chat (mirror)
              </div>
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
          </Panel>
        </PanelGroup>
      </div>
    </main>
  );
}
