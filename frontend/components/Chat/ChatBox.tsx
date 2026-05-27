"use client";

import { type FormEvent, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  was_hallucinated?: boolean;
}

// Chat transcript + composer. Used live by the candidate and read-only on the interviewer dashboard.
// Assistant messages render as markdown so bold/italics/code-fences/lists display properly
// (Claude's replies frequently contain markdown). User messages stay plain-text.
//
// When `exhausted` is true (session-wide AI token budget hit), the composer is replaced with a
// disabled "no AI help left" banner so the candidate can't even attempt to type — making the
// state much clearer than a passive notice at the top of the page.
export default function ChatBox({
  messages,
  onSend,
  readOnly = false,
  busy = false,
  exhausted = false,
}: {
  messages: ChatMessage[];
  onSend?: (content: string) => void;
  readOnly?: boolean;
  busy?: boolean;
  exhausted?: boolean;
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
        {messages.length === 0 && !busy && (
          <p className="text-sm text-neutral-500">No messages yet.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "text-right" : "text-left"}>
            <div
              className={`inline-block max-w-[90%] rounded px-3 py-2 text-sm ${
                m.role === "user"
                  ? "whitespace-pre-wrap bg-blue-600 text-white"
                  : "bg-neutral-800 text-neutral-100"
              }`}
            >
              {m.role === "assistant" ? (
                <div className="markdown-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{m.content}</ReactMarkdown>
                </div>
              ) : (
                m.content
              )}
            </div>
            {m.was_hallucinated && (
              <div className="mt-1 text-xs font-semibold text-amber-400">
                flagged: hallucinated
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded bg-neutral-800 px-3 py-2 text-sm text-neutral-300">
              <span className="flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-neutral-400" />
              </span>
              <span className="text-neutral-400">Claude is thinking…</span>
            </div>
          </div>
        )}
      </div>
      {!readOnly && exhausted && (
        <div className="border-t border-amber-700/40 bg-amber-950/30 p-3 text-xs">
          <div className="font-semibold text-amber-300">
            AI assistance has run out for this interview
          </div>
          <p className="mt-1 text-amber-200/70">
            The interviewer set a token budget for AI help and it&apos;s been used up. You can
            keep coding and running tests — the AI just won&apos;t reply to new messages.
          </p>
          <div className="mt-2 flex gap-2">
            <input
              className="flex-1 cursor-not-allowed rounded bg-neutral-900/50 px-3 py-2 text-sm text-neutral-600 outline-none"
              value=""
              placeholder="AI is disabled for the rest of this session"
              disabled
              readOnly
            />
            <button
              type="button"
              className="cursor-not-allowed rounded bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-600"
              disabled
              title="AI token budget exhausted"
            >
              Send
            </button>
          </div>
        </div>
      )}
      {!readOnly && !exhausted && (
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
