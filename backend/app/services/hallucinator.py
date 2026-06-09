"""Hallucination injector.

Inputs : the agent's (correct) answer + the session's hallucination probability (0-100) and the
         interviewer-selected hallucination *type*.
Output : with probability p, a subtly corrupted version (one plausible flaw of the chosen type);
         otherwise the original answer unchanged. Returns a flag so the interviewer dashboard can
         mark the turn.
Effect : forces the candidate to read and debug the AI's output rather than copy it blindly.

Implementation (locked, plan.md §3): a second Claude pass that introduces a SUBTLE flaw. The
interviewer picks *which kind* of flaw via `hallucination_type` — the type selects the rewrite
clause below so the injected error matches what the interview is meant to test (e.g. a debugging
interview wants logic errors; an API-integration interview wants wrong-API calls).
"""

from __future__ import annotations

import secrets

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm import get_chat_model, message_text

# hallucination_type -> (human label, rewrite clause inserted into the system prompt).
# `mixed` is the default and preserves the original "any one subtle flaw" behavior.
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
        "rewrite the solution so it is subtly less efficient than claimed (e.g. an unnecessary "
        "nested loop or repeated work) while still presenting it as optimal",
    ),
    "security": (
        "Security vulnerability",
        "introduce exactly ONE subtle security vulnerability — unsanitized input, an injection "
        "vector, an unsafe default, or weak validation — while keeping the code plausible",
    ),
}

DEFAULT_HALLUCINATION_TYPE = "mixed"

_REWRITE_SYSTEM_TEMPLATE = (
    "You are a red-team assistant for an interview platform. You rewrite a coding assistant's "
    "answer so that you {clause}. Keep the same length, tone, and structure. Do NOT announce, "
    "hint at, or comment on the flaw. Return only the rewritten answer."
)


def _rewrite_system(hallucination_type: str) -> str:
    _label, clause = HALLUCINATION_TYPES.get(
        hallucination_type, HALLUCINATION_TYPES[DEFAULT_HALLUCINATION_TYPE]
    )
    return _REWRITE_SYSTEM_TEMPLATE.format(clause=clause)


def _rolls_hit(probability: int) -> bool:
    if probability <= 0:
        return False
    if probability >= 100:
        return True
    # secrets.randbelow(100) -> 0..99; hit when < probability
    return secrets.randbelow(100) < probability


async def maybe_inject(
    *,
    answer: str,
    probability: int,
    hallucination_type: str = DEFAULT_HALLUCINATION_TYPE,
) -> tuple[str, bool]:
    """Return (possibly_corrupted_answer, was_hallucinated)."""
    if not _rolls_hit(probability):
        return answer, False

    model = get_chat_model(temperature=1.0)
    response = await model.ainvoke(
        [SystemMessage(content=_rewrite_system(hallucination_type)), HumanMessage(content=answer)]
    )
    corrupted = message_text(response).strip()
    if not corrupted:
        return answer, False
    return corrupted, True
