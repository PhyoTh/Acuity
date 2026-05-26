"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { RunResult } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

const PASTE_THRESHOLD = 40; // chars; larger pastes get flagged

// Candidate IDE: Monaco editor (code_change + paste detection) + AI chat + Run (code execution).
export default function CandidateSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [language, setLanguage] = useState("python");
  const [prompt, setPrompt] = useState("");
  const [code, setCode] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [status, setStatus] = useState("connecting");
  const [busy, setBusy] = useState(false);
  const [running, setRunning] = useState(false);
  const [runResult, setRunResult] = useState<RunResult | null>(null);
  const [quota, setQuota] = useState<{ remaining: number; quota: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const socketRef = useRef<SessionSocket | null>(null);
  const codeRef = useRef("");
  const languageRef = useRef("python");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let socket: SessionSocket | null = null;
    let active = true;

    function handleEvent(e: SessionEvent) {
      if (e.type === "ai_response") {
        const p = e.payload as { content: string };
        setMessages((m) => [...m, { role: "assistant", content: p.content }]);
        setBusy(false);
      } else if (e.type === "quota") {
        const p = e.payload as { remaining: number; quota: number; blocked?: boolean };
        setQuota({ remaining: p.remaining, quota: p.quota });
        if (p.blocked) {
          setBusy(false);
          setNotice("AI query quota reached — no more AI help for this interview.");
        }
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
        if ("language" in interview) {
          setLanguage(interview.language);
          languageRef.current = interview.language;
        }
        if ("prompt" in interview) setPrompt(interview.prompt);
        if ("starting_code" in interview && interview.starting_code) {
          setCode(interview.starting_code);
          codeRef.current = interview.starting_code;
        }
        if ("query_quota" in interview && interview.query_quota > 0) {
          setQuota({ remaining: interview.query_quota, quota: interview.query_quota });
        }
      } catch {
        // non-fatal
      }
      if (!active) return;
      socket = new SessionSocket(sessionId, token);
      socketRef.current = socket;
      socket.connect({
        onOpen: () => setStatus("connected"),
        onClose: () => setStatus("disconnected"),
        onEvent: handleEvent,
      });
    })();

    return () => {
      active = false;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      socket?.close();
    };
  }, [sessionId]);

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
    if (quota && quota.remaining <= 0) {
      setNotice("AI query quota reached — no more AI help for this interview.");
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

  return (
    <main className="flex h-screen flex-col">
      <header className="border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">Interview · {status}</h1>
        {prompt && <p className="mt-1 text-xs text-neutral-400">{prompt}</p>}
      </header>
      <div className="grid flex-1 grid-cols-[1fr_380px] overflow-hidden">
        <div className="flex flex-col border-r border-neutral-800">
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
            <CodeEditor value={code} language={language} onChange={onCodeChange} onPaste={onPaste} />
          </div>
          {runResult && (
            <div className="max-h-48 overflow-y-auto border-t border-neutral-800 p-2 text-xs">
              {runResult.total === 0 ? (
                <pre className="whitespace-pre-wrap text-neutral-300">
                  {runResult.stdout || runResult.stderr || "(no output)"}
                </pre>
              ) : (
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
          )}
        </div>
        <div className="flex flex-col overflow-hidden">
          {(quota || notice) && (
            <div className="border-b border-neutral-800 px-3 py-1.5 text-xs">
              {quota && (
                <span className="text-neutral-400">
                  AI queries left: {quota.remaining}/{quota.quota}
                </span>
              )}
              {notice && <span className="ml-2 text-amber-400">{notice}</span>}
            </div>
          )}
          <div className="flex-1 overflow-hidden">
            <ChatBox messages={messages} onSend={onSend} busy={busy} />
          </div>
        </div>
      </div>
    </main>
  );
}
