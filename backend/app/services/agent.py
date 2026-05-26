"""Agentic chat engine (LangGraph + Claude).

Inputs : candidate chat query, current Monaco code state + language, session guardrail system
         prompt, and recent chat history.
Output : an LLM-generated reply that obeys the interviewer's guardrails, paired with the exact
         (input_tokens, output_tokens) usage Anthropic returned for that call. The WS handler
         feeds the totals into the session's Redis token-budget counter.

The graph is intentionally minimal for Deliverable 1 — a single model node — but uses LangGraph so
it can grow (tools, retrieval, push-back questions) without restructuring. History is capped to
control token cost (see plan.md cost notes).
"""

from __future__ import annotations

from typing import Annotated, Any, TypedDict

from langchain_core.messages import AIMessage, AnyMessage, BaseMessage, HumanMessage
from langgraph.graph import END, START, StateGraph
from langgraph.graph.message import add_messages

from app.services.llm import cached_system_message, get_chat_model, message_text

# How many prior turns to send back to the model (cost control).
_HISTORY_LIMIT = 12


class _AgentState(TypedDict):
    messages: Annotated[list[AnyMessage], add_messages]


def _build_graph() -> Any:
    model = get_chat_model()

    async def call_model(state: _AgentState) -> dict[str, list[AnyMessage]]:
        response = await model.ainvoke(state["messages"])
        return {"messages": [response]}

    graph = StateGraph(_AgentState)
    graph.add_node("call_model", call_model)
    graph.add_edge(START, "call_model")
    graph.add_edge("call_model", END)
    return graph.compile()


_graph = None


def _get_graph() -> Any:
    global _graph
    if _graph is None:
        _graph = _build_graph()
    return _graph


def _usage_tokens(msg: BaseMessage | None) -> int:
    """Sum input + output tokens from the model's `usage_metadata` if present, else 0."""
    if msg is None:
        return 0
    usage = getattr(msg, "usage_metadata", None)
    if not isinstance(usage, dict):
        return 0
    return int(usage.get("input_tokens", 0) or 0) + int(usage.get("output_tokens", 0) or 0)


async def generate_reply(
    *,
    query: str,
    code: str,
    language: str,
    system_prompt: str,
    history: list[tuple[str, str]],
) -> tuple[str, int]:
    """Return (assistant_reply_text, tokens_used_in_this_call).

    Tokens used = input_tokens + output_tokens reported by Anthropic for this single call. The
    caller (ws.py) accumulates this in Redis against the session's `token_budget`.
    """
    messages: list[AnyMessage] = [cached_system_message(system_prompt)]
    for role, content in history[-_HISTORY_LIMIT:]:
        messages.append(
            HumanMessage(content=content) if role == "user" else AIMessage(content=content)
        )

    snippet = code.strip() or "(editor is empty)"
    user_content = (
        f"My current {language} code:\n```{language}\n{snippet}\n```\n\n"
        f"Question: {query}"
    )
    messages.append(HumanMessage(content=user_content))

    state = await _get_graph().ainvoke({"messages": messages})
    last = state["messages"][-1]
    return message_text(last), _usage_tokens(last)
