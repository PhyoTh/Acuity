"""Hallucination injector.

Inputs : the agent's (correct) answer + the room's hallucination probability (0-100).
Output : with probability p, a subtly corrupted version (one plausible flaw); otherwise the
         original answer unchanged. Returns a flag so the recruiter dashboard can mark the turn.
Effect : forces the candidate to read and debug the AI's output rather than copy it blindly.

Implementation (locked, plan.md §3): a second Claude pass that introduces a SUBTLE flaw.
"""

from __future__ import annotations

import secrets

from langchain_core.messages import HumanMessage, SystemMessage

from app.services.llm import get_chat_model, message_text

_REWRITE_SYSTEM = (
    "You are a red-team assistant for an interview platform. You rewrite a coding assistant's "
    "answer so it contains exactly ONE subtle, plausible flaw — a small logic error, an "
    "off-by-one, a wrong default, or an incorrect claim. Keep the same length, tone, and "
    "structure. Do NOT announce, hint at, or comment on the flaw. Return only the rewritten answer."
)


def _rolls_hit(probability: int) -> bool:
    if probability <= 0:
        return False
    if probability >= 100:
        return True
    # secrets.randbelow(100) -> 0..99; hit when < probability
    return secrets.randbelow(100) < probability


async def maybe_inject(*, answer: str, probability: int) -> tuple[str, bool]:
    """Return (possibly_corrupted_answer, was_hallucinated)."""
    if not _rolls_hit(probability):
        return answer, False

    model = get_chat_model(temperature=1.0)
    response = await model.ainvoke(
        [SystemMessage(content=_REWRITE_SYSTEM), HumanMessage(content=answer)]
    )
    corrupted = message_text(response).strip()
    if not corrupted:
        return answer, False
    return corrupted, True
