"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIInfoHeader from "@/components/Chat/AIInfoHeader";
import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import ParticipantsPopover, { type Participant } from "@/components/Dashboard/ParticipantsPopover";
import SummaryView from "@/components/Dashboard/SummaryView";
import DisplayNameModal from "@/components/DisplayNameModal";
import MultiFileEditor, { type MultiFile } from "@/components/Editor/MultiFileEditor";
import { Icon, Pill, SectionLabel, Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import { getSession } from "@/lib/auth";
import type { EventRow, Scorecard } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

function nameConfirmedKey(sessionId: string): string {
  return `acuity:display-name-confirmed:${sessionId}`;
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
  const [bootReady, setBootReady] = useState(false);
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
  const [hallucinationType, setHallucinationType] = useState<string>("mixed");
  const [title, setTitle] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [endedAt, setEndedAt] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string>("");
  const [interviewType, setInterviewType] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const socketRef = useRef<SessionSocket | null>(null);

  // Live timer in the header — counts up from createdAt while the session is active.
  useEffect(() => {
    if (!createdAt || ended) return;
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt, ended]);

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
      const session = await getSession();
      const accessToken = session?.token ?? null;
      const uid = session?.userId ?? null;
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
        if ("hallucination_type" in interview) setHallucinationType(interview.hallucination_type);
        if ("join_code" in interview) setJoinCode(interview.join_code);
        if ("interview_type" in interview) setInterviewType(interview.interview_type);
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
      if (active) setBootReady(true);
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

  if (!bootReady) {
    return <main style={{ background: "var(--bg-0)", minHeight: "100vh" }} />;
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

  if (!nameReady && token) {
    return (
      <DisplayNameModal
        open
        defaultName={defaultName}
        onConfirm={confirmDisplayName}
      />
    );
  }

  const statusKind = status === "live" ? "live" : status === "disconnected" ? "bad" : "muted";

  return (
    <main className="flex h-screen flex-col" style={{ background: "var(--bg-0)" }}>
      {/* Top bar */}
      <header
        className="flex flex-wrap items-center gap-3"
        style={{
          padding: "12px 20px",
          borderBottom: "1px solid var(--line-1)",
          background: "var(--bg-0)",
        }}
      >
        <Link href="/dashboard" className="btn btn-ghost btn-sm" aria-label="Back to dashboard">
          <Icon name="chevron-left" size={14} /> Back
        </Link>
        <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
        <Wordmark size={14} />
        <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
        <Pill kind={statusKind} pulse={status === "live"}>
          {status === "live" ? `live · ${formatElapsed(elapsed)}` : status}
        </Pill>
        {title && (
          <span style={{ fontSize: 13, color: "var(--fg-0)" }} className="display">
            {title}
          </span>
        )}
        {joinCode && (
          <span className="mono" style={{ color: "var(--fg-3)", fontSize: 11 }}>
            {joinCode}
          </span>
        )}
        {budget && (
          <span className="mono tabular" style={{ color: "var(--fg-2)", fontSize: 11 }}>
            tokens {budget.used.toLocaleString()}/{budget.budget.toLocaleString()}
          </span>
        )}
        {lastRun && lastRun.total > 0 && (
          <Pill kind={lastRun.passed === lastRun.total ? "live" : "warn"}>
            tests {lastRun.passed}/{lastRun.total}
          </Pill>
        )}
        {pasteCount > 0 && (
          <Pill kind="warn">
            <Icon name="warn" size={11} /> {pasteCount} paste(s)
          </Pill>
        )}
        {tabSwitchCount > 0 && (
          <Pill kind={tabHidden ? "bad" : "warn"} pulse={tabHidden}>
            {tabHidden ? "on another tab" : `${tabSwitchCount} tab switch(es)`}
          </Pill>
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
            className="btn btn-danger btn-sm"
          >
            End interview
          </button>
        </div>
      </header>

      {/* 3-panel body */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="interview-interviewer-h">
          {/* LEFT — problem + telemetry */}
          <Panel defaultSize={22} minSize={5} collapsible collapsedSize={3}>
            <PanelSidebar
              prompt={prompt}
              interviewType={interviewType}
              pasteCount={pasteCount}
              tabSwitchCount={tabSwitchCount}
              budget={budget}
              pushback={pushback}
            />
          </Panel>
          <PanelResizeHandle className="resize-handle-h" />

          {/* CENTER — code mirror + terminal */}
          <Panel defaultSize={53} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="interview-interviewer-v">
              <Panel defaultSize={70} minSize={20}>
                <div className="flex h-full flex-col" style={{ background: "var(--bg-0)" }}>
                  <div
                    className="flex items-center justify-between"
                    style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)" }}
                  >
                    <SectionLabel>Editor mirror</SectionLabel>
                    <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
                      {activePath ?? `solution.${extFor(language)}`} · {language}
                    </span>
                  </div>
                  <div className="flex-1 min-h-0">
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
                </div>
              </Panel>
              <PanelResizeHandle className="resize-handle-v" />
              <Panel defaultSize={30} minSize={8} collapsible collapsedSize={4}>
                <InterviewerTerminalMirror
                  lastRun={lastRun}
                  shellHistory={shellHistory}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="resize-handle-h" />

          {/* RIGHT — AI chat (mirror) */}
          <Panel defaultSize={25} minSize={5} collapsible collapsedSize={3}>
            <div className="flex h-full flex-col" style={{ borderLeft: "1px solid var(--line-1)", background: "var(--bg-0)" }}>
              <div
                className="flex items-center justify-between"
                style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)" }}
              >
                <SectionLabel>AI chat {ended ? "(history)" : "(mirror)"}</SectionLabel>
                <Pill kind="warn">halluc {hallucinationPct}%</Pill>
              </div>
              {!ended && (
                <AIInfoHeader
                  model={aiModel}
                  guardrailPreset={guardrailPreset}
                  guardrailPresets={guardrailPresets}
                  hallucinationPct={hallucinationPct}
                  hallucinationType={hallucinationType}
                />
              )}
              <div className="flex-1 overflow-hidden">
                <ChatBox messages={transcripts ?? messages} readOnly busy={!ended && aiBusy} />
              </div>
              {pushback.length > 0 && (
                <div
                  style={{
                    padding: 14,
                    borderTop: "1px solid var(--line-1)",
                    background: "var(--bg-1)",
                  }}
                >
                  <div className="flex items-center gap-2">
                    <Icon name="sparkle" size={12} color="var(--signal)" />
                    <SectionLabel>Suggested push-back</SectionLabel>
                  </div>
                  <ul className="mt-2 space-y-1.5 pl-1" style={{ fontSize: 12.5, color: "var(--fg-1)" }}>
                    {pushback.map((q, i) => (
                      <li key={i} className="flex items-start gap-2">
                        <span style={{ color: "var(--signal)" }}>›</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div
                className="mono flex items-center justify-between"
                style={{
                  padding: "8px 14px",
                  borderTop: "1px solid var(--line-1)",
                  background: "var(--bg-0)",
                  color: "var(--fg-3)",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                }}
              >
                <span>Read-only mirror · candidate doesn&apos;t see corruption flags</span>
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {endConfirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: "oklch(0 0 0 / 0.65)", backdropFilter: "blur(2px)", padding: 16 }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 440,
              background: "var(--bg-1)",
              border: "1px solid var(--line-1)",
              borderRadius: "var(--radius-lg)",
              padding: 24,
              boxShadow: "0 24px 48px -16px black",
            }}
          >
            <SectionLabel>End interview</SectionLabel>
            <h2 className="display mt-2" style={{ fontSize: 24 }}>End this interview?</h2>
            <p className="mt-3" style={{ color: "var(--fg-2)", fontSize: 13.5, lineHeight: 1.55 }}>
              This will close the session for the candidate immediately and start generating the
              scorecard. You cannot reopen it.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setEndConfirmOpen(false)} className="btn">
                Cancel
              </button>
              <button type="button" onClick={confirmEndInterview} className="btn btn-danger">
                Yes, end interview
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Inline styles for the panel resize handles — must use real CSS to hook ::hover. */}
      <style jsx global>{`
        .resize-handle-h { width: 1px; background: var(--line-1); transition: background 0.12s ease; cursor: col-resize; }
        .resize-handle-h:hover { background: var(--live); }
        .resize-handle-v { height: 1px; background: var(--line-1); transition: background 0.12s ease; cursor: row-resize; }
        .resize-handle-v:hover { background: var(--live); }
      `}</style>
    </main>
  );
}

// Read-only mirror of the candidate's terminal panel for the interviewer dashboard. Shows the
// candidate's last Run result + every shell command they typed during the session.
function InterviewerTerminalMirror({
  lastRun,
  shellHistory,
}: {
  lastRun: { passed: number; total: number } | null;
  shellHistory: { command: string; stdout: string; stderr: string }[];
}) {
  const [tab, setTab] = useState<"run" | "shell">("run");
  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--bg-0)", borderTop: "1px solid var(--line-1)" }}
    >
      <div
        className="flex items-center"
        style={{ borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)", padding: "0 10px" }}
      >
        <TerminalTab active={tab === "run"} onClick={() => setTab("run")} color="var(--live)">
          Runs
        </TerminalTab>
        <TerminalTab active={tab === "shell"} onClick={() => setTab("shell")} color="var(--signal)">
          Shell ({shellHistory.length})
        </TerminalTab>
        <span className="mono ml-auto" style={{ color: "var(--fg-3)", fontSize: 10.5 }}>
          {tab === "run" && lastRun ? `last ${lastRun.passed}/${lastRun.total}` : ""}
        </span>
      </div>
      <div className="mono flex-1 overflow-auto" style={{ padding: 10, fontSize: 12 }}>
        {tab === "run" && (
          <span style={{ color: "var(--fg-3)" }}>
            {lastRun
              ? `Candidate's last run: ${lastRun.passed}/${lastRun.total} tests passed.`
              : "Waiting for the candidate to click Run…"}
          </span>
        )}
        {tab === "shell" && shellHistory.length === 0 && (
          <span style={{ color: "var(--fg-3)" }}>Candidate hasn&apos;t used the shell yet.</span>
        )}
        {tab === "shell" &&
          shellHistory.map((entry, i) => (
            <div key={i} className="mb-2">
              <div style={{ color: "var(--fg-2)" }}>
                <span style={{ color: "var(--signal)" }}>$</span> {entry.command}
              </div>
              {entry.stdout && (
                <pre className="whitespace-pre-wrap" style={{ color: "var(--fg-0)" }}>{entry.stdout}</pre>
              )}
              {entry.stderr && (
                <pre className="whitespace-pre-wrap" style={{ color: "var(--bad)" }}>{entry.stderr}</pre>
              )}
            </div>
          ))}
      </div>
    </div>
  );
}

function TerminalTab({
  active,
  onClick,
  color,
  children,
}: {
  active: boolean;
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mono"
      style={{
        padding: "8px 12px",
        background: "transparent",
        color: active ? "var(--fg-0)" : "var(--fg-3)",
        fontSize: 11,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        border: "none",
        borderBottom: `2px solid ${active ? color : "transparent"}`,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

function PanelSidebar({
  prompt,
  interviewType,
  pasteCount,
  tabSwitchCount,
  budget,
  pushback,
}: {
  prompt: string;
  interviewType: string;
  pasteCount: number;
  tabSwitchCount: number;
  budget: { used: number; budget: number; remaining: number } | null;
  pushback: string[];
}) {
  return (
    <div
      className="flex h-full flex-col"
      style={{ borderRight: "1px solid var(--line-1)", background: "var(--bg-0)" }}
    >
      <div
        className="flex items-center justify-between"
        style={{ padding: "8px 14px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)" }}
      >
        <SectionLabel>Problem</SectionLabel>
        <div className="flex items-center gap-1.5">
          {interviewType && <Pill kind="muted">{interviewType}</Pill>}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto" style={{ padding: 14 }}>
        <div
          className="whitespace-pre-wrap"
          style={{ color: "var(--fg-1)", fontSize: 13, lineHeight: 1.55 }}
        >
          {prompt || <span style={{ color: "var(--fg-3)" }}>(no problem statement)</span>}
        </div>

        <div className="mt-6">
          <SectionLabel>Telemetry</SectionLabel>
          <div className="mt-3 flex flex-col gap-3" style={{ fontSize: 12 }}>
            <TelemetryRow
              icon="circle"
              iconColor={budget && budget.remaining < (budget.budget * 0.15) ? "var(--warn)" : "var(--live)"}
              label="Token budget"
              value={
                budget
                  ? `${budget.used.toLocaleString()} / ${budget.budget.toLocaleString()}`
                  : "—"
              }
            />
            <TelemetryRow
              icon="warn"
              iconColor={pasteCount > 0 ? "var(--warn)" : "var(--fg-3)"}
              label="Paste events"
              value={pasteCount > 0 ? `${pasteCount} flagged` : "0"}
            />
            <TelemetryRow
              icon="eye-off"
              iconColor={tabSwitchCount > 0 ? "var(--warn)" : "var(--fg-3)"}
              label="Tab switches"
              value={tabSwitchCount > 0 ? `${tabSwitchCount}` : "0"}
            />
            <TelemetryRow
              icon="sparkle"
              iconColor={pushback.length > 0 ? "var(--signal)" : "var(--fg-3)"}
              label="Push-back hints"
              value={pushback.length > 0 ? `${pushback.length} ready` : "—"}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function TelemetryRow({
  icon,
  iconColor,
  label,
  value,
}: {
  icon: "circle" | "warn" | "eye-off" | "sparkle";
  iconColor: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="flex items-center gap-2" style={{ color: "var(--fg-2)" }}>
        <Icon name={icon} size={12} color={iconColor} />
        {label}
      </span>
      <span className="mono tabular" style={{ color: "var(--fg-0)" }}>{value}</span>
    </div>
  );
}

function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function extFor(language: string): string {
  return ({
    python: "py",
    javascript: "js",
    typescript: "ts",
    java: "java",
    cpp: "cpp",
    go: "go",
    sql: "sql",
  } as Record<string, string>)[language] ?? "txt";
}
