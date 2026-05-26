"use client";

import Editor from "@monaco-editor/react";

// Minimal structural type so we don't need the monaco-editor package just for types.
interface PasteCapableEditor {
  onDidPaste(listener: (e: { range: unknown }) => void): void;
  getModel(): { getValueInRange(range: unknown): string } | null;
}

// Monaco wrapper for the candidate IDE and the recruiter's read-only mirror.
// `onPaste` reports the length of pasted text (used for copy-paste cheat detection).
export default function CodeEditor({
  value,
  language,
  onChange,
  onPaste,
  readOnly = false,
}: {
  value: string;
  language: string;
  onChange?: (value: string) => void;
  onPaste?: (length: number) => void;
  readOnly?: boolean;
}) {
  function handleMount(editor: PasteCapableEditor) {
    if (!onPaste) return;
    editor.onDidPaste((e) => {
      const length = editor.getModel()?.getValueInRange(e.range).length ?? 0;
      onPaste(length);
    });
  }

  return (
    <Editor
      height="100%"
      language={language}
      theme="vs-dark"
      value={value}
      onChange={(v) => onChange?.(v ?? "")}
      onMount={handleMount}
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
