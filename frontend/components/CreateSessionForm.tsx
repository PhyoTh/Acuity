"use client";

import { type ChangeEvent, type DragEvent, useState } from "react";

import { api } from "@/lib/api";
import {
  GUARDRAIL_PRESETS,
  INTERVIEW_TYPES,
  type SessionConfig,
  type SessionCreateInput,
  type TestCaseInput,
} from "@/lib/types";

// In-form representation of an uploaded starter file. After the session is created we POST each
// of these to /sessions/{id}/files so the candidate sees the same tree.
interface PendingFile {
  path: string;
  content: string;
}

const LANGUAGES = ["python", "javascript", "typescript", "java", "cpp", "go"];

const STEPS = ["Basics", "Type", "Problem", "AI behavior"] as const;

const DEFAULT_TYPE = INTERVIEW_TYPES[0];

/**
 * Multi-step wizard to create an interview session.
 *   1. Basics            — title + language
 *   2. Interview type    — picks one of the 8 presets; pre-fills step 4 defaults
 *   3. Problem statement — prompt + starting code + optional test cases
 *   4. AI behavior       — guardrail preset, custom rules, hallucination %, token budget,
 *                          push-back toggle. Pre-filled from the selected interview type;
 *                          interviewer can override anything before submitting.
 *
 * The component is exported as `CreateSessionForm` so existing imports keep working.
 */
export default function CreateSessionForm({
  onCreated,
}: {
  onCreated: (session: SessionConfig) => void;
}) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<SessionCreateInput>({
    title: "Untitled interview",
    language: "python",
    interview_type: DEFAULT_TYPE.value,
    prompt: "",
    starting_code: "",
    guardrail_preset: DEFAULT_TYPE.defaults.guardrail_preset,
    guardrail_presets: [DEFAULT_TYPE.defaults.guardrail_preset],
    guardrail_custom: "",
    hallucination_pct: DEFAULT_TYPE.defaults.hallucination_pct,
    test_cases: [],
    token_budget: DEFAULT_TYPE.defaults.token_budget,
    enable_pushback: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [dragOver, setDragOver] = useState(false);

  function update<K extends keyof SessionCreateInput>(key: K, value: SessionCreateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function pickType(typeValue: string) {
    const t = INTERVIEW_TYPES.find((it) => it.value === typeValue) ?? DEFAULT_TYPE;
    // Picking a type overrides the AI-behavior defaults — the interviewer can still edit them
    // on step 4.
    setForm((f) => ({
      ...f,
      interview_type: t.value,
      guardrail_preset: t.defaults.guardrail_preset,
      guardrail_presets: [t.defaults.guardrail_preset],
      hallucination_pct: t.defaults.hallucination_pct,
      token_budget: t.defaults.token_budget,
    }));
  }

  function toggleGuardrail(preset: string) {
    setForm((f) => {
      const has = f.guardrail_presets.includes(preset);
      // Keep at least one preset selected — the AI needs *some* policy.
      const next = has
        ? f.guardrail_presets.filter((p) => p !== preset)
        : [...f.guardrail_presets, preset];
      const final = next.length === 0 ? [preset] : next;
      return { ...f, guardrail_presets: final, guardrail_preset: final[0] };
    });
  }

  function updateTest(i: number, patch: Partial<TestCaseInput>) {
    setForm((f) => ({
      ...f,
      test_cases: f.test_cases.map((t, idx) => (idx === i ? { ...t, ...patch } : t)),
    }));
  }
  function addTest() {
    setForm((f) => ({
      ...f,
      test_cases: [...f.test_cases, { stdin: "", expected: "", hidden: false, call: "" }],
    }));
  }
  function removeTest(i: number) {
    setForm((f) => ({ ...f, test_cases: f.test_cases.filter((_, idx) => idx !== i) }));
  }

  async function readUploadedFiles(uploaded: FileList) {
    const additions: PendingFile[] = [];
    for (let i = 0; i < uploaded.length; i += 1) {
      const f = uploaded[i];
      // Some browsers expose webkitRelativePath (set when uploading a directory). Use it so
      // folder uploads keep their structure; otherwise just the filename.
      const wkrp = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = wkrp && wkrp.length > 0 ? wkrp : f.name;
      try {
        additions.push({ path, content: await f.text() });
      } catch {
        // Binary or unreadable — skip.
      }
    }
    // De-dupe by path: re-uploading replaces.
    setPendingFiles((prev) => {
      const map = new Map(prev.map((p) => [p.path, p] as const));
      for (const a of additions) map.set(a.path, a);
      return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
    });
  }

  function removePendingFile(path: string) {
    setPendingFiles((prev) => prev.filter((p) => p.path !== path));
  }

  function renamePendingFile(oldPath: string, newPath: string) {
    setPendingFiles((prev) =>
      prev.map((p) => (p.path === oldPath ? { ...p, path: newPath } : p)),
    );
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void readUploadedFiles(e.dataTransfer.files);
    }
  }

  function handleFileInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files) {
      void readUploadedFiles(e.target.files);
      e.target.value = "";
    }
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const created = await api.createSession(form);
      // Upload starter files (if any). Best-effort: a single upload failure doesn't abort the
      // others — we surface the first error to the interviewer at the end.
      const failures: string[] = [];
      for (const pf of pendingFiles) {
        try {
          await api.createFile(created.id, { path: pf.path, content: pf.content });
        } catch (err) {
          failures.push(`${pf.path}: ${err instanceof Error ? err.message : "failed"}`);
        }
      }
      if (failures.length > 0) {
        setError(`Session created, but some files failed to upload:\n${failures.join("\n")}`);
      }
      onCreated(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session");
    } finally {
      setBusy(false);
    }
  }

  const canAdvance =
    (step === 0 && form.title.trim().length > 0) ||
    step === 1 ||
    step === 2 ||
    step === 3;

  const field = "w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none";

  return (
    <div className="space-y-4 rounded border border-neutral-800 p-5">
      {/* Step indicator */}
      <ol className="flex flex-wrap gap-2 text-xs">
        {STEPS.map((label, i) => {
          const state = i === step ? "current" : i < step ? "done" : "pending";
          const color =
            state === "current"
              ? "border-emerald-500 text-emerald-300"
              : state === "done"
                ? "border-neutral-700 text-neutral-400"
                : "border-neutral-800 text-neutral-600";
          return (
            <li
              key={label}
              className={`flex items-center gap-2 rounded-full border px-3 py-1 ${color}`}
            >
              <span className="font-semibold">{i + 1}</span>
              <span>{label}</span>
            </li>
          );
        })}
      </ol>

      {/* Step body */}
      {step === 0 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Basics</h3>
          <label className="block text-sm text-neutral-400">
            Title
            <input
              className={`${field} mt-1`}
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="What should we call this interview?"
            />
          </label>
          <label className="block text-sm text-neutral-400">
            Language
            <select
              className={`${field} mt-1`}
              value={form.language}
              onChange={(e) => update("language", e.target.value)}
            >
              {LANGUAGES.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {step === 1 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Interview type</h3>
          <p className="text-sm text-neutral-400">
            Pick a kind — we&apos;ll pre-fill the AI behavior step with sensible defaults. You can
            override anything before saving.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {INTERVIEW_TYPES.map((t) => {
              const selected = t.value === form.interview_type;
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => pickType(t.value)}
                  className={`rounded border p-3 text-left text-sm transition ${
                    selected
                      ? "border-emerald-500 bg-emerald-950/30"
                      : "border-neutral-800 hover:border-neutral-600"
                  }`}
                >
                  <div className="font-semibold">{t.label}</div>
                  <div className="mt-1 text-xs text-neutral-400">{t.description}</div>
                  <div className="mt-2 text-[10px] text-neutral-500">
                    Defaults: {t.defaults.guardrail_preset} · hallucinate{" "}
                    {t.defaults.hallucination_pct}% · {t.defaults.token_budget.toLocaleString()} tok
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">Problem</h3>
          <label className="block text-sm text-neutral-400">
            Problem statement (shown to the candidate)
            <textarea
              className={`${field} mt-1`}
              rows={4}
              value={form.prompt}
              onChange={(e) => update("prompt", e.target.value)}
              placeholder="Describe the task..."
            />
          </label>
          <div className="space-y-2">
            <div className="text-sm text-neutral-400">
              Starter files (optional)
              <p className="text-[11px] text-neutral-500">
                Drag &amp; drop files here, or click to pick. Folders preserve their structure
                (uploading a folder uses the browser&apos;s relative path). The candidate sees
                this exact tree in their IDE and can edit, rename, or delete.
              </p>
            </div>
            <div
              className={`rounded border-2 border-dashed p-4 text-center text-xs transition ${
                dragOver
                  ? "border-emerald-500 bg-emerald-950/30 text-emerald-300"
                  : "border-neutral-700 text-neutral-400"
              }`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
            >
              <p>Drop files or a folder here</p>
              <div className="mt-2 flex flex-wrap justify-center gap-3 text-emerald-300">
                <label className="inline-block cursor-pointer underline">
                  browse files
                  <input
                    type="file"
                    hidden
                    multiple
                    onChange={handleFileInput}
                  />
                </label>
                <label className="inline-block cursor-pointer underline">
                  browse folder
                  <input
                    type="file"
                    hidden
                    multiple
                    // @ts-expect-error — non-standard but widely supported (Chromium, Safari, Firefox)
                    webkitdirectory=""
                    directory=""
                    onChange={handleFileInput}
                  />
                </label>
              </div>
              <p className="mt-2 text-[10px] text-neutral-500">
                Tip: in the file picker, Cmd/Ctrl+click (or Shift+click) to select multiple
                files at once.
              </p>
            </div>
            {pendingFiles.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto rounded border border-neutral-800 p-2 text-xs">
                {pendingFiles.map((pf) => (
                  <li key={pf.path} className="flex items-center gap-2">
                    <span className="text-neutral-500">📄</span>
                    <input
                      className="flex-1 rounded bg-neutral-900 px-2 py-1 font-mono text-xs outline-none"
                      value={pf.path}
                      onChange={(e) => renamePendingFile(pf.path, e.target.value)}
                    />
                    <span className="text-neutral-600">
                      {pf.content.length.toLocaleString()} chars
                    </span>
                    <button
                      type="button"
                      onClick={() => removePendingFile(pf.path)}
                      className="text-red-400"
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <details className="text-xs">
              <summary className="cursor-pointer text-neutral-500">
                or paste a single starter file inline
              </summary>
              <textarea
                className={`${field} mt-1 font-mono text-xs`}
                rows={4}
                value={form.starting_code}
                onChange={(e) => update("starting_code", e.target.value)}
                placeholder="(legacy single-file mode — leave empty if you uploaded files above)"
              />
            </details>
          </div>

          <div className="space-y-3 rounded border border-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Test cases (optional — for the Run button + hidden grading)
              </span>
              <button type="button" onClick={addTest} className="text-xs underline">
                + Add test
              </button>
            </div>
            <p className="text-[11px] leading-relaxed text-neutral-500">
              Each test runs the candidate&apos;s code in one of two ways and checks the output
              against <em>Expected</em>. Pick whichever fits the shape of the problem:
              <br />
              <strong className="text-neutral-300">Call mode</strong> — when the candidate is
              expected to define a function or class method. Fill <em>Call</em> with the
              expression that invokes it (e.g.{" "}
              <code>solve(arg1, arg2)</code>) and leave <em>Stdin</em> blank. The runner appends
              a harness that evaluates the expression after the candidate&apos;s code and prints
              the result as JSON, which is then compared to <em>Expected</em>.
              <br />
              <strong className="text-neutral-300">Stdin mode</strong> — when the candidate is
              expected to write a script that reads input and prints output. Fill <em>Stdin</em>{" "}
              with the input (use <code>\n</code> for new lines) and leave <em>Call</em> blank.
              The program&apos;s stdout is compared to <em>Expected</em>.
              <br />
              Comparison is whitespace- and JSON-tolerant, so <code>[0, 1]</code> and{" "}
              <code>[0,1]</code> both match. Call mode currently supports Python and JS/TS;
              other languages should use stdin mode.
            </p>
            {form.test_cases.length === 0 && (
              <p className="text-xs text-neutral-500">
                No tests — candidate Run just shows program output.
              </p>
            )}
            {form.test_cases.map((t, i) => (
              <div key={i} className="space-y-1.5 rounded border border-neutral-900 p-2">
                <div className="flex items-center justify-between text-xs text-neutral-400">
                  <span>Test {i + 1}</span>
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={t.hidden}
                        onChange={(e) => updateTest(i, { hidden: e.target.checked })}
                      />
                      hidden
                    </label>
                    <button
                      type="button"
                      onClick={() => removeTest(i)}
                      className="text-red-400"
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <input
                  className="w-full rounded bg-neutral-900 px-2 py-1 font-mono text-xs outline-none"
                  value={t.call ?? ""}
                  onChange={(e) => updateTest(i, { call: e.target.value })}
                  placeholder="Call (function-mode), e.g. Solution().twoSum([2,7,11,15], 9)"
                />
                <input
                  className="w-full rounded bg-neutral-900 px-2 py-1 font-mono text-xs outline-none"
                  value={t.stdin}
                  onChange={(e) => updateTest(i, { stdin: e.target.value })}
                  placeholder="Stdin (stdin-mode) — leave empty if using Call"
                />
                <input
                  className="w-full rounded bg-neutral-900 px-2 py-1 font-mono text-xs outline-none"
                  value={t.expected}
                  onChange={(e) => updateTest(i, { expected: e.target.value })}
                  placeholder="Expected output (e.g. [0, 1] or hello world)"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <h3 className="text-lg font-semibold">AI behavior</h3>
          <p className="text-xs text-neutral-500">
            Pre-filled from the selected interview type. Override anything if you want.
          </p>
          <div className="block text-sm text-neutral-400">
            Guardrails (pick one or more — stacked policies apply simultaneously)
            <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
              {GUARDRAIL_PRESETS.map((g) => {
                const checked = form.guardrail_presets.includes(g);
                return (
                  <label
                    key={g}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-3 py-2 text-sm transition ${
                      checked
                        ? "border-emerald-500 bg-emerald-950/30 text-emerald-100"
                        : "border-neutral-800 text-neutral-200 hover:border-neutral-600"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleGuardrail(g)}
                    />
                    {g}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="block text-sm text-neutral-400">
            Extra guardrail instructions (optional)
            <textarea
              className={`${field} mt-1`}
              rows={2}
              value={form.guardrail_custom}
              onChange={(e) => update("guardrail_custom", e.target.value)}
              placeholder="e.g. don't mention dict comprehensions"
            />
          </label>
          <label className="block text-sm text-neutral-400">
            Hallucination probability: {form.hallucination_pct}%
            <input
              type="range"
              min={0}
              max={100}
              value={form.hallucination_pct}
              onChange={(e) => update("hallucination_pct", Number(e.target.value))}
              className="mt-1 w-full"
            />
          </label>
          <label className="block text-sm text-neutral-400">
            Token budget (total input + output, across the whole session; 0 = unlimited)
            <input
              type="number"
              min={0}
              max={200000}
              step={500}
              value={form.token_budget}
              onChange={(e) => update("token_budget", Number(e.target.value))}
              className={`${field} mt-1`}
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Counts input + output of every AI call. When exhausted, the candidate&apos;s chat is blocked.
            </span>
          </label>
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input
              type="checkbox"
              checked={form.enable_pushback}
              onChange={(e) => update("enable_pushback", e.target.checked)}
            />
            Enable real-time push-back questions (extra LLM cost)
          </label>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
        {step === 0 ? (
          <span aria-hidden />
        ) : (
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={busy}
            className="rounded border border-neutral-700 px-4 py-2 text-sm disabled:opacity-40"
          >
            Back
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
            disabled={!canAdvance}
            className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {busy ? "Creating..." : "Create session"}
          </button>
        )}
      </div>
    </div>
  );
}
