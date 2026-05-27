"""Code execution sandbox via the public Wandbox API (free, no auth, no local infra).

Runs candidate code (optionally with stdin) in an isolated sandbox and returns stdout/stderr/exit.
Used by `/sessions/{id}/run` to check submissions against interviewer-defined test cases.

Supports two test modes (see schemas.TestCase):
- stdin mode: the candidate's program is run as-is and its stdout is compared against `expected`.
- call mode: a per-language harness is appended that evaluates `call` (e.g.
  `Solution().twoSum([2,7,11,15], 9)`) and prints the result. This is what makes LeetCode-style
  problems work — the candidate just defines `class Solution: def twoSum(...)` and the test
  invokes it without needing a `main()`. Outputs are compared after JSON normalization so
  Python's repr (`[0, 1]`) and JSON (`[0, 1]`) both match the interviewer's expected value.

NOTE: the public Piston API (the proposal's first choice) went whitelist-only on 2026-02-15, so we
use Wandbox. To self-host instead, swap this module to a local Piston/Judge0 instance.
"""

from __future__ import annotations

import json

import httpx

_WANDBOX = "https://wandbox.org/api"

# Acuity language id -> Wandbox `language` field
_LANG = {
    "python": "Python",
    "javascript": "JavaScript",
    "typescript": "TypeScript",
    "java": "Java",
    "cpp": "C++",
    "go": "Go",
}
# Extra Wandbox options per language.
_OPTS: dict[str, dict[str, str]] = {"cpp": {"compiler-option-raw": "-std=c++17"}}

_compilers: dict[str, str] | None = None  # Acuity lang -> chosen Wandbox compiler name


def _choose(acuity_lang: str, names: list[str]) -> str:
    """Pick a stable pinned compiler (avoid '*-head'; require cpython-3 for Python)."""
    for name in names:
        if "head" in name:
            continue
        if acuity_lang == "python" and not name.startswith("cpython-3"):
            continue
        return name
    return names[0] if names else ""


async def _resolve(client: httpx.AsyncClient) -> dict[str, str]:
    global _compilers
    if _compilers is None:
        data = (await client.get(f"{_WANDBOX}/list.json", timeout=30)).json()
        by_lang: dict[str, list[str]] = {}
        for c in data:
            by_lang.setdefault(c.get("language", ""), []).append(c["name"])
        _compilers = {
            dl: _choose(dl, by_lang.get(wl, []))
            for dl, wl in _LANG.items()
            if _choose(dl, by_lang.get(wl, []))
        }
    return _compilers


def _wrap_call(language: str, code: str, call: str) -> str:
    """Append a per-language harness that evaluates `call` after the candidate's code and
    prints its result as JSON. Returning the full source for Wandbox.

    Python and JS/TS support full expression-style calls. For Java / C++ / Go we don't currently
    rewrite the entrypoint — fall back to plain stdin mode (`call` is ignored).
    """
    if not call.strip():
        return code
    if language == "python":
        return (
            f"{code}\n\n"
            "# --- Acuity test harness ---\n"
            "import json as _acuity_json\n"
            "try:\n"
            f"    _acuity_result = {call}\n"
            "    print(_acuity_json.dumps(_acuity_result, default=str))\n"
            "except Exception as _acuity_e:\n"
            "    import traceback as _acuity_tb\n"
            "    _acuity_tb.print_exc()\n"
            "    raise SystemExit(1)\n"
        )
    if language in ("javascript", "typescript"):
        return (
            f"{code}\n\n"
            "// --- Acuity test harness ---\n"
            f"console.log(JSON.stringify(({call})));\n"
        )
    return code


def _normalize(s: str) -> str:
    """Normalize a value for equality comparison.

    First try JSON: `[0, 1]` == `[0,1]` == `[0 , 1]`. If both sides parse, compare parsed values.
    Otherwise fall back to whitespace-trimmed text comparison (per-line strip, drop blank lines).
    """
    return s.strip()


def _outputs_match(actual: str, expected: str) -> bool:
    a, e = _normalize(actual), _normalize(expected)
    if a == e:
        return True
    # JSON-aware compare: handles list/dict/number formatting differences.
    try:
        return bool(json.loads(a) == json.loads(e))
    except Exception:
        pass
    # Line-by-line trimmed compare (handles trailing newlines/spaces).
    a_lines = [ln.rstrip() for ln in a.splitlines() if ln.strip()]
    e_lines = [ln.rstrip() for ln in e.splitlines() if ln.strip()]
    return a_lines == e_lines


_LANG_MAIN: dict[str, list[str]] = {
    "python": ["main.py"],
    "javascript": ["main.js", "index.js"],
    "typescript": ["main.ts", "index.ts"],
    "java": ["Main.java"],
    "cpp": ["main.cpp"],
    "go": ["main.go"],
}


def pick_entry_path(language: str, paths: list[str]) -> str | None:
    """Pick the file to run as the entry point.

    Strategy: prefer the language's conventional name at the project root (main.py / Main.java
    / main.go / etc.) — case-insensitive. If none matches, return the first file with the
    language's expected extension. Else None.
    """
    candidates = [p.lower() for p in _LANG_MAIN.get(language, [])]
    files = [p for p in paths if not p.endswith("/")]
    for c in candidates:
        for p in files:
            if p.lower() == c or p.lower().endswith("/" + c):
                return p
    ext_map = {
        "python": ".py",
        "javascript": ".js",
        "typescript": ".ts",
        "java": ".java",
        "cpp": ".cpp",
        "go": ".go",
    }
    ext = ext_map.get(language)
    if ext:
        for p in files:
            if p.lower().endswith(ext):
                return p
    return None


async def run_code(
    *,
    language: str,
    code: str = "",
    stdin: str = "",
    call: str = "",
    files: dict[str, str] | None = None,
    entry: str | None = None,
) -> dict[str, str]:
    """Execute the candidate's program and return {stdout, stderr, code}.

    Two modes:
    - Single-file (legacy): pass `code` (and optionally `call`). The runner compiles `code` as
      the main file with the per-language harness appended for `call` mode.
    - Multi-file: pass `files` (path -> content) and `entry` (the path to run as main). The
      runner sends every file to Wandbox as a `codes[]` entry and uses `entry`'s contents
      (with `call` harness if any) as the main source.
    """
    if files:
        if not entry or entry not in files:
            chosen = pick_entry_path(language, list(files.keys()))
            if chosen is None:
                return {"stdout": "", "stderr": "No runnable entry file found", "code": "1"}
            entry = chosen
        main_src = _wrap_call(language, files[entry], call) if call else files[entry]
        extra = [{"file": p, "code": c} for p, c in files.items() if p != entry]
    else:
        main_src = _wrap_call(language, code, call) if call else code
        extra = []

    async with httpx.AsyncClient() as client:
        compilers = await _resolve(client)
        compiler = compilers.get(language)
        if not compiler:
            return {"stdout": "", "stderr": f"Unsupported language: {language}", "code": "1"}
        body: dict[str, object] = {"compiler": compiler, "code": main_src, "stdin": stdin}
        if extra:
            body["codes"] = extra
        body.update(_OPTS.get(language, {}))
        resp = await client.post(f"{_WANDBOX}/compile.json", json=body, timeout=60)
        resp.raise_for_status()
        out = resp.json()
        return {
            "stdout": out.get("program_output", "") or "",
            "stderr": (out.get("compiler_error", "") or "") + (out.get("program_error", "") or ""),
            "code": str(out.get("status", "") or ""),
        }


# Public: also exposed so the router can use the same comparison logic.
outputs_match = _outputs_match
