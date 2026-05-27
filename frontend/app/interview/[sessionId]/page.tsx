"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIInfoHeader from "@/components/Chat/AIInfoHeader";
import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import DisplayNameModal from "@/components/DisplayNameModal";
import MultiFileEditor, { type MultiFile } from "@/components/Editor/MultiFileEditor";
import { Aperture, Avatar, Icon, Pill, Progress, SectionLabel, Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";
import type { RunResult } from "@/lib/types";
import { SessionSocket, type SessionEvent } from "@/lib/ws";

function nameConfirmedKey(sessionId: string): string {
  return `acuity:display-name-confirmed:${sessionId}`;
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
  const [terminalTab, setTerminalTab] = useState<"visible" | "hidden" | "shell">("visible");
  const [shellHistory, setShellHistory] = useState<ShellEntry[]>([]);
  const [shellBusy, setShellBusy] = useState(false);
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
  const [guardrailPresets, setGuardrailPresets] = useState<string[]>([]);
  const [hallucinationPct, setHallucinationPct] = useState<number>(0);
  const [title, setTitle] = useState<string>("");
  const [joinCode, setJoinCode] = useState<string>("");
  const [interviewType, setInterviewType] = useState<string>("");
  const [createdAt, setCreatedAt] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);

  const [files, setFiles] = useState<MultiFile[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [hasFiles, setHasFiles] = useState(false);

  const socketRef = useRef<SessionSocket | null>(null);
  const codeRef = useRef("");
  const languageRef = useRef("python");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const myProfileIdRef = useRef<string | null>(null);
  const lastCursorSendRef = useRef<number>(0);
  const fileSaveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Live timer counts up from createdAt.
  useEffect(() => {
    if (!createdAt || ended || admitted !== true) return;
    const start = new Date(createdAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [createdAt, ended, admitted]);

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
        if ("guardrail_presets" in interview && Array.isArray(interview.guardrail_presets)) {
          setGuardrailPresets(interview.guardrail_presets);
        }
        if ("hallucination_pct" in interview) setHallucinationPct(interview.hallucination_pct);
        if ("title" in interview) setTitle(interview.title);
        if ("join_code" in interview) setJoinCode(interview.join_code);
        if ("interview_type" in interview) setInterviewType(interview.interview_type);
        if ("created_at" in interview) setCreatedAt(interview.created_at);
      } catch {
        // non-fatal — proceed without prefill
      }
      // Load the session's file tree (multi-file projects). Empty = legacy single-file mode.
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
        // non-fatal — fall back to single-file mode
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
      } else if (e.type === "file_change") {
        // Interviewer edited a file on their side (rare — mostly read-only). Sync.
        const p = e.payload as { path: string; content: string };
        setFiles((prev) =>
          prev.map((f) => (f.path === p.path ? { ...f, content: p.content } : f)),
        );
      } else if (e.type === "shell_output") {
        const p = e.payload as { command: string; stdout: string; stderr: string };
        setShellHistory((h) => [
          ...h,
          { command: p.command, stdout: p.stdout, stderr: p.stderr },
        ]);
        setShellBusy(false);
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

  // Tab-switch monitor + mouse-activity heartbeat for the replay scrubber. Only runs while
  // the WS is connected (i.e. after admit) so we don't spam the server with events from the
  // waiting screen. Mouse moves are throttled to ~once every 2 seconds — enough for idle
  // detection without hot-pathing telemetry on every pixel.
  useEffect(() => {
    if (!nameReady || !token || admitted !== true) return;
    function handleVisibility() {
      socketRef.current?.send("tab_switch", { hidden: document.hidden });
    }
    let lastMouse = 0;
    function handleMouseMove() {
      const now = Date.now();
      if (now - lastMouse < 2000) return;
      lastMouse = now;
      socketRef.current?.send("mouse_move", {});
    }
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("mousemove", handleMouseMove);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [nameReady, token, admitted]);

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

  function onCursor(pos: { line: number; column: number }) {
    // Throttle to ~10/s. Monaco fires onDidChangeCursorPosition on every keystroke; a hundred
    // identical broadcasts per second would saturate the channel for no visual benefit.
    const now = Date.now();
    if (now - lastCursorSendRef.current < 100) return;
    lastCursorSendRef.current = now;
    socketRef.current?.send("cursor_move", pos);
  }

  // Build the code context sent to the AI on each chat turn.
  function buildCodeContext(): string {
    if (!hasFiles) return codeRef.current;
    const MAX_BYTES = 50_000;
    const ordered = [...files.filter((f) => !f.is_folder)];
    ordered.sort((a, b) => {
      if (a.path === activePath) return -1;
      if (b.path === activePath) return 1;
      return a.path.localeCompare(b.path);
    });
    const parts: string[] = [];
    let total = 0;
    let truncated = false;
    for (const f of ordered) {
      const segment = `\n--- ${f.path} ---\n${f.content}\n`;
      if (total + segment.length > MAX_BYTES) {
        truncated = true;
        break;
      }
      parts.push(segment);
      total += segment.length;
    }
    if (truncated) {
      parts.push("\n--- (additional files omitted to fit context window) ---\n");
    }
    return parts.join("");
  }

  function onSend(content: string) {
    if (budget && budget.remaining <= 0) {
      setNotice("AI token budget reached — no more AI help for this interview.");
      return;
    }
    setMessages((m) => [...m, { role: "user", content }]);
    setBusy(true);
    socketRef.current?.send("chat_message", { content, code: buildCodeContext() });
  }

  function onShellCommand(cmd: string) {
    const trimmed = cmd.trim();
    if (!trimmed) return;
    if (trimmed === "clear") {
      setShellHistory([]);
      return;
    }
    setShellBusy(true);
    socketRef.current?.send("shell_command", {
      command: trimmed,
      code: codeRef.current,
    });
  }

  async function runCode() {
    setRunning(true);
    setNotice(null);
    try {
      setRunResult(await api.runCode(sessionId, hasFiles ? "" : codeRef.current));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  // --- multi-file project ops -------------------------------------------------------------
  function onFileContentChange(path: string, content: string) {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    socketRef.current?.send("file_change", { path, content });
    const timers = fileSaveTimersRef.current;
    const existing = timers.get(path);
    if (existing) clearTimeout(existing);
    const file = files.find((f) => f.path === path);
    if (!file) return;
    timers.set(
      path,
      setTimeout(() => {
        api.updateFile(sessionId, file.id, { content }).catch(() => undefined);
        timers.delete(path);
      }, 500),
    );
  }

  async function onFileCreate(path: string, isFolder: boolean) {
    try {
      const created = await api.createFile(sessionId, { path, is_folder: isFolder, content: "" });
      setFiles((prev) => [...prev, created]);
      setHasFiles(true);
      if (!isFolder) setActivePath(created.path);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Could not create file");
    }
  }

  async function onFileRename(id: string, newPath: string) {
    try {
      const updated = await api.updateFile(sessionId, id, { path: newPath });
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, path: updated.path } : f)));
      setActivePath((cur) => {
        if (!cur) return cur;
        const old = files.find((f) => f.id === id);
        if (old && cur === old.path) return updated.path;
        return cur;
      });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Rename failed");
    }
  }

  async function onFileDelete(id: string) {
    const removed = files.find((f) => f.id === id);
    try {
      await api.deleteFile(sessionId, id);
      setFiles((prev) =>
        prev.filter((f) => {
          if (!removed) return f.id !== id;
          if (f.id === id) return false;
          if (removed.is_folder && f.path.startsWith(removed.path + "/")) return false;
          return true;
        }),
      );
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function onFileUpload(uploaded: FileList, intoFolder: string) {
    const base = intoFolder ? `${intoFolder}/` : "";
    const results = await Promise.all(
      Array.from(uploaded).map(async (file) => {
        const wkrp = (file as File & { webkitRelativePath?: string }).webkitRelativePath;
        const relPath = wkrp && wkrp.length > 0 ? wkrp : file.name;
        try {
          const content = await file.text();
          const created = await api.createFile(sessionId, {
            path: `${base}${relPath}`,
            content,
          });
          return { ok: true as const, file: created };
        } catch (e) {
          return {
            ok: false as const,
            error: e instanceof Error ? e.message : `Failed to upload ${relPath}`,
          };
        }
      }),
    );
    const created = results.filter((r) => r.ok).map((r) => r.file);
    const failures = results.filter((r) => !r.ok);
    if (created.length > 0) {
      const newPaths = new Set(created.map((f) => f.path));
      setFiles((prev) => [...prev.filter((f) => !newPaths.has(f.path)), ...created]);
      setHasFiles(true);
    }
    if (failures.length > 0) {
      setNotice(failures.map((f) => f.error).join(" · "));
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
    return <FullscreenMessage
      icon={<Icon name="check" size={26} color="var(--live)" />}
      iconBg="var(--live-dim)"
      iconBorder="var(--live)"
      title="Interview ended"
      subtitle="Thanks for your time. The interviewer has wrapped up this session."
      action={{ label: "Go to dashboard", onClick: () => router.push("/candidate") }}
    />;
  }

  if (kicked) {
    return <FullscreenMessage
      icon={<Icon name="warn" size={22} color="var(--bad)" />}
      iconBg="var(--bad-dim)"
      iconBorder="var(--bad)"
      title="You were removed from the interview"
      subtitle="The interviewer ended your participation in this session."
      action={{ label: "Back to home", onClick: () => router.push("/") }}
    />;
  }

  // Render the waiting screen until the server has confirmed admit=true.
  if (admitted !== true) {
    const heading =
      admitted === false
        ? "Waiting for the interviewer…"
        : "Connecting to the interview…";
    const subtitle =
      admitted === false
        ? "You've joined the session. The interviewer needs to admit you before the interview starts. Keep this tab open."
        : "Checking your approval status. This usually takes a second.";
    return (
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div
          aria-hidden
          style={{ position: "fixed", inset: 0, opacity: 0.06, pointerEvents: "none", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <Aperture size={520} color="var(--live)" />
        </div>
        <span className="live-pulse-dot" style={{ width: 14, height: 14 }} />
        <h1 className="display mt-5" style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          {heading}
        </h1>
        <p className="mt-3" style={{ color: "var(--fg-2)", fontSize: 14.5, maxWidth: 460 }}>
          {subtitle}
        </p>
        <p className="mono mt-5" style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em" }}>
          connection: {status}
        </p>
      </main>
    );
  }

  // From here on the candidate has been explicitly admitted by the interviewer.
  return (
    <main className="flex h-screen flex-col" style={{ background: "var(--bg-0)" }}>
      <header
        className="flex items-center gap-3"
        style={{
          padding: "10px 20px",
          borderBottom: "1px solid var(--line-1)",
          background: "var(--bg-0)",
        }}
      >
        <Wordmark size={14} />
        <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
        <div className="flex flex-col leading-tight">
          <span className="display" style={{ fontSize: 14, color: "var(--fg-0)" }}>
            {title || "Interview"}
          </span>
          <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10, letterSpacing: "0.04em" }}>
            {language}
            {interviewType ? ` · ${interviewType}` : ""}
            {joinCode ? ` · session ${joinCode}` : ""}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <span className="mono tabular flex items-center gap-1.5" style={{ color: "var(--fg-2)", fontSize: 12 }}>
            <Icon name="clock" size={12} color="var(--fg-2)" />
            {formatElapsed(elapsed)}
          </span>
          <span style={{ width: 1, height: 18, background: "var(--line-2)" }} />
          <Avatar name={defaultName || "candidate"} size={22} />
          <span style={{ color: "var(--fg-1)", fontSize: 12.5 }}>{defaultName || "candidate"}</span>
          <button
            type="button"
            onClick={() => router.push("/candidate")}
            className="btn btn-sm"
          >
            <Icon name="logout" size={12} /> Leave
          </button>
        </div>
      </header>

      {notice && (
        <div
          className="flex items-center gap-2"
          style={{
            padding: "8px 20px",
            background: "var(--warn-dim)",
            borderBottom: "1px solid var(--warn)",
            color: "var(--warn)",
            fontSize: 12,
          }}
        >
          <Icon name="warn" size={12} color="var(--warn)" /> {notice}
        </div>
      )}

      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="interview-candidate-h">
          {/* LEFT — problem statement */}
          <Panel defaultSize={22} minSize={5} collapsible collapsedSize={3} className="overflow-hidden">
            <div
              className="flex h-full flex-col"
              style={{ borderRight: "1px solid var(--line-1)", background: "var(--bg-0)" }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line-1)",
                  background: "var(--bg-1)",
                }}
              >
                <SectionLabel>Problem statement</SectionLabel>
              </div>
              <div className="flex-1 overflow-y-auto" style={{ padding: 18 }}>
                {title && (
                  <h2
                    className="display"
                    style={{ fontSize: 22, lineHeight: 1.15, letterSpacing: "-0.01em", color: "var(--fg-0)" }}
                  >
                    {title}
                  </h2>
                )}
                {(interviewType || language) && (
                  <div className="mt-2 flex items-center gap-1.5">
                    {interviewType && <Pill kind="muted">{interviewType}</Pill>}
                    {language && <Pill kind="signal">{language}</Pill>}
                  </div>
                )}
                <div
                  className="mt-4 whitespace-pre-wrap"
                  style={{ fontSize: 13, color: "var(--fg-1)", lineHeight: 1.6 }}
                >
                  {prompt || <span style={{ color: "var(--fg-3)" }}>(no problem statement)</span>}
                </div>
              </div>
            </div>
          </Panel>
          <PanelResizeHandle className="acuity-resize-h" />

          {/* CENTER — editor + terminal */}
          <Panel defaultSize={53} minSize={30}>
            <PanelGroup direction="vertical" autoSaveId="interview-candidate-v">
              <Panel defaultSize={70} minSize={20}>
                <div className="flex h-full flex-col" style={{ background: "var(--bg-0)" }}>
                  <div
                    className="flex items-center justify-between"
                    style={{ padding: "6px 14px", borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="live-pulse-dot"
                        style={{ width: 6, height: 6, animation: "none" }}
                      />
                      <span className="mono" style={{ color: "var(--fg-1)", fontSize: 11 }}>
                        {activePath ?? `solution.${extFor(language)}`}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={runCode}
                        disabled={running}
                        className="btn btn-primary btn-sm"
                        aria-disabled={running}
                      >
                        {running ? "Running…" : <>Run <span className="mono" style={{ opacity: 0.7 }}>⌘↵</span></>}
                      </button>
                      {runResult && runResult.total > 0 && (
                        <Pill kind={runResult.passed === runResult.total ? "live" : "warn"}>
                          {runResult.passed}/{runResult.total} tests
                        </Pill>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 min-h-0">
                    {hasFiles ? (
                      <MultiFileEditor
                        files={files}
                        fallbackLanguage={language}
                        activePath={activePath}
                        onActivePathChange={(p) => {
                          setActivePath(p);
                          if (p) socketRef.current?.send("file_select", { path: p });
                        }}
                        onContentChange={onFileContentChange}
                        onCreate={onFileCreate}
                        onRename={onFileRename}
                        onDelete={onFileDelete}
                        onUpload={onFileUpload}
                        onPaste={onPaste}
                        onCursorChange={onCursor}
                      />
                    ) : (
                      <CodeEditor
                        value={code}
                        language={language}
                        onChange={onCodeChange}
                        onPaste={onPaste}
                        onCursorChange={onCursor}
                      />
                    )}
                  </div>
                </div>
              </Panel>
              <PanelResizeHandle className="acuity-resize-v" />
              <Panel defaultSize={30} minSize={8} collapsible collapsedSize={4}>
                <CandidateTerminal
                  runResult={runResult}
                  activeTab={terminalTab}
                  onTabChange={setTerminalTab}
                  shellHistory={shellHistory}
                  shellBusy={shellBusy}
                  onShellCommand={onShellCommand}
                />
              </Panel>
            </PanelGroup>
          </Panel>
          <PanelResizeHandle className="acuity-resize-h" />

          {/* RIGHT — AI chat */}
          <Panel defaultSize={25} minSize={5} collapsible collapsedSize={3} className="overflow-hidden">
            <div
              className="flex h-full flex-col"
              style={{ borderLeft: "1px solid var(--line-1)", background: "var(--bg-0)" }}
            >
              <div
                style={{
                  padding: "10px 14px",
                  borderBottom: "1px solid var(--line-1)",
                  background: "var(--bg-1)",
                }}
              >
                <div className="flex items-center gap-2">
                  <Aperture size={16} color="var(--live)" />
                  <span className="display" style={{ fontSize: 16, color: "var(--fg-0)" }}>AI assistant</span>
                  <Pill kind="muted" className="ml-auto">hints only</Pill>
                </div>
                {budget && (
                  <div className="mt-3">
                    <div className="mono mb-1 flex items-center justify-between" style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.04em" }}>
                      <span>TOKENS</span>
                      <span className="tabular" style={{ color: "var(--fg-0)" }}>
                        {budget.used.toLocaleString()} / {budget.budget.toLocaleString()}
                      </span>
                    </div>
                    <Progress
                      value={budget.used}
                      max={budget.budget}
                      color={budget.remaining < budget.budget * 0.15 ? "var(--warn)" : "var(--live)"}
                    />
                  </div>
                )}
              </div>
              <AIInfoHeader
                model={aiModel}
                guardrailPreset={guardrailPreset}
                guardrailPresets={guardrailPresets}
                hallucinationPct={hallucinationPct}
              />
              <div className="flex-1 overflow-hidden">
                <ChatBox
                  messages={messages}
                  onSend={onSend}
                  busy={busy}
                  exhausted={budget !== null && budget.remaining <= 0}
                />
              </div>
              <div
                className="mono"
                style={{
                  padding: "8px 14px",
                  borderTop: "1px solid var(--line-1)",
                  background: "var(--bg-0)",
                  color: "var(--fg-3)",
                  fontSize: 10,
                  letterSpacing: "0.04em",
                }}
              >
                AI may produce incorrect output — verify before relying on it.
              </div>
            </div>
          </Panel>
        </PanelGroup>
      </div>

      {/* Suppress unused-state warnings; myProfileId is captured into the ref for handlers. */}
      <span hidden>{myProfileId}</span>

      <style jsx global>{`
        .acuity-resize-h { width: 1px; background: var(--line-1); transition: background 0.12s ease; cursor: col-resize; }
        .acuity-resize-h:hover { background: var(--live); }
        .acuity-resize-v { height: 1px; background: var(--line-1); transition: background 0.12s ease; cursor: row-resize; }
        .acuity-resize-v:hover { background: var(--live); }
      `}</style>
    </main>
  );
}

function FullscreenMessage({
  icon,
  iconBg,
  iconBorder,
  title,
  subtitle,
  action,
}: {
  icon: React.ReactNode;
  iconBg: string;
  iconBorder: string;
  title: string;
  subtitle: string;
  action: { label: string; onClick: () => void };
}) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
      <span
        style={{
          width: 56,
          height: 56,
          borderRadius: 999,
          background: iconBg,
          border: `1px solid ${iconBorder}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {icon}
      </span>
      <h1 className="display mt-5" style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
        {title}
      </h1>
      <p className="mt-3" style={{ color: "var(--fg-2)", fontSize: 14.5, maxWidth: 460 }}>
        {subtitle}
      </p>
      <button onClick={action.onClick} className="btn btn-primary mt-6">
        {action.label} <Icon name="arrow-right" size={14} />
      </button>
    </main>
  );
}

interface ShellEntry {
  command: string;
  stdout: string;
  stderr: string;
}

// Bottom-of-editor terminal panel.
function CandidateTerminal({
  runResult,
  activeTab,
  onTabChange,
  shellHistory,
  shellBusy,
  onShellCommand,
}: {
  runResult: RunResult | null;
  activeTab: "visible" | "hidden" | "shell";
  onTabChange: (t: "visible" | "hidden" | "shell") => void;
  shellHistory: ShellEntry[];
  shellBusy: boolean;
  onShellCommand: (cmd: string) => void;
}) {
  const visibleTests = runResult?.results.filter((r) => !r.hidden) ?? [];
  const hiddenTests = runResult?.results.filter((r) => r.hidden) ?? [];
  const hasHidden = hiddenTests.length > 0;
  const showActive = activeTab === "hidden" && !hasHidden ? "visible" : activeTab;
  const hiddenPassed = hiddenTests.filter((r) => r.passed).length;

  const [shellInput, setShellInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (showActive !== "shell") return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [showActive, shellHistory, shellBusy]);

  function submitShell() {
    const cmd = shellInput.trim();
    if (!cmd) return;
    onShellCommand(cmd);
    setHistory((h) => [...h, cmd]);
    setHistoryIdx(null);
    setShellInput("");
  }

  function handleShellKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      submitShell();
      return;
    }
    if (e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const next = historyIdx === null ? history.length - 1 : Math.max(0, historyIdx - 1);
      setHistoryIdx(next);
      setShellInput(history[next] ?? "");
    } else if (e.key === "ArrowDown" && historyIdx !== null) {
      e.preventDefault();
      const next = historyIdx + 1;
      if (next >= history.length) {
        setHistoryIdx(null);
        setShellInput("");
      } else {
        setHistoryIdx(next);
        setShellInput(history[next] ?? "");
      }
    }
  }

  return (
    <div
      className="flex h-full flex-col"
      style={{ background: "var(--bg-0)", borderTop: "1px solid var(--line-1)" }}
    >
      <div
        className="flex items-center"
        style={{ borderBottom: "1px solid var(--line-1)", background: "var(--bg-1)", padding: "0 8px" }}
      >
        <TermTab active={showActive === "visible"} onClick={() => onTabChange("visible")} color="var(--live)">
          Output
        </TermTab>
        {hasHidden && (
          <TermTab active={showActive === "hidden"} onClick={() => onTabChange("hidden")} color="var(--warn)">
            Tests · {hiddenPassed}/{hiddenTests.length}
          </TermTab>
        )}
        <TermTab active={showActive === "shell"} onClick={() => onTabChange("shell")} color="var(--signal)">
          Shell
        </TermTab>
        <span className="mono ml-auto" style={{ color: "var(--fg-3)", fontSize: 10.5, paddingRight: 10 }}>
          {showActive === "shell"
            ? shellBusy
              ? "running…"
              : ""
            : runResult && runResult.total > 0
              ? `${runResult.passed}/${runResult.total} passed`
              : runResult
                ? "ok"
                : ""}
        </span>
      </div>

      {(showActive === "visible" || showActive === "hidden") && (
        <div className="mono flex-1 overflow-auto" style={{ padding: 10, fontSize: 12 }}>
          {!runResult && (
            <span style={{ color: "var(--fg-3)" }}>Click Run to execute your code.</span>
          )}
          {runResult && runResult.total === 0 && (
            <pre className="whitespace-pre-wrap" style={{ color: "var(--fg-0)" }}>
              {runResult.stdout || runResult.stderr || "(no output)"}
            </pre>
          )}
          {runResult && runResult.total > 0 && showActive === "visible" && (
            <>
              {visibleTests.length === 0 && (
                <span style={{ color: "var(--fg-3)" }}>
                  All tests for this run are hidden — see the Tests tab for pass/fail.
                </span>
              )}
              <ul className="space-y-1">
                {visibleTests.map((r, i) => (
                  <li key={i}>
                    <span style={{ color: r.passed ? "var(--live)" : "var(--bad)" }}>
                      {r.passed ? "✓" : "✗"} {r.name}
                    </span>
                    {!r.passed && (
                      <div className="ml-4" style={{ color: "var(--fg-3)" }}>
                        expected <code style={{ color: "var(--fg-1)" }}>{r.expected}</code>, got{" "}
                        <code style={{ color: "var(--fg-1)" }}>{r.actual}</code>
                        {r.stderr && (
                          <pre className="whitespace-pre-wrap" style={{ color: "var(--bad)" }}>{r.stderr}</pre>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
          {runResult && runResult.total > 0 && showActive === "hidden" && (
            <ul className="space-y-1">
              {hiddenTests.map((r, i) => (
                <li key={i}>
                  <span style={{ color: r.passed ? "var(--live)" : "var(--bad)" }}>
                    {r.passed ? "✓" : "✗"} {r.name}
                  </span>
                  <span style={{ color: "var(--fg-3)" }}> (hidden — details withheld)</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {showActive === "shell" && (
        <div className="flex min-h-0 flex-1 flex-col">
          <div
            ref={scrollRef}
            className="mono flex-1 overflow-auto"
            style={{ padding: 10, fontSize: 12 }}
            onClick={() => {
              const input = document.getElementById("acuity-shell-input");
              if (input instanceof HTMLInputElement) input.focus();
            }}
          >
            {shellHistory.length === 0 && !shellBusy && (
              <div style={{ color: "var(--fg-3)" }}>
                Interactive terminal. Type <code style={{ color: "var(--fg-1)" }}>help</code> to see
                available commands. Use ↑/↓ for command history.
              </div>
            )}
            {shellHistory.map((entry, i) => (
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
            {shellBusy && (
              <div style={{ color: "var(--fg-3)" }}>
                <span style={{ color: "var(--signal)" }}>$</span> {shellInput}
                <span className="animate-pulse"> running…</span>
              </div>
            )}
          </div>
          <div
            className="mono flex items-center gap-2"
            style={{
              borderTop: "1px solid var(--line-1)",
              padding: "6px 10px",
              fontSize: 12,
              background: "var(--bg-0)",
            }}
          >
            <span style={{ color: "var(--signal)" }}>$</span>
            <input
              id="acuity-shell-input"
              type="text"
              value={shellInput}
              onChange={(e) => setShellInput(e.target.value)}
              onKeyDown={handleShellKey}
              disabled={shellBusy}
              autoComplete="off"
              spellCheck={false}
              style={{
                flex: 1,
                background: "transparent",
                color: "var(--fg-0)",
                border: "none",
                outline: "none",
                fontFamily: "var(--font-mono)",
                fontSize: 12,
              }}
              placeholder={shellBusy ? "" : "type a command and press Enter…"}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TermTab({
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
