"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";

import FileTree, { type FileTreeNode } from "@/components/Editor/FileTree";
import type { CursorPos } from "@/components/Editor/CodeEditor";

const CodeEditor = dynamic(() => import("@/components/Editor/CodeEditor"), { ssr: false });

export interface MultiFile extends FileTreeNode {
  content: string;
}

// Language detection from file extension. Used for Monaco syntax highlighting on the active
// file. Falls back to the session's language hint so a fresh empty file still highlights.
function detectLanguage(path: string, fallback: string): string {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  return (
    {
      py: "python",
      js: "javascript",
      ts: "typescript",
      tsx: "typescript",
      jsx: "javascript",
      java: "java",
      cpp: "cpp",
      cc: "cpp",
      h: "cpp",
      go: "go",
      json: "json",
      md: "markdown",
      html: "html",
      css: "css",
      sql: "sql",
    }[ext] ?? fallback
  );
}

// Tabbed multi-file editor for the candidate IDE + the interviewer's read-only mirror.
//   ┌──────────┬────────────────────────────┐
//   │ FileTree │  file tabs                 │
//   │          │  ────────────────────────  │
//   │          │  Monaco for activePath     │
//   └──────────┴────────────────────────────┘
// All file mutations bubble up via callbacks; this component is presentational + tab state.
export default function MultiFileEditor({
  files,
  fallbackLanguage,
  activePath,
  onActivePathChange,
  onContentChange,
  onCreate,
  onRename,
  onDelete,
  onUpload,
  onPaste,
  onCursorChange,
  remoteCursor,
  readOnly = false,
}: {
  files: MultiFile[];
  fallbackLanguage: string;
  activePath: string | null;
  onActivePathChange: (path: string | null) => void;
  onContentChange?: (path: string, content: string) => void;
  onCreate?: (path: string, isFolder: boolean) => void;
  onRename?: (id: string, newPath: string) => void;
  onDelete?: (id: string) => void;
  onUpload?: (files: FileList, intoFolder: string) => void;
  onPaste?: (length: number) => void;
  onCursorChange?: (pos: CursorPos) => void;
  remoteCursor?: CursorPos | null;
  readOnly?: boolean;
}) {
  // Open tabs: when the user clicks a file in the tree we add it to `openPaths` and make it
  // active. Closing a tab removes it. The active file's content is rendered in Monaco.
  const [openPaths, setOpenPaths] = useState<string[]>(() => (activePath ? [activePath] : []));

  // Keep open tabs in sync with the active path coming in from the parent.
  useEffect(() => {
    if (activePath && !openPaths.includes(activePath)) {
      setOpenPaths((p) => [...p, activePath]);
    }
  }, [activePath, openPaths]);

  // If the active file got deleted, close the tab and pick a sibling.
  useEffect(() => {
    const filePaths = new Set(files.filter((f) => !f.is_folder).map((f) => f.path));
    if (activePath && !filePaths.has(activePath)) {
      const remaining = openPaths.filter((p) => p !== activePath && filePaths.has(p));
      const next = remaining[remaining.length - 1] ?? null;
      setOpenPaths(remaining);
      onActivePathChange(next);
    }
  }, [files, activePath, openPaths, onActivePathChange]);

  const activeFile = useMemo(
    () => files.find((f) => f.path === activePath && !f.is_folder) ?? null,
    [files, activePath],
  );

  function openFile(path: string) {
    setOpenPaths((p) => (p.includes(path) ? p : [...p, path]));
    onActivePathChange(path);
  }

  function closeTab(path: string) {
    setOpenPaths((p) => {
      const next = p.filter((x) => x !== path);
      if (activePath === path) {
        const fallback = next[next.length - 1] ?? null;
        onActivePathChange(fallback);
      }
      return next;
    });
  }

  // Layout uses flex (not CSS grid) so the editor column can carry `min-w-0`. Without that,
  // the column's intrinsic min-content width equals Monaco's longest line, which forces the
  // sidebar offscreen and prevents Monaco from showing its own horizontal scrollbar — exactly
  // the "I can only see code by hiding the problem panel" bug. `min-w-0` + `min-h-0` let the
  // editor accept whatever space the parent gives it and render scrollbars inside.
  return (
    <div className="flex h-full w-full overflow-hidden">
      <div className="w-[200px] shrink-0 overflow-hidden border-r border-neutral-800">
        <FileTree
          files={files.map(({ id, path, is_folder }) => ({ id, path, is_folder }))}
          activePath={activePath}
          onSelect={openFile}
          onRename={onRename}
          onDelete={onDelete}
          onCreate={onCreate}
          onUpload={onUpload}
          readOnly={readOnly}
        />
      </div>
      <div className="flex h-full min-w-0 flex-1 flex-col">
        {openPaths.length > 0 && (
          <div className="flex shrink-0 items-center gap-0.5 overflow-x-auto border-b border-neutral-800 bg-neutral-950 px-1">
            {openPaths.map((p) => {
              const active = p === activePath;
              return (
                <div
                  key={p}
                  className={`group flex shrink-0 items-center gap-1 border-r border-neutral-900 px-2 py-1 text-xs ${
                    active ? "bg-neutral-900 text-emerald-300" : "text-neutral-400"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onActivePathChange(p)}
                    className="max-w-[180px] truncate"
                  >
                    {p.split("/").pop()}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeTab(p)}
                    className="text-neutral-600 hover:text-red-400"
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        )}
        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {activeFile ? (
            <CodeEditor
              value={activeFile.content}
              language={detectLanguage(activeFile.path, fallbackLanguage)}
              onChange={(v) => onContentChange?.(activeFile.path, v)}
              onPaste={onPaste}
              onCursorChange={onCursorChange}
              remoteCursor={remoteCursor}
              readOnly={readOnly}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-neutral-500">
              {files.length === 0
                ? readOnly
                  ? "No files in this project yet."
                  : "Add a file from the sidebar to get started."
                : "Select a file from the sidebar."}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
