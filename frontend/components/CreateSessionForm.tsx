"use client";

import { useState } from "react";

import { api } from "@/lib/api";
import {
  GUARDRAIL_PRESETS,
  INTERVIEW_TYPES,
  type SessionConfig,
  type SessionCreateInput,
  type TestCaseInput,
} from "@/lib/types";

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
    guardrail_custom: "",
    hallucination_pct: DEFAULT_TYPE.defaults.hallucination_pct,
    test_cases: [],
    token_budget: DEFAULT_TYPE.defaults.token_budget,
    enable_pushback: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
      hallucination_pct: t.defaults.hallucination_pct,
      token_budget: t.defaults.token_budget,
    }));
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
      test_cases: [...f.test_cases, { stdin: "", expected: "", hidden: false }],
    }));
  }
  function removeTest(i: number) {
    setForm((f) => ({ ...f, test_cases: f.test_cases.filter((_, idx) => idx !== i) }));
  }

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createSession(form));
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
          <label className="block text-sm text-neutral-400">
            Starting code (optional)
            <textarea
              className={`${field} mt-1 font-mono text-xs`}
              rows={4}
              value={form.starting_code}
              onChange={(e) => update("starting_code", e.target.value)}
              placeholder="Pre-fill the editor for the candidate"
            />
          </label>

          <div className="space-y-2 rounded border border-neutral-800 p-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">
                Test cases (optional — for the Run button + hidden grading)
              </span>
              <button type="button" onClick={addTest} className="text-xs underline">
                + Add test
              </button>
            </div>
            {form.test_cases.length === 0 && (
              <p className="text-xs text-neutral-500">
                No tests — candidate Run just shows program output.
              </p>
            )}
            {form.test_cases.map((t, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <input
                  className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs outline-none"
                  value={t.stdin}
                  onChange={(e) => updateTest(i, { stdin: e.target.value })}
                  placeholder="stdin"
                />
                <input
                  className="flex-1 rounded bg-neutral-900 px-2 py-1 text-xs outline-none"
                  value={t.expected}
                  onChange={(e) => updateTest(i, { expected: e.target.value })}
                  placeholder="expected stdout"
                />
                <label className="flex items-center gap-1 text-xs text-neutral-400">
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
                  className="text-xs text-red-400"
                >
                  ✕
                </button>
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
          <label className="block text-sm text-neutral-400">
            Guardrail preset
            <select
              className={`${field} mt-1`}
              value={form.guardrail_preset}
              onChange={(e) => update("guardrail_preset", e.target.value)}
            >
              {GUARDRAIL_PRESETS.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
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
