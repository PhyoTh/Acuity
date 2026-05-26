"""Shared Claude (LLM) helpers for the AI services.

Cost-optimized per the team's constraints:
- default model is the cheapest capable one (`claude-haiku-4-5...`, set in config),
- `max_tokens` is capped (config `anthropic_max_tokens`),
- the guardrail system prompt is marked cacheable. NOTE: Anthropic prompt caching only
  activates once the cached prefix exceeds the model minimum (~4096 tokens for Haiku 4.5);
  our guardrail prompts are smaller, so this is currently a harmless no-op that starts paying
  off automatically if prompts grow. The effective cost levers today are the cheap model, the
  token cap, and capping chat history (see services/agent.py).

We use `langchain-anthropic` (locked decision, plan.md §3); keep this module thin so the model
layer stays swappable.
"""

from __future__ import annotations

from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import BaseMessage, SystemMessage

from app.config import get_settings

settings = get_settings()

# Guardrail presets (keys mirror schemas.GUARDRAIL_PRESETS).
GUARDRAIL_PRESETS: dict[str, str] = {
    "hints_only": (
        "Guardrail: HINTS ONLY. Give conceptual hints and ask guiding questions. "
        "Never write a complete solution; nudge the candidate toward it."
    ),
    "no_full_solutions": (
        "Guardrail: NO FULL SOLUTIONS. You may show small snippets and explain APIs, but never "
        "provide a complete working solution to the interview problem."
    ),
    "explain_dont_write": (
        "Guardrail: EXPLAIN, DON'T WRITE. Explain approaches in prose. Do not write code for the "
        "candidate; describe what they should do instead."
    ),
    "open": "Guardrail: OPEN. Assist normally as a helpful pair-programming copilot.",
}

_BASE_SYSTEM = (
    "You are an AI coding assistant embedded in a LIVE technical interview. Help the candidate "
    "make progress while strictly respecting the interviewer's guardrail policy below. Be concise."
)


def build_guardrail_system(preset: str, custom: str) -> str:
    """Compose the agent's system prompt from a preset + optional free-text override."""
    parts = [_BASE_SYSTEM, GUARDRAIL_PRESETS.get(preset, GUARDRAIL_PRESETS["hints_only"])]
    if custom.strip():
        parts.append(f"Additional interviewer instructions: {custom.strip()}")
    return "\n\n".join(parts)


def cached_system_message(text: str) -> SystemMessage:
    """A SystemMessage whose content is marked for Anthropic prompt caching."""
    return SystemMessage(
        content=[{"type": "text", "text": text, "cache_control": {"type": "ephemeral"}}]
    )


def get_chat_model(
    *, max_tokens: int | None = None, temperature: float | None = None
) -> ChatAnthropic:
    """Construct a ChatAnthropic client from settings (API key passed explicitly)."""
    kwargs: dict[str, Any] = {
        "model": settings.anthropic_model,
        "api_key": settings.anthropic_api_key,
        "max_tokens": max_tokens or settings.anthropic_max_tokens,
    }
    if temperature is not None:
        kwargs["temperature"] = temperature
    return ChatAnthropic(**kwargs)


def message_text(message: BaseMessage) -> str:
    """Extract plain text from a (possibly block-structured) LangChain message."""
    content = message.content
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text", "")))
            elif isinstance(block, str):
                parts.append(block)
        return "".join(parts)
    return str(content)
