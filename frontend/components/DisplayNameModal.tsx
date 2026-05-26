"use client";

import { type FormEvent, useEffect, useState } from "react";

// Modal that gates entry into a session. Both interviewer and candidate confirm a display name
// before the session UI renders. The backend pre-generates a fun random name (e.g. "sillyraccoon")
// when a profile is first created; the user can keep it or pick their own here. Confirmation is
// remembered per-session in localStorage so refreshing doesn't re-show the modal.
export default function DisplayNameModal({
  open,
  defaultName,
  onConfirm,
}: {
  open: boolean;
  defaultName: string;
  onConfirm: (name: string) => Promise<void> | void;
}) {
  const [name, setName] = useState(defaultName);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(defaultName);
  }, [defaultName]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const value = name.trim();
    if (!value) {
      setError("Pick a name before continuing.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save name");
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <form
        onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-lg border border-neutral-800 bg-neutral-950 p-5"
      >
        <div>
          <h2 className="text-lg font-semibold">Pick a display name</h2>
          <p className="mt-1 text-xs text-neutral-400">
            This is the name everyone else in the session sees. Keep the suggestion or pick
            your own.
          </p>
        </div>
        <input
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your display name"
          maxLength={64}
          autoFocus
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Saving..." : "Use this name"}
        </button>
      </form>
    </div>
  );
}
