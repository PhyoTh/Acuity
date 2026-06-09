"use client";

import { type ChangeEvent, type DragEvent, useState } from "react";

import { Icon, Pill, SectionLabel } from "@/components/ui";
import { api } from "@/lib/api";
import {
  GUARDRAIL_PRESETS,
  HALLUCINATION_TYPES,
  HALLUCINATION_TYPE_LABELS,
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

const STEPS = ["Basics", "Pick a format", "Write the problem", "Tune the AI"] as const;
const STEP_HEADERS: readonly { plain: string; emphasis?: string }[] = [
  { plain: "The basics" },
  { plain: "Pick a format" },
  { plain: "Write the problem" },
  { plain: "Tune the ", emphasis: "AI" },
];

const DEFAULT_TYPE = INTERVIEW_TYPES[0];

/**
 * Multi-step wizard to create an interview session.
 *   1. Basics            — title + language
 *   2. Interview type    — picks one of the 8 presets; pre-fills step 4 defaults
 *   3. Problem statement — prompt + starting code + optional test cases
 *   4. AI behavior       — guardrail preset, custom rules, hallucination %, token budget,
 *                          push-back toggle. Pre-filled from the selected interview type;
 *                          interviewer can override anything before submitting.
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
    hallucination_type: DEFAULT_TYPE.defaults.hallucination_type,
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
    setForm((f) => ({
      ...f,
      interview_type: t.value,
      guardrail_preset: t.defaults.guardrail_preset,
      guardrail_presets: [t.defaults.guardrail_preset],
      hallucination_pct: t.defaults.hallucination_pct,
      hallucination_type: t.defaults.hallucination_type,
      token_budget: t.defaults.token_budget,
    }));
  }

  function toggleGuardrail(preset: string) {
    setForm((f) => {
      const has = f.guardrail_presets.includes(preset);
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
      const wkrp = (f as File & { webkitRelativePath?: string }).webkitRelativePath;
      const path = wkrp && wkrp.length > 0 ? wkrp : f.name;
      try {
        additions.push({ path, content: await f.text() });
      } catch {
        // Binary or unreadable — skip.
      }
    }
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
  const header = STEP_HEADERS[step];

  return (
    <div>
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <SectionLabel>New session</SectionLabel>
          <h1
            className="display mt-2"
            style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.02em" }}
          >
            {header.plain}
            {header.emphasis && (
              <span className="display-italic" style={{ color: "var(--live)" }}>{header.emphasis}</span>
            )}
          </h1>
        </div>
      </div>

      {/* Stepper */}
      <Stepper step={step} />

      {/* Body card */}
      <div
        className="mt-6"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--line-1)",
          borderRadius: "var(--radius-lg)",
          padding: 28,
        }}
      >
        {step === 0 && (
          <div className="flex flex-col gap-5">
            <Field label="Title">
              <input
                className="input"
                value={form.title}
                onChange={(e) => update("title", e.target.value)}
                placeholder="What should we call this interview?"
              />
            </Field>
            <Field label="Language">
              <select
                className="select"
                value={form.language}
                onChange={(e) => update("language", e.target.value)}
              >
                {LANGUAGES.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </Field>
          </div>
        )}

        {step === 1 && (
          <div className="flex flex-col gap-4">
            <p style={{ color: "var(--fg-2)", fontSize: 13.5, lineHeight: 1.55 }}>
              Pick a format — we&apos;ll pre-fill the AI behavior step with sensible defaults. You
              can override anything before saving.
            </p>
            <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
              {INTERVIEW_TYPES.map((t) => {
                const selected = t.value === form.interview_type;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => pickType(t.value)}
                    style={{
                      textAlign: "left",
                      padding: 14,
                      background: selected ? "var(--live-dim)" : "var(--bg-2)",
                      border: `1px solid ${selected ? "var(--live)" : "var(--line-1)"}`,
                      borderRadius: "var(--radius)",
                      cursor: "pointer",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <div style={{ fontSize: 14, color: "var(--fg-0)", fontWeight: 600 }}>
                      {t.label}
                    </div>
                    <div className="mt-1" style={{ fontSize: 12.5, color: "var(--fg-2)", lineHeight: 1.45 }}>
                      {t.description}
                    </div>
                    <div className="mono mt-3" style={{ fontSize: 10.5, color: "var(--fg-3)", letterSpacing: "0.04em" }}>
                      {t.defaults.guardrail_preset} · {t.defaults.hallucination_pct}% halluc · {t.defaults.token_budget.toLocaleString()} tok
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="flex flex-col gap-5">
            <Field label="Problem statement (shown to the candidate)">
              <textarea
                className="textarea"
                rows={4}
                value={form.prompt}
                onChange={(e) => update("prompt", e.target.value)}
                placeholder="Describe the task…"
              />
            </Field>

            <div>
              <SectionLabel>Starter files (optional)</SectionLabel>
              <p className="mt-2" style={{ fontSize: 12, color: "var(--fg-3)", lineHeight: 1.5 }}>
                Drag &amp; drop files here, or click to pick. Folders preserve their structure
                (uploading a folder uses the browser&apos;s relative path). The candidate sees this
                exact tree in their IDE and can edit, rename, or delete.
              </p>
              <div
                className="mt-3"
                style={{
                  border: `2px dashed ${dragOver ? "var(--live)" : "var(--line-2)"}`,
                  background: dragOver ? "var(--live-dim)" : "var(--bg-2)",
                  borderRadius: "var(--radius-lg)",
                  padding: 20,
                  textAlign: "center",
                  color: dragOver ? "var(--live)" : "var(--fg-2)",
                  transition: "all 0.12s ease",
                }}
                onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                onDrop={handleDrop}
              >
                <div style={{ fontSize: 13 }}>Drop files or a folder here</div>
                <div className="mt-3 flex flex-wrap justify-center gap-3" style={{ fontSize: 12.5 }}>
                  <label className="btn btn-sm" style={{ cursor: "pointer" }}>
                    browse files
                    <input type="file" hidden multiple onChange={handleFileInput} />
                  </label>
                  <label className="btn btn-sm" style={{ cursor: "pointer" }}>
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
                <p className="mono mt-3" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                  Tip: Cmd/Ctrl-click to select multiple at once.
                </p>
              </div>
              {pendingFiles.length > 0 && (
                <ul
                  className="mt-3"
                  style={{
                    maxHeight: 192,
                    overflowY: "auto",
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-1)",
                    borderRadius: "var(--radius)",
                    padding: 8,
                  }}
                >
                  {pendingFiles.map((pf) => (
                    <li key={pf.path} className="flex items-center gap-2" style={{ padding: "4px 0" }}>
                      <Icon name="code" size={12} color="var(--fg-3)" />
                      <input
                        className="mono"
                        style={{
                          flex: 1,
                          background: "var(--bg-1)",
                          border: "1px solid var(--line-1)",
                          borderRadius: "var(--radius)",
                          padding: "4px 8px",
                          fontSize: 11.5,
                          color: "var(--fg-0)",
                          outline: "none",
                        }}
                        value={pf.path}
                        onChange={(e) => renamePendingFile(pf.path, e.target.value)}
                      />
                      <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10 }}>
                        {pf.content.length.toLocaleString()} chars
                      </span>
                      <button
                        type="button"
                        onClick={() => removePendingFile(pf.path)}
                        style={{ color: "var(--bad)", background: "transparent", border: "none", cursor: "pointer" }}
                        aria-label={`remove ${pf.path}`}
                      >
                        <Icon name="x" size={14} color="var(--bad)" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-3" style={{ fontSize: 12, color: "var(--fg-2)" }}>
                <summary style={{ cursor: "pointer", color: "var(--fg-3)" }}>
                  or paste a single starter file inline
                </summary>
                <textarea
                  className="textarea mt-2 mono"
                  rows={5}
                  style={{ fontSize: 12 }}
                  value={form.starting_code}
                  onChange={(e) => update("starting_code", e.target.value)}
                  placeholder="(legacy single-file mode — leave empty if you uploaded files above)"
                />
              </details>
            </div>

            <div
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius-lg)",
                padding: 16,
              }}
            >
              <div className="flex items-center justify-between">
                <SectionLabel>Test cases — Run button + hidden grading</SectionLabel>
                <button type="button" onClick={addTest} className="btn btn-sm">
                  <Icon name="plus" size={12} /> Add test
                </button>
              </div>
              <p className="mt-2" style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.55 }}>
                <strong style={{ color: "var(--fg-1)" }}>Call mode</strong> — set <em>Call</em> to a function-call
                expression (e.g. <span className="mono">solve(arg1, arg2)</span>); the runner appends a
                harness that evaluates it and prints the result as JSON.{" "}
                <strong style={{ color: "var(--fg-1)" }}>Stdin mode</strong> — set <em>Stdin</em>
                with the input; stdout is compared to <em>Expected</em>. Comparison is whitespace-
                and JSON-tolerant. Call mode currently supports Python and JS/TS.
              </p>
              {form.test_cases.length === 0 && (
                <p className="mt-3" style={{ fontSize: 12, color: "var(--fg-3)" }}>
                  No tests yet — candidate Run just shows program output.
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2.5">
                {form.test_cases.map((t, i) => (
                  <div
                    key={i}
                    style={{
                      background: "var(--bg-1)",
                      border: "1px solid var(--line-1)",
                      borderRadius: "var(--radius)",
                      padding: 10,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="mono" style={{ fontSize: 11, color: "var(--fg-2)", letterSpacing: "0.04em" }}>
                        Test {i + 1}
                      </span>
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: "var(--fg-2)" }}>
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
                          style={{ color: "var(--bad)", background: "transparent", border: "none", cursor: "pointer" }}
                          aria-label={`remove test ${i + 1}`}
                        >
                          <Icon name="x" size={14} color="var(--bad)" />
                        </button>
                      </div>
                    </div>
                    <input
                      className="input mono mt-2"
                      style={{ fontSize: 11.5, padding: "6px 8px" }}
                      value={t.call ?? ""}
                      onChange={(e) => updateTest(i, { call: e.target.value })}
                      placeholder="Call (function-mode), e.g. Solution().twoSum([2,7,11,15], 9)"
                    />
                    <input
                      className="input mono mt-1.5"
                      style={{ fontSize: 11.5, padding: "6px 8px" }}
                      value={t.stdin}
                      onChange={(e) => updateTest(i, { stdin: e.target.value })}
                      placeholder="Stdin (stdin-mode) — leave empty if using Call"
                    />
                    <input
                      className="input mono mt-1.5"
                      style={{ fontSize: 11.5, padding: "6px 8px" }}
                      value={t.expected}
                      onChange={(e) => updateTest(i, { expected: e.target.value })}
                      placeholder="Expected output (e.g. [0, 1] or hello world)"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="flex flex-col gap-5">
            <p style={{ color: "var(--fg-2)", fontSize: 13.5 }}>
              Pre-filled from <span className="mono" style={{ color: "var(--fg-1)" }}>{form.interview_type}</span>.
              Override anything below.
            </p>

            <Field label="Guardrails (pick one or more — stacked policies apply simultaneously)">
              <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
                {GUARDRAIL_PRESETS.map((g) => {
                  const checked = form.guardrail_presets.includes(g);
                  return (
                    <label
                      key={g}
                      className="flex cursor-pointer items-center gap-2"
                      style={{
                        padding: "9px 12px",
                        background: checked ? "var(--live-dim)" : "var(--bg-2)",
                        border: `1px solid ${checked ? "var(--live)" : "var(--line-1)"}`,
                        borderRadius: "var(--radius)",
                        fontSize: 13,
                        color: checked ? "var(--live)" : "var(--fg-1)",
                      }}
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
            </Field>

            <Field label="Extra guardrail instructions (optional)">
              <textarea
                className="textarea"
                rows={2}
                value={form.guardrail_custom}
                onChange={(e) => update("guardrail_custom", e.target.value)}
                placeholder="e.g. don't mention dict comprehensions"
              />
            </Field>

            <Field
              label={
                <span className="flex items-center justify-between" style={{ width: "100%" }}>
                  <span>Hallucination probability</span>
                  <Pill kind="warn">{form.hallucination_pct}%</Pill>
                </span>
              }
            >
              <input
                type="range"
                min={0}
                max={100}
                value={form.hallucination_pct}
                onChange={(e) => update("hallucination_pct", Number(e.target.value))}
                style={{ accentColor: "var(--warn)", width: "100%" }}
              />
              <div className="mono mt-1 flex justify-between" style={{ fontSize: 10, color: "var(--fg-3)" }}>
                <span>0% — pristine</span>
                <span>50%</span>
                <span>100% — chaos</span>
              </div>
            </Field>

            {form.hallucination_pct > 0 && (
              <Field label="Hallucination type (what kind of flaw the injector introduces)">
                <select
                  className="input mono"
                  value={form.hallucination_type}
                  onChange={(e) => update("hallucination_type", e.target.value)}
                >
                  {HALLUCINATION_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {HALLUCINATION_TYPE_LABELS[t] ?? t}
                    </option>
                  ))}
                </select>
                <span className="mt-1" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                  Each corrupted reply gets exactly one flaw of this kind — match it to what the
                  interview should test (e.g. logic errors for debugging, wrong-API for integration).
                </span>
              </Field>
            )}

            <Field label="Token budget (total input + output, across the whole session; 0 = unlimited)">
              <input
                type="number"
                min={0}
                max={200000}
                step={500}
                value={form.token_budget}
                onChange={(e) => update("token_budget", Number(e.target.value))}
                className="input mono"
              />
              <span className="mt-1" style={{ fontSize: 11, color: "var(--fg-3)" }}>
                Counts input + output of every AI call. When exhausted, the candidate&apos;s chat is blocked.
              </span>
            </Field>

            <label
              className="flex cursor-pointer items-center gap-3"
              style={{
                padding: 12,
                background: "var(--bg-2)",
                border: "1px solid var(--line-1)",
                borderRadius: "var(--radius)",
                fontSize: 13,
                color: "var(--fg-1)",
              }}
            >
              <input
                type="checkbox"
                checked={form.enable_pushback}
                onChange={(e) => update("enable_pushback", e.target.checked)}
              />
              Enable real-time push-back suggestions <span style={{ color: "var(--fg-3)" }}>(extra LLM cost)</span>
            </label>

            {error && (
              <p className="mono" style={{ color: "var(--bad)", fontSize: 12, whiteSpace: "pre-wrap" }}>
                {error}
              </p>
            )}
          </div>
        )}

        {/* Navigation */}
        <div
          className="mt-7 flex items-center justify-between"
          style={{ paddingTop: 20, borderTop: "1px solid var(--line-1)" }}
        >
          {step === 0 ? (
            <span aria-hidden />
          ) : (
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={busy}
              className="btn"
              aria-disabled={busy}
            >
              <Icon name="chevron-left" size={14} /> Back
            </button>
          )}
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              onClick={() => setStep((s) => Math.min(STEPS.length - 1, s + 1))}
              disabled={!canAdvance}
              className="btn btn-primary"
              aria-disabled={!canAdvance}
            >
              Next <Icon name="arrow-right" size={14} />
            </button>
          ) : (
            <button
              type="button"
              onClick={submit}
              disabled={busy}
              className="btn btn-primary"
              aria-disabled={busy}
            >
              {busy ? "Creating…" : <>Create session <Icon name="check" size={14} /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: number }) {
  return (
    <ol className="mt-6 flex items-center gap-3">
      {STEPS.map((label, i) => {
        const isCurrent = i === step;
        const isDone = i < step;
        const bg = isCurrent
          ? "var(--live)"
          : isDone
          ? "var(--live)"
          : "var(--bg-2)";
        const fg = isCurrent || isDone ? "oklch(0.10 0.01 155)" : "var(--fg-2)";
        const ring = isCurrent ? "0 0 0 4px var(--live-dim)" : "none";
        return (
          <li key={label} className="flex items-center gap-3">
            <span
              className="mono tabular"
              style={{
                width: 28,
                height: 28,
                borderRadius: 999,
                background: bg,
                color: fg,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 12,
                fontWeight: 600,
                boxShadow: ring,
                border: isDone || isCurrent ? `1px solid var(--live)` : "1px solid var(--line-2)",
                transition: "all 0.18s ease",
              }}
            >
              {isDone ? <Icon name="check" size={14} color="oklch(0.10 0.01 155)" /> : i + 1}
            </span>
            <span
              style={{
                fontSize: 12.5,
                color: isCurrent ? "var(--fg-0)" : isDone ? "var(--fg-1)" : "var(--fg-3)",
              }}
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <span style={{ width: 32, height: 1, background: "var(--line-2)" }} />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function Field({
  label,
  children,
}: {
  label: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="section-label">{label}</span>
      {children}
    </label>
  );
}
