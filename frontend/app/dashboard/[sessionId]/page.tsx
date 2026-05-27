"use client";

import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIInfoHeader from "@/components/Chat/AIInfoHeader";
import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import ParticipantsPopover, { type Participant } from "@/components/Dashboard/ParticipantsPopover";
import SummaryView from "@/components/Dashboard/SummaryView";
import DisplayNameModal from "@/components/DisplayNameModal";
import MultiFileEditor, { type MultiFile } from "@/components/Editor/MultiFileEditor";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { EventRow, Scorecard } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

function nameConfirmedKey(sessionId: string): string {
  return `devlens:display-name-confirmed:${sessionId}`;
}

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });


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
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [tabHidden, setTabHidden] = useState(false);
  const [remoteCursor, setRemoteCursor] = useState<{ line: number; column: number } | null>(null);
  const [files, setFiles] = useState<MultiFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState(false);
  const [shellHistory, setShellHistory] = useState<
    { command: string; stdout: string; stderr: string }[]
  >([]);
  const [lastRun, setLastRun] = useState<{ passed: number; total: number } | null>(null);
  const [budget, setBudget] = useState<{ used: number; budget: number; remaining: number } | null>(
    null,
  );
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [nameReady, setNameReady] = useState(false);
  const [defaultName, setDefaultName] = useState("");
  const [ended, setEnded] = useState(false);
  const [transcripts, setTranscripts] = useState<ChatMessage[] | null>(null);
  const [summaryEvents, setSummaryEvents] = useState<EventRow[]>([]);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [aiModel, setAiModel] = useState<string>("");
  const [guardrailPreset, setGuardrailPreset] = useState<string>("");
  const [guardrailPresets, setGuardrailPresets] = useState<string[]>([]);
  const [hallucinationPct, setHallucinationPct] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const socketRef = useRef<SessionSocket | null>(null);

  const loadSummary = useCallback(async () => {
    // Fetch the post-mortem data: chat history, final code snapshot, last run, scorecard (may 404).
    try {
      const [turns, events] = await Promise.all([
        api.getTranscripts(sessionId),
        api.getEvents(sessionId),
      ]);
      setTranscripts(
        turns.map((t) => ({
          role: t.role,
          content: t.content,
          was_hallucinated: t.was_hallucinated,
        })),
      );
      setSummaryEvents(events);
      const codeChanges = events.filter(
        (e) => e.type === "code_change" && typeof e.payload.code === "string",
      );
      if (codeChanges.length > 0) {
        setCode(codeChanges[codeChanges.length - 1].payload.code as string);
      }
      const runs = events.filter((e) => e.type === "code_run");
      const lastRunEvent = runs[runs.length - 1];
      if (lastRunEvent) {
        setLastRun(lastRunEvent.payload as { passed: number; total: number });
      }
    } catch {
      // non-fatal
    }
    setScorecardLoading(true);
    try {
      const card = await api.getScorecard(sessionId);
      setScorecard(card);
    } catch {
      // 404 — not ready yet; the `scorecard_ready` WS event will refetch when it's done.
    } finally {
      setScorecardLoading(false);
    }
  }, [sessionId]);

  // Bootstrap: load profile + session config, decide whether to show the display-name modal,
  // and detect a session that's already ended (clicked from /dashboard list).
  useEffect(() => {
    let active = true;
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token ?? null;
      const uid = data.session?.user.id ?? null;
      setToken(accessToken);
      setMyProfileId(uid);
      if (!accessToken) {
        setStatus("not signed in");
        return;
      }
      try {
        const [me, interview] = await Promise.all([api.me(), api.getSession(sessionId)]);
        if (!active) return;
        setDefaultName(me.display_name ?? "");
        if ("language" in interview) setLanguage(interview.language);
        if ("starting_code" in interview && interview.starting_code) setCode(interview.starting_code);
        if ("prompt" in interview) setPrompt(interview.prompt);
        if ("title" in interview) setTitle(interview.title);
        if ("created_at" in interview) setCreatedAt(interview.created_at);
        if ("ended_at" in interview) setEndedAt(interview.ended_at);
        if ("ai_model" in interview) setAiModel(interview.ai_model);
        if ("guardrail_preset" in interview) setGuardrailPreset(interview.guardrail_preset);
        if ("guardrail_presets" in interview && Array.isArray(interview.guardrail_presets)) {
          setGuardrailPresets(interview.guardrail_presets);
        }
        if ("hallucination_pct" in interview) setHallucinationPct(interview.hallucination_pct);
        if ("status" in interview && interview.status === "ended") {
          setEnded(true);
          // Summary mode is read-only — no live broadcast, no participant panel — so a display
          // name isn't needed. Skip the modal entirely; data loads directly.
          setNameReady(true);
          void loadSummary();
        }
      } catch {
        // non-fatal
      }
      try {
        const list = await api.listFiles(sessionId);
        if (!active) return;
        if (list.length > 0) {
          setFiles(list);
          setHasFiles(true);
          const firstFile = list.find((f) => !f.is_folder);
          if (firstFile) setActivePath(firstFile.path);
        }
      } catch {
        // non-fatal
      }
      const alreadyConfirmed = typeof window !== "undefined"
        && window.localStorage.getItem(nameConfirmedKey(sessionId)) === "1";
      if (alreadyConfirmed) setNameReady(true);
    })();
    return () => {
      active = false;
    };
  }, [sessionId, loadSummary]);

  // WS connect, gated on display-name confirmation.
  useEffect(() => {
    if (!token || !nameReady) return;
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
        setAiBusy(true);
      } else if (e.type === "ai_response") {
        const p = e.payload as { content: string; was_hallucinated?: boolean };
        setMessages((m) => [
          ...m,
          { role: "assistant", content: p.content, was_hallucinated: p.was_hallucinated },
        ]);
        setAiBusy(false);
      } else if (e.type === "code_run") {
        setLastRun(e.payload as { passed: number; total: number });
      } else if (e.type === "paste_flag") {
        setPasteCount((c) => c + 1);
      } else if (e.type === "tab_switch") {
        const p = e.payload as { hidden: boolean };
        setTabHidden(p.hidden);
        if (p.hidden) setTabSwitchCount((c) => c + 1);
      } else if (e.type === "cursor_move") {
        const p = e.payload as { line: number; column: number };
        setRemoteCursor({ line: p.line, column: p.column });
      } else if (e.type === "file_change") {
        const p = e.payload as { path: string; content: string };
        setFiles((prev) =>
          prev.map((f) => (f.path === p.path ? { ...f, content: p.content } : f)),
        );
      } else if (e.type === "files_dirty") {
        // Structural change (create / rename / delete) by the candidate. Re-fetch the tree.
        // file_change handles content edits already, so this only fires on tree shape changes.
        api
          .listFiles(sessionId)
          .then((list) => {
            setFiles(list);
            // Flip to multi-file mode the moment the candidate adds the first file. Active
            // path stays whatever the interviewer was looking at unless it disappeared.
            if (list.length > 0) setHasFiles(true);
            setActivePath((cur) => {
              if (cur && list.some((f) => f.path === cur && !f.is_folder)) return cur;
              const firstFile = list.find((f) => !f.is_folder);
              return firstFile ? firstFile.path : null;
            });
          })
          .catch(() => undefined);
      } else if (e.type === "file_select") {
        const p = e.payload as { path: string };
        setActivePath(p.path);
      } else if (e.type === "shell_output") {
        const p = e.payload as { command: string; stdout: string; stderr: string };
        setShellHistory((h) => [
          ...h,
          { command: p.command, stdout: p.stdout, stderr: p.stderr },
        ]);
      } else if (e.type === "pushback") {
        setPushback((e.payload as { questions: string[] }).questions);
      } else if (e.type === "token_budget") {
        const p = e.payload as { used: number; budget: number; remaining: number };
        setBudget({ used: p.used, budget: p.budget, remaining: p.remaining });
      } else if (e.type === "participants") {
        setParticipants((e.payload as { participants: Participant[] }).participants);
      } else if (e.type === "interview_ended") {
        // Backend split: this fires immediately when status flips to ended (before the
        // scorecard LLM is done). Switch to summary mode now; scorecard fills in later.
        setEnded(true);
        void loadSummary();
      } else if (e.type === "scorecard_ready") {
        setScorecardLoading(false);
        api.getScorecard(sessionId).then(setScorecard).catch(() => undefined);
      }
    }

    if (!active) return;
    socket = new SessionSocket(sessionId, token);
    socketRef.current = socket;
    socket.connect({
      onOpen: () => setStatus("live"),
      onClose: () => setStatus("disconnected"),
      onEvent: handleEvent,
    });

    return () => {
      active = false;
      socket?.close();
    };
  }, [sessionId, token, nameReady, loadSummary]);

  async function confirmDisplayName(name: string) {
    await api.updateMe({ display_name: name });
    if (typeof window !== "undefined") {
      window.localStorage.setItem(nameConfirmedKey(sessionId), "1");
    }
    setDefaultName(name);
    setNameReady(true);
  }

  function requestEndInterview() {
    setEndConfirmOpen(true);
  }

  function confirmEndInterview() {
    socketRef.current?.send("interview_end", {});
    setEndConfirmOpen(false);
  }

  function admit(profileId: string) {
    socketRef.current?.send("admit", { profile_id: profileId });
  }

  function kick(profileId: string) {
    if (!confirm("Remove this participant from the session?")) return;
    socketRef.current?.send("kick", { profile_id: profileId });
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
      <SummaryView
        title={title}
        createdAt={createdAt}
        endedAt={endedAt}
        prompt={prompt}
        code={code}
        language={language}
        transcripts={transcripts ?? messages}
        lastRun={lastRun}
        scorecard={scorecard}
        scorecardLoading={scorecardLoading}
        events={summaryEvents}
      />
    );
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-neutral-800 px-4 py-2">
        <h1 className="text-sm font-semibold">
          {ended ? "Session summary" : `Interviewer view · ${status}`}
        </h1>
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
        {tabSwitchCount > 0 && (
          <span
            className={`text-xs font-semibold ${tabHidden ? "text-red-400" : "text-amber-400"}`}
          >
            {tabHidden ? "🔴 candidate is on another tab" : `⚠ ${tabSwitchCount} tab switch(es)`}
          </span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <ParticipantsPopover
            participants={participants}
            myProfileId={myProfileId}
            onAdmit={admit}
            onKick={kick}
          />
          <button
            type="button"
            onClick={requestEndInterview}
            className="rounded bg-red-600 px-3 py-1 text-sm font-medium text-white"
          >
            End interview
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="interview-interviewer-h">
          <Panel defaultSize={22} minSize={5} collapsible collapsedSize={3}>
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
            <PanelGroup direction="vertical" autoSaveId="interview-interviewer-v">
              <Panel defaultSize={70} minSize={20}>
                <div className="h-full">
                  {hasFiles ? (
                    <MultiFileEditor
                      files={files}
                      fallbackLanguage={language}
                      activePath={activePath}
                      onActivePathChange={setActivePath}
                      remoteCursor={remoteCursor}
                      readOnly
                    />
                  ) : (
                    <CodeEditor
                      value={code}
                      language={language}
                      readOnly
                      remoteCursor={remoteCursor}
                    />
                  )}
                </div>
              </Panel>
              <PanelResizeHandle className="h-1 bg-neutral-900 transition hover:bg-emerald-700" />
              <Panel defaultSize={30} minSize={8} collapsible collapsedSize={4}>
                <InterviewerTerminalMirror
                  lastRun={lastRun}
                  shellHistory={shellHistory}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="w-1 bg-neutral-900 transition hover:bg-emerald-700" />
          <Panel defaultSize={25} minSize={5} collapsible collapsedSize={3}>
            <div className="flex h-full flex-col border-l border-neutral-800">
              <div className="border-b border-neutral-800 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                AI chat {ended ? "(history)" : "(mirror)"}
              </div>
              {!ended && (
                <AIInfoHeader
                  model={aiModel}
                  guardrailPreset={guardrailPreset}
                  guardrailPresets={guardrailPresets}
                  hallucinationPct={hallucinationPct}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <ChatBox messages={transcripts ?? messages} readOnly busy={!ended && aiBusy} />
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
            </div>
          </Panel>
        </PanelGroup>
      </div>
      {endConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-lg border border-neutral-800 bg-neutral-950 p-5 shadow-xl">
            <h2 className="text-lg font-semibold">End this interview?</h2>
            <p className="mt-2 text-sm text-neutral-400">
              This will close the session for the candidate immediately and start generating the
              scorecard. You cannot reopen it.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEndConfirmOpen(false)}
                className="rounded border border-neutral-700 px-4 py-2 text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmEndInterview}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white"
              >
                Yes, end interview
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

// Read-only mirror of the candidate's terminal panel for the interviewer dashboard. Shows the
// candidate's last Run result + every shell command they typed during the session, so the
// interviewer can see what they ran without needing the candidate to narrate it.
function InterviewerTerminalMirror({
  lastRun,
  shellHistory,
}: {
  lastRun: { passed: number; total: number } | null;
  shellHistory: { command: string; stdout: string; stderr: string }[];
}) {
  const [tab, setTab] = useState<"run" | "shell">("run");
  return (
    <div className="flex h-full flex-col border-t border-neutral-800 bg-black">
      <div className="flex items-center border-b border-neutral-800 px-2 text-xs font-semibold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => setTab("run")}
          className={`px-3 py-1.5 ${tab === "run" ? "border-b-2 border-emerald-500 text-emerald-300" : "text-neutral-500 hover:text-neutral-300"}`}
        >
          Runs
        </button>
        <button
          type="button"
          onClick={() => setTab("shell")}
          className={`px-3 py-1.5 ${tab === "shell" ? "border-b-2 border-sky-400 text-sky-300" : "text-neutral-500 hover:text-neutral-300"}`}
        >
          Shell ({shellHistory.length})
        </button>
        <span className="ml-auto py-1.5 text-neutral-500">
          {tab === "run" && lastRun ? `last ${lastRun.passed}/${lastRun.total}` : ""}
        </span>
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono text-xs">
        {tab === "run" && (
          <span className="text-neutral-500">
            {lastRun
              ? `Candidate's last run: ${lastRun.passed}/${lastRun.total} tests passed.`
              : "Waiting for the candidate to click Run…"}
          </span>
        )}
        {tab === "shell" && shellHistory.length === 0 && (
          <span className="text-neutral-600">Candidate hasn&apos;t used the shell yet.</span>
        )}
        {tab === "shell" &&
          shellHistory.map((entry, i) => (
            <div key={i} className="mb-2">
              <div className="text-neutral-400">
                <span className="text-sky-400">$</span> {entry.command}
              </div>
              {entry.stdout && (
                <pre className="whitespace-pre-wrap text-neutral-200">{entry.stdout}</pre>
              )}
              {entry.stderr && (
                <pre className="whitespace-pre-wrap text-red-400">{entry.stderr}</pre>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}
