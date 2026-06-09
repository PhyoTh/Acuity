"""Real-time push-back question generator (interviewer-only, opt-in per session).

Given the candidate's current code + recent chat, suggests short probing questions the interviewer
could ask to test genuine understanding. Opt-in (session.enable_pushback) to control LLM cost.
"""

from __future__ import annotations

from langchain_core.messages import HumanMessage, SystemMessage

from app.config import get_settings
from app.services.llm import get_chat_model, message_text

_SYSTEM = (
    "You assist a technical interviewer. From the candidate's current code and recent chat with "
    "the AI assistant, suggest 1-3 short, probing push-back questions the interviewer could ask to "
    "test genuine understanding (edge cases, complexity, trade-offs, why a choice was made). "
    "Return each question on its own line. No numbering, no preamble."
)


_DEMO_QUESTIONS = [
    "Walk me through the time and space complexity of your current approach.",
    "What edge case is most likely to break this, and how would you guard against it?",
    "Why did you choose this data structure over the alternatives?",
]


async def generate(*, code: str, transcript: list[tuple[str, str]]) -> list[str]:
    if get_settings().demo_mode:
        return list(_DEMO_QUESTIONS)

    convo = "\n".join(f"{role}: {content}" for role, content in transcript[-6:]) or "(no chat yet)"
    snippet = code.strip() or "(editor empty)"
    model = get_chat_model(max_tokens=256, temperature=0.7)
    response = await model.ainvoke(
        [
            SystemMessage(content=_SYSTEM),
            HumanMessage(content=f"Candidate code:\n{snippet}\n\nRecent chat:\n{convo}"),
        ]
    )
    lines = [line.strip("-•* ").strip() for line in message_text(response).splitlines()]
    return [line for line in lines if line][:3]
