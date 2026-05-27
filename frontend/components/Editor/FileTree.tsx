"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";

export interface FileTreeNode {
  id: string;
  path: string;
  is_folder: boolean;
}

interface TreeViewNode {
  name: string;
  fullPath: string;
  id: string | null;
  isFolder: boolean;
  children: TreeViewNode[];
}

// Build a nested folder/file tree from the flat (path, isFolder) list. Synthetic folder nodes
// (without an id) are auto-created for path segments that aren't represented as explicit
// `is_folder` rows so the tree always reflects the path structure even if the interviewer
// uploaded "src/util.py" without first creating "src/".
function buildTree(files: FileTreeNode[]): TreeViewNode {
  const root: TreeViewNode = {
    name: "",
    fullPath: "",
    id: null,
    isFolder: true,
    children: [],
  };
  const folderIndex: Map<string, TreeViewNode> = new Map([["", root]]);

  // Folders first so explicit folder rows get correct ids; then files.
  const sorted = [...files].sort((a, b) => Number(b.is_folder) - Number(a.is_folder));
  for (const f of sorted) {
    const segments = f.path.split("/").filter(Boolean);
    let parent = root;
    let accum = "";
    for (let i = 0; i < segments.length; i += 1) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      accum = accum ? `${accum}/${seg}` : seg;
      const existing = folderIndex.get(accum);
      if (existing) {
        if (isLast && !f.is_folder) {
          existing.isFolder = false;
          existing.id = f.id;
        }
        parent = existing;
        continue;
      }
      const node: TreeViewNode = {
        name: seg,
        fullPath: accum,
        id: isLast ? f.id : null,
        isFolder: isLast ? f.is_folder : true,
        children: [],
      };
      parent.children.push(node);
      folderIndex.set(accum, node);
      parent = node;
    }
  }
  // Sort each level: folders before files, then alpha.
  function sortNode(n: TreeViewNode) {
    n.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    n.children.forEach(sortNode);
  }
  sortNode(root);
  return root;
}

// File tree sidebar for the multi-file IDE. Used by both the candidate (full edit) and the
// interviewer's mirror (readOnly). Features:
//   - Click a file to open it; the active file gets a highlighted row.
//   - Double-click to rename in place.
//   - Right-side ✕ deletes (folder delete cascades; confirmed once).
//   - + File / + Folder buttons create at the current selected folder (or root).
//   - Drag-drop files from the OS onto the panel → calls onUpload with the FileList.
export default function FileTree({
  files,
  activePath,
  onSelect,
  onRename,
  onDelete,
  onCreate,
  onUpload,
  readOnly = false,
}: {
  files: FileTreeNode[];
  activePath: string | null;
  onSelect: (path: string) => void;
  onRename?: (id: string, newPath: string) => void;
  onDelete?: (id: string) => void;
  onCreate?: (path: string, isFolder: boolean) => void;
  onUpload?: (files: FileList, intoFolder: string) => void;
  readOnly?: boolean;
}) {
  const tree = useMemo(() => buildTree(files), [files]);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([""]));
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string>("");
  const [dragOver, setDragOver] = useState(false);
  // Inline-create state: when the user clicks "+ File" / "+ Folder" we render an extra row in
  // the tree with an input instead of popping a browser prompt(). Null = not creating.
  const [creating, setCreating] = useState<
    { isFolder: boolean; parentPath: string } | null
  >(null);
  const [createValue, setCreateValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const uploadFilesRef = useRef<HTMLInputElement | null>(null);
  const uploadFolderRef = useRef<HTMLInputElement | null>(null);

  function toggle(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function startRename(node: TreeViewNode) {
    if (readOnly || !node.id) return;
    setRenamingId(node.id);
    setRenameValue(node.fullPath);
  }

  function commitRename() {
    if (renamingId && renameValue.trim() && onRename) {
      onRename(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }

  function handleDelete(node: TreeViewNode) {
    if (readOnly || !node.id || !onDelete) return;
    const message = node.isFolder
      ? `Delete folder "${node.fullPath}" and everything inside?`
      : `Delete file "${node.fullPath}"?`;
    if (!confirm(message)) return;
    onDelete(node.id);
  }

  function startCreate(isFolder: boolean) {
    if (readOnly || !onCreate) return;
    // Auto-expand the parent folder so the new inline row is visible.
    if (selectedFolder) {
      setExpanded((prev) => new Set(prev).add(selectedFolder));
    }
    setCreating({ isFolder, parentPath: selectedFolder });
    setCreateValue("");
    setError(null);
  }

  function cancelCreate() {
    setCreating(null);
    setCreateValue("");
    setError(null);
  }

  function commitCreate() {
    if (!creating || !onCreate) {
      cancelCreate();
      return;
    }
    const name = createValue.trim();
    if (!name) {
      cancelCreate();
      return;
    }
    if (name.includes("/") || name.includes("\\")) {
      setError("Use the file tree to nest — names can't contain / or \\");
      return;
    }
    const base = creating.parentPath ? `${creating.parentPath}/` : "";
    const fullPath = `${base}${name}`;
    if (files.some((f) => f.path === fullPath)) {
      setError(`"${name}" already exists here`);
      return;
    }
    onCreate(fullPath, creating.isFolder);
    setCreating(null);
    setCreateValue("");
    setError(null);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    if (readOnly || !onUpload) return;
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onUpload(e.dataTransfer.files, selectedFolder);
    }
  }

  function handleUploadInput(e: ChangeEvent<HTMLInputElement>) {
    if (e.target.files && onUpload) {
      onUpload(e.target.files, selectedFolder);
      e.target.value = ""; // allow re-uploading the same file
    }
  }

  function renderCreateRow(depth: number) {
    if (!creating) return null;
    return (
      <div>
        <div
          className="flex items-center gap-1 rounded bg-neutral-900 px-1 py-0.5 text-xs"
          style={{ paddingLeft: depth * 12 + 4 }}
        >
          <span className="w-3" />
          <span className="w-3 text-center text-neutral-500">
            {creating.isFolder ? "📁" : "📄"}
          </span>
          <input
            autoFocus
            value={createValue}
            onChange={(e) => {
              setCreateValue(e.target.value);
              if (error) setError(null);
            }}
            onBlur={commitCreate}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                commitCreate();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancelCreate();
              }
            }}
            placeholder={creating.isFolder ? "folder name" : "file name (e.g. main.py)"}
            className="flex-1 rounded bg-neutral-950 px-1 py-0.5 text-xs outline-none placeholder:text-neutral-600"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
        {error && (
          <div
            className="px-1 py-0.5 text-[10px] text-red-400"
            style={{ paddingLeft: depth * 12 + 24 }}
          >
            {error}
          </div>
        )}
      </div>
    );
  }

  function renderNode(node: TreeViewNode, depth: number): React.ReactNode {
    const isRoot = node.fullPath === "";
    if (isRoot) {
      return (
        <>
          {node.children.map((child) => (
            <div key={child.fullPath}>{renderNode(child, 0)}</div>
          ))}
          {creating && creating.parentPath === "" && renderCreateRow(0)}
        </>
      );
    }
    const isExpanded = expanded.has(node.fullPath);
    const isActive = !node.isFolder && activePath === node.fullPath;
    const isSelectedFolder = node.isFolder && selectedFolder === node.fullPath;
    const renaming = renamingId === node.id;

    return (
      <div>
        <div
          className={`group flex items-center gap-1 rounded px-1 py-0.5 text-xs ${
            isActive
              ? "bg-emerald-900/40 text-emerald-200"
              : isSelectedFolder
                ? "bg-neutral-800 text-neutral-100"
                : "text-neutral-300 hover:bg-neutral-900"
          }`}
          style={{ paddingLeft: depth * 12 + 4 }}
          onClick={() => {
            if (node.isFolder) {
              toggle(node.fullPath);
              setSelectedFolder(node.fullPath);
            } else {
              onSelect(node.fullPath);
              setSelectedFolder(node.fullPath.split("/").slice(0, -1).join("/"));
            }
          }}
          onDoubleClick={() => startRename(node)}
        >
          <span className="w-3 text-neutral-500">
            {node.isFolder ? (isExpanded ? "▾" : "▸") : ""}
          </span>
          <span className="w-3 text-center text-neutral-500">
            {node.isFolder ? "📁" : "📄"}
          </span>
          {renaming ? (
            <input
              autoFocus
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") {
                  setRenamingId(null);
                  setRenameValue("");
                }
              }}
              className="flex-1 rounded bg-neutral-950 px-1 py-0.5 text-xs outline-none"
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span className="flex-1 truncate">{node.name}</span>
          )}
          {!readOnly && node.id && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDelete(node);
              }}
              className="text-neutral-600 opacity-0 hover:text-red-400 group-hover:opacity-100"
              title="Delete"
            >
              ✕
            </button>
          )}
        </div>
        {node.isFolder && isExpanded && (
          <div>
            {node.children.map((c) => renderNode(c, depth + 1))}
            {creating && creating.parentPath === node.fullPath && renderCreateRow(depth + 1)}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={`flex h-full flex-col bg-neutral-950 ${
        dragOver ? "ring-2 ring-emerald-500 ring-inset" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        if (!readOnly) setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <div className="flex items-center justify-between border-b border-neutral-800 px-2 py-1.5 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        <span>Files</span>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => startCreate(false)}
              title="New file in selected folder"
              className="text-neutral-300 hover:text-emerald-300"
            >
              📄+
            </button>
            <button
              type="button"
              onClick={() => startCreate(true)}
              title="New folder in selected folder"
              className="text-neutral-300 hover:text-emerald-300"
            >
              📁+
            </button>
            <button
              type="button"
              onClick={() => uploadFilesRef.current?.click()}
              title="Upload one or more files (Cmd/Ctrl+click to multi-select in the dialog)"
              className="text-neutral-300 hover:text-emerald-300"
            >
              ⬆ files
            </button>
            <button
              type="button"
              onClick={() => uploadFolderRef.current?.click()}
              title="Upload an entire folder (preserves nested structure)"
              className="text-neutral-300 hover:text-emerald-300"
            >
              ⬆ folder
            </button>
            <input
              ref={uploadFilesRef}
              type="file"
              hidden
              multiple
              onChange={handleUploadInput}
            />
            {/*
              webkitdirectory makes the OS dialog return every file in the picked folder, with
              their relative paths populated on `webkitRelativePath`. The interview page's
              upload handler already honors that field, so nested folders Just Work.
            */}
            <input
              ref={uploadFolderRef}
              type="file"
              hidden
              multiple
              // @ts-expect-error — non-standard but widely supported and required for folder picking
              webkitdirectory=""
              directory=""
              onChange={handleUploadInput}
            />
          </div>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-1 text-xs">
        {files.length === 0 && !creating ? (
          <div className="px-2 py-3 text-neutral-500">
            {readOnly
              ? "(no files)"
              : "Drag files here, or use the buttons above to create a file/folder."}
          </div>
        ) : (
          renderNode(tree, 0)
        )}
      </div>
      <div className="border-t border-neutral-900 px-2 py-1 text-[10px] text-neutral-600">
        Selected: {selectedFolder ? `/${selectedFolder}` : "/"}
      </div>
    </div>
  );
}
