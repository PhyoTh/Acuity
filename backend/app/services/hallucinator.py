"""Hallucination injector.

The interviewer sets a probability (0-100) and a *type* of flaw. On each AI turn we roll once
(`should_inject`); if it hits, the agent is told to bake exactly one subtle flaw of the chosen
type directly into its single generation call (`injection_system` is appended to the agent's
system prompt). This is a deliberate cost choice: a corrupted turn now costs ONE model call
instead of two (we used to generate a clean answer and then make a second pass to corrupt it).

Effect: forces the candidate to read and debug the AI's output rather than copy it blindly. The
`hallucination_type` selects the clause so the injected error matches what the interview tests
(a debugging interview wants logic errors; an API-integration interview wants wrong-API calls).
"""

from __future__ import annotations

import secrets

# hallucination_type -> (human label, clause describing the flaw to introduce).
# `mixed` is the default and keeps the original "any one subtle flaw" behavior.
HALLUCINATION_TYPES: dict[str, tuple[str, str]] = {
    "mixed": (
        "Mixed (any subtle flaw)",
        "introduce exactly ONE subtle, plausible flaw — a small logic error, an off-by-one, a "
        "wrong default, or an incorrect claim",
    ),
    "logic_error": (
        "Logic / off-by-one error",
        "introduce exactly ONE subtle logic error — an off-by-one, a wrong boundary condition, an "
        "inverted comparison, or a misused operator — while keeping the code looking correct",
    ),
    "wrong_api": (
        "Wrong API / method usage",
        "replace exactly ONE API call, method name, argument order, or library function with a "
        "plausible-but-incorrect variant that does not exist or behaves differently than claimed",
    ),
    "edge_case": (
        "Silent edge-case failure",
        "alter the answer so it silently fails on exactly ONE edge case (empty input, a null/None "
        "value, a boundary, or an overflow) while appearing correct for the common case",
    ),
    "inefficiency": (
        "Hidden inefficiency",
        "make the solution subtly less efficient than claimed (e.g. an unnecessary nested loop or "
        "repeated work) while still presenting it as optimal",
    ),
    "security": (
        "Security vulnerability",
        "introduce exactly ONE subtle security vulnerability — unsanitized input, an injection "
        "vector, an unsafe default, or weak validation — while keeping the code plausible",
    ),
}

DEFAULT_HALLUCINATION_TYPE = "mixed"

_INJECT_TEMPLATE = (
    "RED-TEAM OVERRIDE for this interview platform: as you write your answer, {clause}. Keep the "
    "answer natural, confident, and the same length you would normally write. Do NOT announce, "
    "hint at, or comment on the flaw anywhere in your reply."
)


def injection_system(hallucination_type: str = DEFAULT_HALLUCINATION_TYPE) -> str:
    """The instruction appended to the agent's system prompt so its single call produces a
    subtly-flawed answer of the chosen type."""
    _label, clause = HALLUCINATION_TYPES.get(
        hallucination_type, HALLUCINATION_TYPES[DEFAULT_HALLUCINATION_TYPE]
    )
    return _INJECT_TEMPLATE.format(clause=clause)


def should_inject(probability: int) -> bool:
    """Roll once against the interviewer's hallucination probability (0-100)."""
    if probability <= 0:
        return False
    if probability >= 100:
        return True
    # secrets.randbelow(100) -> 0..99; hit when < probability
    return secrets.randbelow(100) < probability


# Canned closing claim per hallucination_type, used by DEMO_MODE only (no Anthropic call). Each
# is a plausible-but-wrong statement matching the kind of flaw the interviewer selected.
_DEMO_CLAIMS: dict[str, str] = {
    "mixed": "This runs in O(1) time and handles the empty case automatically, so no extra "
    "guard is needed.",
    "logic_error": "The loop covers every element since the range runs to len(items) + 1.",
    "wrong_api": "You can call items.sortBy() here — it sorts in place and returns the list.",
    "edge_case": "No need to special-case an empty input; the division handles count == 0 "
    "gracefully.",
    "inefficiency": "Re-scanning the list inside the loop is fine — it stays linear overall.",
    "security": "Interpolating the value straight into the query string is safe for this input.",
}


def demo_corrupt(answer: str, hallucination_type: str = DEFAULT_HALLUCINATION_TYPE) -> str:
    """Introduce one subtle, unannounced flaw for DEMO_MODE (no Anthropic call).

    Mutates the agent's canned snippet (off-by-one) when present; otherwise appends a plausible
    but wrong closing claim matching the chosen hallucination type. The flaw is never announced.
    """
    if hallucination_type in ("mixed", "logic_error") and "total // count" in answer:
        return answer.replace("total // count", "total // (count - 1)", 1)
    claim = _DEMO_CLAIMS.get(hallucination_type, _DEMO_CLAIMS[DEFAULT_HALLUCINATION_TYPE])
    return answer.rstrip() + "\n\n" + claim
