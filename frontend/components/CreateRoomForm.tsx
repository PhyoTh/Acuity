"use client";

import { type FormEvent, useState } from "react";

import { api } from "@/lib/api";
import {
  GUARDRAIL_PRESETS,
  type RoomConfig,
  type RoomCreateInput,
  type TestCaseInput,
} from "@/lib/types";

const LANGUAGES = ["python", "javascript", "typescript", "java", "cpp", "go"];

// Recruiter form to create an interview room (problem + AI config + D2 settings).
export default function CreateRoomForm({ onCreated }: { onCreated: (room: RoomConfig) => void }) {
  const [form, setForm] = useState<RoomCreateInput>({
    title: "Untitled interview",
    language: "python",
    prompt: "",
    starting_code: "",
    guardrail_preset: "hints_only",
    guardrail_custom: "",
    hallucination_pct: 0,
    test_cases: [],
    query_quota: 0,
    ai_max_tokens: null,
    enable_pushback: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function update<K extends keyof RoomCreateInput>(key: K, value: RoomCreateInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
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

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await api.createRoom(form));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create room");
    } finally {
      setBusy(false);
    }
  }

  const field = "w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none";

  return (
    <form onSubmit={submit} className="space-y-3 rounded border border-neutral-800 p-4">
      <h3 className="text-lg font-semibold">New interview room</h3>
      <input
        className={field}
        value={form.title}
        onChange={(e) => update("title", e.target.value)}
        placeholder="Title"
      />
      <div className="flex gap-3">
        <select
          className={field}
          value={form.language}
          onChange={(e) => update("language", e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <select
          className={field}
          value={form.guardrail_preset}
          onChange={(e) => update("guardrail_preset", e.target.value)}
        >
          {GUARDRAIL_PRESETS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>
      <textarea
        className={field}
        rows={3}
        value={form.prompt}
        onChange={(e) => update("prompt", e.target.value)}
        placeholder="Problem statement shown to the candidate"
      />
      <textarea
        className={field}
        rows={3}
        value={form.starting_code}
        onChange={(e) => update("starting_code", e.target.value)}
        placeholder="Starting code (optional)"
      />
      <textarea
        className={field}
        rows={2}
        value={form.guardrail_custom}
        onChange={(e) => update("guardrail_custom", e.target.value)}
        placeholder="Extra guardrail instructions (optional)"
      />

      {/* Test cases (code execution) */}
      <div className="space-y-2 rounded border border-neutral-800 p-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Test cases (Run / hidden grading)</span>
          <button type="button" onClick={addTest} className="text-xs underline">
            + Add test
          </button>
        </div>
        {form.test_cases.length === 0 && (
          <p className="text-xs text-neutral-500">No test cases — candidate Run just shows output.</p>
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
            <button type="button" onClick={() => removeTest(i)} className="text-xs text-red-400">
              ✕
            </button>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <label className="text-neutral-400">
          AI query quota (0 = unlimited)
          <input
            type="number"
            min={0}
            max={1000}
            value={form.query_quota}
            onChange={(e) => update("query_quota", Number(e.target.value))}
            className={`${field} mt-1`}
          />
        </label>
        <label className="text-neutral-400">
          AI max tokens (blank = default)
          <input
            type="number"
            min={64}
            max={8192}
            value={form.ai_max_tokens ?? ""}
            onChange={(e) =>
              update("ai_max_tokens", e.target.value === "" ? null : Number(e.target.value))
            }
            className={`${field} mt-1`}
          />
        </label>
      </div>

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

      <label className="flex items-center gap-2 text-sm text-neutral-400">
        <input
          type="checkbox"
          checked={form.enable_pushback}
          onChange={(e) => update("enable_pushback", e.target.checked)}
        />
        Enable real-time push-back questions (extra LLM cost)
      </label>

      {error && <p className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
        disabled={busy}
      >
        {busy ? "Creating..." : "Create room"}
      </button>
    </form>
  );
}
