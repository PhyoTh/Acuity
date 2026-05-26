"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIInfoHeader from "@/components/Chat/AIInfoHeader";
import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import DisplayNameModal from "@/components/DisplayNameModal";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { RunResult } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

function nameConfirmedKey(sessionId: string): string {
  return `devlens:display-name-confirmed:${sessionId}`;
}

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

const PASTE_THRESHOLD = 40; // chars; larger pastes get flagged

interface Participant {
  profile_id: string;
  role: string;
  admitted: boolean;
  display_name: string;
}

// Candidate IDE: CodeSignal-style resizable layout.
//   ┌─────────┬───────────────────┬───────┐
//   │ Problem │ Editor            │ Chat  │
//   │  (left) ├───────────────────┤       │
//   │         │ Terminal          │       │
//   └─────────┴───────────────────┴───────┘
// All three outer columns are resizable; the editor/terminal vertical split is resizable too.
// Until the interviewer admits the candidate, the whole UI is replaced with a waiting screen.
export default function CandidateSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [language, setLanguage] = useState("python");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("connecting");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [budget, setBudget] = useState<{ used: number; budget: number; remaining: number } | null>(
    null,
  );
  const [notice, setNotice] = useState<string | null>(null);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [admitted, setAdmitted] = useState<boolean | null>(null);
  const [kicked, setKicked] = useState(false);
  const [ended, setEnded] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [nameReady, setNameReady] = useState(false);
  const [defaultName, setDefaultName] = useState("");
  const [aiModel, setAiModel] = useState<string>("");
  const [guardrailPreset, setGuardrailPreset] = useState<string>("");
  const [hallucinationPct, setHallucinationPct] = useState<number>(0);

  const socketRef = useRef<SessionSocket | null>(null);
  const codeRef = useRef("");
  const languageRef = useRef("python");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myProfileIdRef = useRef<string | null>(null);

  // Bootstrap: load profile + session config, decide whether to show the display-name modal.
  // The WS connection is gated on `nameReady` so the participant broadcast carries the final name.
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      const uid = data.session?.user.id ?? null;
      setToken(accessToken);
      setMyProfileId(uid);
      myProfileIdRef.current = uid;
      if (!accessToken) {
        setStatus("not signed in");
        return;
      }
      try {
        const [me, interview] = await Promise.all([api.me(), api.getSession(sessionId)]);
        if (!active) return;
        setDefaultName(me.display_name ?? "");
        if ("language" in interview) {
          setLanguage(interview.language);
          languageRef.current = interview.language;
        }
        if ("prompt" in interview) setPrompt(interview.prompt);
        if ("starting_code" in interview && interview.starting_code) {
          setCode(interview.starting_code);
          codeRef.current = interview.starting_code;
        }
        if ("token_budget" in interview && interview.token_budget > 0) {
          setBudget({
            used: 0,
            budget: interview.token_budget,
            remaining: interview.token_budget,
          });
        }
        if ("ai_model" in interview) setAiModel(interview.ai_model);
        if ("guardrail_preset" in interview) setGuardrailPreset(interview.guardrail_preset);
        if ("hallucination_pct" in interview) setHallucinationPct(interview.hallucination_pct);
      } catch {
        // non-fatal — proceed without prefill
      }
      const alreadyConfirmed = typeof window !== "undefined"
        && window.localStorage.getItem(nameConfirmedKey(sessionId)) === "1";
      if (alreadyConfirmed) setNameReady(true);
    })();
    return () => {
      active = false;
    };
  }, [sessionId]);

  // WS connect, gated on display-name confirmation.
  useEffect(() => {
    if (!token || !nameReady) return;
    let socket: SessionSocket | null = null;
    let active = true;

    function handleEvent(e: SessionEvent) {
      if (e.type === "ai_response") {
        const p = e.payload as { content: string };
        setMessages((m) => [...m, { role: "assistant", content: p.content }]);
        setBusy(false);
      } else if (e.type === "token_budget") {
        const p = e.payload as {
          used: number;
          budget: number;
          remaining: number;
          blocked?: boolean;
        };
        setBudget({ used: p.used, budget: p.budget, remaining: p.remaining });
        if (p.blocked) {
          setBusy(false);
          setNotice("AI token budget reached — no more AI help for this interview.");
        }
      } else if (e.type === "participants") {
        const p = e.payload as { participants: Participant[] };
        const me = p.participants.find((x) => x.profile_id === myProfileIdRef.current);
        if (me) setAdmitted(me.admitted);
      } else if (e.type === "kicked") {
        const p = e.payload as { profile_id: string };
        if (p.profile_id === myProfileIdRef.current) {
          setKicked(true);
          socketRef.current?.close();
        }
      } else if (e.type === "interview_ended") {
        // Interviewer ended the session. Candidate's IDE closes; they go back to their dashboard.
        setEnded(true);
        socketRef.current?.close();
      }
    }

    if (!active) return;
    socket = new SessionSocket(sessionId, token);
    socketRef.current = socket;
    socket.connect({
      onOpen: () => setStatus("connected"),
      onClose: () => setStatus("disconnected"),
      onEvent: handleEvent,
    });

    return () => {
      active = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      socket?.close();
    };
  }, [sessionId, token, nameReady]);

  async function confirmDisplayName(name: string) {
    await api.updateMe({ display_name: name });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(nameConfirmedKey(sessionId), "1");
    }
    setDefaultName(name);
    setNameReady(true);
  }

  function onCodeChange(value: string) {
    setCode(value);
    codeRef.current = value;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      socketRef.current?.send("code_change", { code: value, language: languageRef.current });
    }, 400);
  }

  function onPaste(length: number) {
    if (length >= PASTE_THRESHOLD) socketRef.current?.send("paste", { length });
  }

  function onSend(content: string) {
    if (budget && budget.remaining <= 0) {
      setNotice("AI token budget reached — no more AI help for this interview.");
      return;
    }
    setMessages((m) => [...m, { role: "user", content }]);
    setBusy(true);
    socketRef.current?.send("chat_message", { content, code: codeRef.current });
  }

  async function runCode() {
    setRunning(true);
    setNotice(null);
    try {
      setRunResult(await api.runCode(sessionId, codeRef.current));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  if (!nameReady && token) {
    return (
      <DisplayNameModal
        open
        defaultName={defaultName}
        onConfirm={confirmDisplayName}
      />
    );
  }

  if (ended) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">Interview ended</h1>
        <p className="text-sm text-neutral-400">
          Thanks for your time. The interviewer has wrapped up this session.
        </p>
        <button
          type="button"
          onClick={() => router.push("/candidate")}
          className="mx-auto rounded bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Go to dashboard
        </button>
      </main>
    );
  }

  if (kicked) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <h1 className="text-2xl font-bold">You were removed from the interview</h1>
        <p className="text-sm text-neutral-400">
          The interviewer ended your participation in this session.
        </p>
        <button
          type="button"
          onClick={() => router.push("/")}
          className="mx-auto rounded bg-white px-4 py-2 text-sm font-medium text-black"
        >
          Back to home
        </button>
      </main>
    );
  }

  if (admitted === false) {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-emerald-500/30" />
        <h1 className="text-2xl font-bold">Waiting for the interviewer…</h1>
        <p className="text-sm text-neutral-400">
          You&apos;ve joined the session. The interviewer needs to admit you before the interview
          starts. Keep this tab open.
        </p>
        <p className="text-xs text-neutral-600">Connection: {status}</p>
      </main>
    );
  }

  // From here on the candidate is admitted (or admit state hasn't loaded yet — we render the
  // IDE optimistically since the WS gate enforces correctness server-side).
  return (
    <main className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">Interview · {status}</h1>
        {budget && (
          <span className="text-xs text-neutral-400">
            AI tokens: {budget.used.toLocaleString()} / {budget.budget.toLocaleString()} (
            {budget.remaining.toLocaleString()} left)
          </span>
        )}
        {notice && <span className="text-xs text-amber-400">{notice}</span>}
      </header>
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="interview-candidate-h">
          <Panel
            defaultSize={22}
            minSize={5}
            collapsible
            collapsedSize={3}
            className="overflow-hidden"
          >
            <div className="flex h-full flex-col border-r border-neutral-800 bg-neutral-950">
              <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                Problem
              </div>
              <div className="flex-1 overflow-y-auto whitespace-pre-wrap p-3 text-sm text-neutral-200">
                {prompt || <span className="text-neutral-500">(no problem statement)</span>}
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-900 transition hover:bg-emerald-700" />
          <Panel defaultSize={53} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="interview-candidate-v">
              <Panel defaultSize={70} minSize={20}>
                <div className="flex h-full flex-col">
                  <div className="flex items-center gap-3 border-b border-neutral-800 px-3 py-1.5">
                    <button
                      type="button"
                      onClick={runCode}
                      disabled={running}
                      className="rounded bg-emerald-600 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {running ? "Running..." : "Run"}
                    </button>
                    {runResult && runResult.total > 0 && (
                      <span className="text-xs text-neutral-300">
                        {runResult.passed}/{runResult.total} tests passed
                      </span>
                    )}
                  </div>
                  <div className="flex-1">
                    <CodeEditor
                      value={code}
                      language={language}
                      onChange={onCodeChange}
                      onPaste={onPaste}
                    />
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-900 transition hover:bg-emerald-700" />
              <Panel defaultSize={30} minSize={8} collapsible collapsedSize={4}>
                <div className="flex h-full flex-col border-t border-neutral-800 bg-black">
                  <div className="flex items-center justify-between border-b border-neutral-800 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                    <span>Terminal</span>
                    {runResult && (
                      <span className="text-neutral-500">
                        exit {runResult.total > 0 ? `${runResult.passed}/${runResult.total}` : "ok"}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 overflow-auto p-2 font-mono text-xs">
                    {!runResult && (
                      <span className="text-neutral-600">Click Run to execute your code.</span>
                    )}
                    {runResult && runResult.total === 0 && (
                      <pre className="whitespace-pre-wrap text-neutral-300">
                        {runResult.stdout || runResult.stderr || "(no output)"}
                      </pre>
                    )}
                    {runResult && runResult.total > 0 && (
                      <ul className="space-y-1">
                        {runResult.results.map((r, i) => (
                          <li key={i}>
                            <span className={r.passed ? "text-emerald-400" : "text-red-400"}>
                              {r.passed ? "✓" : "✗"} {r.name}
                            </span>
                            {r.hidden && <span className="text-neutral-500"> (hidden)</span>}
                            {!r.hidden && !r.passed && (
                              <span className="text-neutral-500">
                                {" "}
                                expected <code>{r.expected}</code>, got <code>{r.actual}</code>
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-900 transition hover:bg-emerald-700" />
          <Panel
            defaultSize={25}
            minSize={5}
            collapsible
            collapsedSize={3}
            className="overflow-hidden"
          >
            <div className="flex h-full flex-col border-l border-neutral-800">
              <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                AI assistant
              </div>
              <AIInfoHeader
                model={aiModel}
                guardrailPreset={guardrailPreset}
                hallucinationPct={hallucinationPct}
              />
              <div className="flex-1 overflow-hidden">
                <ChatBox messages={messages} onSend={onSend} busy={busy} />
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>
      {/* Suppress unused-state warnings; myProfileId is captured into the ref for handlers. */}
      <span hidden>{myProfileId}</span>
    </main>
  );
}
