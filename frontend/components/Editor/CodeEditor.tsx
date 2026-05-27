"use client";

import Editor from "@monaco-editor/react";
import { useEffect, useRef } from "react";

// Cursor position broadcast by the candidate's editor; mirrored as a decoration on the
// interviewer's read-only mirror.
export interface CursorPos {
  line: number;
  column: number;
}

// Minimal structural types — we don't pull monaco-editor's full types in to avoid a heavy import.
interface PasteCapableEditor {
  onDidPaste(listener: (e: { range: unknown }) => void): void;
  onDidChangeCursorPosition(listener: (
    e: { position: { lineNumber: number; column: number } },
  ) => void): void;
  getModel(): { getValueInRange(range: unknown): string } | null;
  deltaDecorations(oldIds: string[], newDecs: unknown[]): string[];
}

interface MonacoNs {
  Range: new (sl: number, sc: number, el: number, ec: number) => unknown;
}

// Monaco wrapper for the candidate IDE and the interviewer's read-only mirror.
//   - `onPaste` reports the length of pasted text (used for copy-paste cheat detection).
//   - `onCursorChange` reports the candidate's caret position; the interviewer page feeds
//     `remoteCursor` back in so a ghost decoration follows the candidate live.
export default function CodeEditor({
  value,
  language,
  onChange,
  onPaste,
  onCursorChange,
  remoteCursor,
  readOnly = false,
}: {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  onPaste?: (length: number) => void;
  onCursorChange?: (pos: CursorPos) => void;
  remoteCursor?: CursorPos | null;
  readOnly?: boolean;
}) {
  const editorRef = useRef<PasteCapableEditor | null>(null);
  const monacoRef = useRef<MonacoNs | null>(null);
  const decorationsRef = useRef<string[]>([]);

  function applyRemoteCursor(pos: CursorPos | null | undefined) {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    if (!pos) {
      decorationsRef.current = editor.deltaDecorations(decorationsRef.current, []);
      return;
    }
    const range = new monaco.Range(pos.line, pos.column, pos.line, pos.column);
    decorationsRef.current = editor.deltaDecorations(decorationsRef.current, [
      {
        range,
        options: {
          className: "acuity-remote-cursor",
          beforeContentClassName: "acuity-remote-cursor-caret",
          stickiness: 1,
          hoverMessage: { value: "candidate cursor" },
        },
      },
    ]);
  }

  useEffect(() => {
    applyRemoteCursor(remoteCursor ?? null);
  }, [remoteCursor]);

  function handleMount(editor: PasteCapableEditor, monaco: MonacoNs) {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (onPaste) {
      editor.onDidPaste((e) => {
        const length = editor.getModel()?.getValueInRange(e.range).length ?? 0;
        onPaste(length);
      });
    }
    if (onCursorChange) {
      editor.onDidChangeCursorPosition((e) => {
        onCursorChange({ line: e.position.lineNumber, column: e.position.column });
      });
    }
    if (remoteCursor) applyRemoteCursor(remoteCursor);
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={(editor, monaco) =>
        handleMount(editor as unknown as PasteCapableEditor, monaco as unknown as MonacoNs)
      }
      options={{
        readOnly,
        minimap: { enabled: false },
        fontSize: 14,
        scrollBeyondLastLine: false,
        automaticLayout: true,
      }}
    />
  );
}
