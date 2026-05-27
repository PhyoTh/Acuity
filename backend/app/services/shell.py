"""Lightweight pseudo-shell for the candidate's terminal.

Wandbox is stateless and the session's "filesystem" lives in Postgres (`session_files`), so we
can't expose a real PTY. Instead, the candidate types commands which we parse + interpret here:

- Built-ins (`ls`, `cat`, `pwd`, `help`, `clear`) operate directly on the in-memory file dict.
- Anything else is treated as a "run this" command. The first token names the runtime
  (`run` / `python` / `node` / `go`) and the next positional argument names the entry file;
  remaining tokens are joined into stdin. We call out to the existing Wandbox executor.

This keeps the shell sandboxed — it can't read outside the session's files, can't fork a real
process, can't reach the network beyond what Wandbox itself does. Every shell command is also
logged to `events` (in ws.py) so the interviewer's replay timeline shows the candidate's
terminal activity.
"""

from __future__ import annotations

import shlex

from app.services import executor

_HELP = (
    "Acuity terminal — available commands:\n"
    "  help                       show this help\n"
    "  ls [path]                  list files (optionally under a folder)\n"
    "  cat <path>                 print a file's contents\n"
    "  pwd                        print the working directory (always /)\n"
    "  clear                      clear the terminal output (client-side)\n"
    "  run [stdin...]             run the project entry file with optional stdin\n"
    "  python <file> [stdin...]   run a python file with optional stdin\n"
    "  node <file> [stdin...]     run a JS/TS file with optional stdin\n"
    "  go run <file> [stdin...]   run a Go file with optional stdin\n"
)


_RUN_VERBS = {"run", "python", "python3", "node", "ts-node", "go"}


def _ls(files: dict[str, str], path: str) -> str:
    """List immediate children of `path`. Empty path lists the root."""
    prefix = path.rstrip("/")
    prefix = f"{prefix}/" if prefix else ""
    names: set[str] = set()
    for p in files.keys():
        if not p.startswith(prefix):
            continue
        rest = p[len(prefix):]
        names.add(rest.split("/")[0])
    return "\n".join(sorted(names))


async def execute(
    *, language: str, files: dict[str, str], single_file_code: str, command: str
) -> dict[str, str]:
    """Run a single shell command and return {stdout, stderr, code}.

    Single-file sessions (no rows in `session_files`) are handled by synthesizing a virtual
    `main.<ext>` entry from `single_file_code` so commands like `run` and `python main.py`
    still work without requiring the interviewer to set up a file tree.
    """
    try:
        parts = shlex.split(command, posix=True)
    except ValueError as e:
        return {"stdout": "", "stderr": f"parse error: {e}", "code": "1"}
    if not parts:
        return {"stdout": "", "stderr": "", "code": "0"}

    cmd = parts[0]
    args = parts[1:]

    # Synthesize the file tree for single-file mode.
    ext_map = {
        "python": "py",
        "javascript": "js",
        "typescript": "ts",
        "java": "java",
        "cpp": "cpp",
        "go": "go",
    }
    if not files:
        ext = ext_map.get(language, "txt")
        files = {f"main.{ext}": single_file_code or ""}

    if cmd in ("help", "?"):
        return {"stdout": _HELP, "stderr": "", "code": "0"}
    if cmd == "pwd":
        return {"stdout": "/", "stderr": "", "code": "0"}
    if cmd == "ls":
        return {"stdout": _ls(files, args[0] if args else ""), "stderr": "", "code": "0"}
    if cmd == "cat":
        if not args:
            return {"stdout": "", "stderr": "cat: missing operand", "code": "1"}
        path = args[0].lstrip("/")
        if path not in files:
            return {"stdout": "", "stderr": f"cat: {path}: No such file", "code": "1"}
        return {"stdout": files[path], "stderr": "", "code": "0"}

    # --- run-style commands -------------------------------------------------------------
    if cmd not in _RUN_VERBS:
        return {"stdout": "", "stderr": f"{cmd}: command not found (try `help`)", "code": "127"}

    entry: str | None = None
    stdin = ""

    if cmd == "run":
        entry = executor.pick_entry_path(language, list(files.keys()))
        if args:
            stdin = "\n".join(args)
    elif cmd == "go":
        # Conventional shape: `go run main.go [stdin...]`
        if not args or args[0] != "run":
            return {"stdout": "", "stderr": "go: only `go run <file>` is supported", "code": "1"}
        entry = args[1] if len(args) > 1 else None
        if len(args) > 2:
            stdin = "\n".join(args[2:])
    else:
        # python / node / ts-node — first arg is the file, rest become stdin lines.
        entry = args[0] if args else None
        if len(args) > 1:
            stdin = "\n".join(args[1:])

    if not entry:
        return {"stdout": "", "stderr": f"{cmd}: missing file argument", "code": "1"}
    entry = entry.lstrip("/")
    if entry not in files:
        return {"stdout": "", "stderr": f"{cmd}: {entry}: No such file", "code": "1"}

    out = await executor.run_code(
        language=language, files=files, entry=entry, stdin=stdin
    )
    return out
