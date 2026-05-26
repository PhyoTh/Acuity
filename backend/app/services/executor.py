"""Code execution sandbox via the public Wandbox API (free, no auth, no local infra).

Runs candidate code (optionally with stdin) in an isolated sandbox and returns stdout/stderr/exit.
Used by `/sessions/{id}/run` to check submissions against interviewer-defined test cases.

NOTE: the public Piston API (the proposal's first choice) went whitelist-only on 2026-02-15, so we
use Wandbox. To self-host instead, swap this module to a local Piston/Judge0 instance.
"""

from __future__ import annotations

import httpx

_WANDBOX = "https://wandbox.org/api"

# DevLens language id -> Wandbox `language` field
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

_compilers: dict[str, str] | None = None  # DevLens lang -> chosen Wandbox compiler name


def _choose(devlens_lang: str, names: list[str]) -> str:
    """Pick a stable pinned compiler (avoid '*-head'; require cpython-3 for Python)."""
    for name in names:
        if "head" in name:
            continue
        if devlens_lang == "python" and not name.startswith("cpython-3"):
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


async def run_code(*, language: str, code: str, stdin: str = "") -> dict[str, str]:
    """Execute `code` and return {stdout, stderr, code}. Compile/runtime errors land in stderr."""
    async with httpx.AsyncClient() as client:
        compilers = await _resolve(client)
        compiler = compilers.get(language)
        if not compiler:
            return {"stdout": "", "stderr": f"Unsupported language: {language}", "code": "1"}
        body: dict[str, str] = {"compiler": compiler, "code": code, "stdin": stdin}
        body.update(_OPTS.get(language, {}))
        resp = await client.post(f"{_WANDBOX}/compile.json", json=body, timeout=60)
        resp.raise_for_status()
        out = resp.json()
        return {
            "stdout": out.get("program_output", "") or "",
            "stderr": (out.get("compiler_error", "") or "") + (out.get("program_error", "") or ""),
            "code": str(out.get("status", "") or ""),
        }
