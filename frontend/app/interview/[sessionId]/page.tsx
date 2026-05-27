"use client";

import dynamic from "next/dynamic";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

import AIInfoHeader from "@/components/Chat/AIInfoHeader";
import ChatBox, { type ChatMessage } from "@/components/Chat/ChatBox";
import DisplayNameModal from "@/components/DisplayNameModal";
import MultiFileEditor, { type MultiFile } from "@/components/Editor/MultiFileEditor";
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
  //   - Single-file mode: just the editor buffer (codeRef).
  //   - Multi-file mode: every file in the tree, prefixed with a `--- path ---` header. The
  //     active file is moved to the front so the AI sees it first (matters when we hit the
  //     size cap below). Folders are skipped; binaries that can't be `text()`-decoded never
  //     enter `files` in the first place.
  // We cap total size at ~50KB so a giant uploaded project doesn't single-handedly drain the
  // session's token budget. When truncated, we surface that to the model explicitly so it
  // doesn't pretend it saw everything.
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
    // `clear` is client-only — never hits the server. Other commands round-trip through the
    // backend so the interviewer mirrors the same history.
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
      // Multi-file mode: server reads files from session_files and ignores `code`. Single-file
      // mode: server uses the code we send.
      setRunResult(await api.runCode(sessionId, hasFiles ? "" : codeRef.current));
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Run failed");
    } finally {
      setRunning(false);
    }
  }

  // --- multi-file project ops -------------------------------------------------------------
  // Edits are debounced per-file: each keystroke updates local state immediately + queues a
  // PATCH save 500ms later, and broadcasts a live `file_change` WS event so the interviewer's
  // mirror stays current between saves.
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
      // If the renamed file was active, follow it.
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
      // Drop the file and any descendants (if it was a folder).
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
    // Process all selected files in parallel — large multi-file uploads (e.g. a whole project
    // folder) were noticeably slow when awaited sequentially. We still surface per-file errors
    // via setNotice; one failure doesn't abort the rest. `webkitRelativePath` is populated for
    // folder uploads (via the directory picker) so nested structure is preserved.
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

  // Render the waiting screen until the server has confirmed admit=true. We used to fall through
  // to the IDE optimistically while `admitted` was still `null` (initial state, before the
  // participants WS event arrived) — that let the candidate briefly see and type into the editor
  // before approval, which is exactly the sync bug we hit. Now: anything other than an explicit
  // `true` from the server keeps them on the waiting screen.
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
      <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6 text-center">
        <div className="mx-auto h-12 w-12 animate-pulse rounded-full bg-emerald-500/30" />
        <h1 className="text-2xl font-bold">{heading}</h1>
        <p className="text-sm text-neutral-400">{subtitle}</p>
        <p className="text-xs text-neutral-600">Connection: {status}</p>
      </main>
    );
  }

  // From here on the candidate has been explicitly admitted by the interviewer.
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
              <PanelResizeHandle className="h-1 bg-neutral-900 transition hover:bg-emerald-700" />
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
            </div>
          </Panel>
        </PanelGroup>
      </div>
      {/* Suppress unused-state warnings; myProfileId is captured into the ref for handlers. */}
      <span hidden>{myProfileId}</span>
    </main>
  );
}

interface ShellEntry {
  command: string;
  stdout: string;
  stderr: string;
}

// Bottom-of-editor terminal panel. Three tabs:
//   - Output: stdout/stderr OR results of visible (non-hidden) test cases (from Run button).
//   - Hidden tests: pass/fail summary only (no inputs/outputs revealed to the candidate).
//   - Shell: interactive pseudo-shell (ls/cat/run/python/node) over the session's file tree.
// The "Hidden tests" tab is only shown when at least one hidden test ran. Shell tab is always
// available. All three share the same CodeSignal-style terminal Panel per the layout brief.
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
  // If "hidden" was selected before any hidden test ran, fall back to "visible".
  const showActive = activeTab === "hidden" && !hasHidden ? "visible" : activeTab;
  const hiddenPassed = hiddenTests.filter((r) => r.passed).length;

  const [shellInput, setShellInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to the bottom of the shell view as new output streams in (and on first paint
  // when the user switches to the Shell tab).
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

  // Up/Down arrows scroll the typed-command history (bash-style). Only when the input has
  // focus; doesn't fire if there's no history.
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
    <div className="flex h-full flex-col border-t border-neutral-800 bg-black">
      <div className="flex items-center border-b border-neutral-800 px-2 text-xs font-semibold uppercase tracking-wider">
        <button
          type="button"
          onClick={() => onTabChange("visible")}
          className={`px-3 py-1.5 ${showActive === "visible" ? "border-b-2 border-emerald-500 text-emerald-300" : "text-neutral-500 hover:text-neutral-300"}`}
        >
          Output
        </button>
        {hasHidden && (
          <button
            type="button"
            onClick={() => onTabChange("hidden")}
            className={`px-3 py-1.5 ${showActive === "hidden" ? "border-b-2 border-amber-400 text-amber-300" : "text-neutral-500 hover:text-neutral-300"}`}
          >
            Hidden tests ({hiddenPassed}/{hiddenTests.length})
          </button>
        )}
        <button
          type="button"
          onClick={() => onTabChange("shell")}
          className={`px-3 py-1.5 ${showActive === "shell" ? "border-b-2 border-sky-400 text-sky-300" : "text-neutral-500 hover:text-neutral-300"}`}
        >
          Shell
        </button>
        <span className="ml-auto py-1.5 text-neutral-500">
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
        <div className="flex-1 overflow-auto p-2 font-mono text-xs">
          {!runResult && (
            <span className="text-neutral-600">Click Run to execute your code.</span>
          )}
          {runResult && runResult.total === 0 && (
            <pre className="whitespace-pre-wrap text-neutral-300">
              {runResult.stdout || runResult.stderr || "(no output)"}
            </pre>
          )}
          {runResult && runResult.total > 0 && showActive === "visible" && (
            <>
              {visibleTests.length === 0 && (
                <span className="text-neutral-500">
                  All tests for this run are hidden — see the Hidden tests tab for pass/fail.
                </span>
              )}
              <ul className="space-y-1">
                {visibleTests.map((r, i) => (
                  <li key={i}>
                    <span className={r.passed ? "text-emerald-400" : "text-red-400"}>
                      {r.passed ? "✓" : "✗"} {r.name}
                    </span>
                    {!r.passed && (
                      <div className="ml-4 text-neutral-500">
                        expected <code className="text-neutral-300">{r.expected}</code>, got{" "}
                        <code className="text-neutral-300">{r.actual}</code>
                        {r.stderr && (
                          <pre className="whitespace-pre-wrap text-red-400">{r.stderr}</pre>
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
                  <span className={r.passed ? "text-emerald-400" : "text-red-400"}>
                    {r.passed ? "✓" : "✗"} {r.name}
                  </span>
                  <span className="text-neutral-500"> (hidden — details withheld)</span>
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
            className="flex-1 overflow-auto p-2 font-mono text-xs"
            onClick={() => {
              // Clicking anywhere in the scrollback focuses the input below.
              const input = document.getElementById("devlens-shell-input");
              if (input instanceof HTMLInputElement) input.focus();
            }}
          >
            {shellHistory.length === 0 && !shellBusy && (
              <div className="text-neutral-600">
                Interactive terminal. Type <code className="text-neutral-300">help</code> to see
                available commands. Use ↑/↓ for command history.
              </div>
            )}
            {shellHistory.map((entry, i) => (
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
            {shellBusy && (
              <div className="text-neutral-500">
                <span className="text-sky-400">$</span> {shellInput}
                <span className="animate-pulse"> running…</span>
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-neutral-900 px-2 py-1 font-mono text-xs">
            <span className="text-sky-400">$</span>
            <input
              id="devlens-shell-input"
              type="text"
              value={shellInput}
              onChange={(e) => setShellInput(e.target.value)}
              onKeyDown={handleShellKey}
              disabled={shellBusy}
              autoComplete="off"
              spellCheck={false}
              className="flex-1 bg-transparent text-neutral-100 outline-none placeholder:text-neutral-700 disabled:opacity-50"
              placeholder={shellBusy ? "" : "type a command and press Enter…"}
            />
          </div>
        </div>
      )}
    </div>
  );
}
