"use client";

import { type FormEvent, useState } from "react";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  was_hallucinated?: boolean;
}

// Chat transcript + composer. Used live by the candidate and read-only on the interviewer dashboard.
export default function ChatBox({
  messages,
  onSend,
  readOnly = false,
  busy = false,
}: {
  messages: ChatMessage[];
  onSend?: (content: string) => void;
  readOnly?: boolean;
  busy?: boolean;
}) {
  const [text, setText] = useState("");

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return;
    onSend?.(value);
    setText("");
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">No messages yet.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] whitespace-pre-wrap rounded px-3 py-2 text-sm ${
                m.role === "user" ? "bg-blue-600 text-white" : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {m.content}
            </div>
            {m.was_hallucinated && (
              <div className="mt-1 text-xs font-semibold text-amber-400">
                flagged: hallucinated
              </div>
            )}
          </div>
        ))}
      </div>
      {!readOnly && (
        <form onSubmit={submit} className="flex gap-2 border-t border-neutral-800 p-2">
          <input
            className="flex-1 rounded bg-neutral-900 px-3 py-2 text-sm outline-none"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask the AI assistant..."
            disabled={busy}
          />
          <button
            type="submit"
            className="rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            disabled={busy}
          >
            Send
          </button>
        </form>
      )}
    </div>
  );
}
