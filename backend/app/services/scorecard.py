"""Scorecard generator.

Inputs : the complete `transcripts` for a session (with hallucination flags) when it ends.
Output : a structured JSON grade across 4 dimensions — prompt quality, caught AI errors,
         code correctness, approach & independence — plus a summary. Persisted to `scorecards`.

Uses Claude structured output (via langchain `with_structured_output`) for a validated result.
"""

from __future__ import annotations

import uuid
from typing import Any, cast

from pydantic import BaseModel, Field
from sqlalchemy import select

from app.db.base import SessionLocal
from app.db.models import Event, Scorecard, Transcript
from app.services.llm import get_chat_model

_SYSTEM = "\n".join(
    [
        "You are evaluating a candidate's performance in a technical interview where an AI",
        "assistant was available. The assistant sometimes injects subtle flaws on purpose;",
        "turns marked [HALLUCINATED] contained a deliberate flaw.",
        "",
        "Score each dimension 0-10 using these rubrics. Use the FULL range — do NOT default",
        "to 7-9.",
        "",
        "CODE CORRECTNESS (judge the final code only):",
        "- 10: Fully correct solution. Handles the problem and reasonable edge cases. If",
        "  tests pass and the algorithm is right, give 10 — do NOT deduct for minor style",
        "  nits. A fully-passing solution must score 10.",
        "- 8-9: Correct on the main case but missing an edge case, or slightly inefficient.",
        "- 6-7: Mostly works but has a clear bug or missing logic.",
        "- 3-5: Partial / broken solution that shows understanding but doesn't work.",
        "- 0-2: Empty, way off, or doesn't compile/run.",
        "",
        "PROMPT QUALITY:",
        "- If the candidate sent 0-1 substantive prompts to the AI, this dimension is NOT",
        "  APPLICABLE — return 7 (neutral) and mention 'limited AI use' in the summary.",
        "  Do NOT punish self-reliance.",
        "- 10: Strategic, specific, well-scoped prompts that move the work forward.",
        "- 7-9: Clear and reasonable prompts.",
        "- 4-6: Vague or copy-paste-style prompts.",
        "- 0-3: No real prompting effort when AI was actively being used.",
        "",
        "CAUGHT AI ERRORS:",
        "- If there were 0 [HALLUCINATED] turns in the transcript, this dimension is NOT",
        "  APPLICABLE — return 7 (neutral) and note 'no hallucinations to catch' in the",
        "  summary. Do NOT punish a candidate when no errors were injected, or when they",
        "  barely used the AI.",
        "- Otherwise score by ratio of hallucinations the candidate caught/corrected vs.",
        "  blindly accepted. 10 = caught all; 0 = copied every flawed answer.",
        "",
        "APPROACH & INDEPENDENCE:",
        "- 10: Clear decomposition, independent reasoning, used AI as a tool not a crutch.",
        "  A candidate who solved the problem WITHOUT the AI should score HIGH (8-10).",
        "- 7-9: Solid problem solving, some reliance on AI but with their own thinking.",
        "- 4-6: Heavy AI dependence but some independent contribution.",
        "- 0-3: Pure copy-paste from AI with no independent reasoning.",
        "",
        "SUMMARY: 2-4 sentences. Mention if AI use was limited (and that this is fine).",
    ]
)


class _ScorecardResult(BaseModel):
    prompt_quality: int = Field(
        ge=0, le=10, description="0-10. Return 7 if AI was barely used (not applicable)."
    )
    caught_ai_errors: int = Field(
        ge=0,
        le=10,
        description="0-10. Return 7 if no hallucinations were injected or AI barely used.",
    )
    code_correctness: int = Field(
        ge=0,
        le=10,
        description="0-10. A fully correct solution that passes tests must score 10.",
    )
    approach_independence: int = Field(
        ge=0,
        le=10,
        description="0-10. Solving without AI should score HIGH (8-10), not low.",
    )
    summary: str = Field(description="2-4 sentence interviewer-facing summary")


def _transcript_block(rows: list[Transcript]) -> str:
    lines: list[str] = []
    for t in rows:
        speaker = "Candidate" if t.role.value == "user" else "AI"
        tag = " [HALLUCINATED]" if t.was_hallucinated else ""
        lines.append(f"{speaker}{tag}: {t.content}")
    return "\n".join(lines) if lines else "(no chat activity)"


async def generate_scorecard(*, session_id: str) -> dict[str, Any]:
    """Build and persist the final scorecard for a session; returns it as a dict."""
    sid = uuid.UUID(session_id)
    async with SessionLocal() as db:
        existing = await db.scalar(select(Scorecard).where(Scorecard.session_id == sid))
        if existing is not None:
            return _to_dict(existing)

        transcripts = list(
            await db.scalars(
                select(Transcript)
                .where(Transcript.session_id == sid)
                .order_by(Transcript.created_at)
            )
        )
        code_changes = list(
            await db.scalars(
                select(Event)
                .where(Event.session_id == sid, Event.type == "code_change")
                .order_by(Event.created_at.desc())
            )
        )
        latest_code = code_changes[0].payload.get("code", "") if code_changes else ""

        runs = list(
            await db.scalars(
                select(Event)
                .where(Event.session_id == sid, Event.type == "code_run")
                .order_by(Event.created_at.desc())
            )
        )
        last_run = runs[0].payload if runs else None

        candidate_prompts = sum(1 for t in transcripts if t.role.value == "user")
        hallucination_count = sum(1 for t in transcripts if t.was_hallucinated)

        run_summary = "(no code runs executed)"
        if last_run is not None:
            passed = last_run.get("passed", 0)
            total = last_run.get("total", 0)
            run_summary = f"Final test run: {passed}/{total} tests passed."
            if total > 0 and passed == total:
                run_summary += " ALL TESTS PASSED — code_correctness must be 10."

        usage_summary = (
            f"Candidate sent {candidate_prompts} prompt(s) to the AI. "
            f"{hallucination_count} AI turn(s) were [HALLUCINATED]."
        )
        if candidate_prompts <= 1:
            usage_summary += (
                " LIMITED AI USE — return 7 for prompt_quality, and (if no hallucinations)"
                " 7 for caught_ai_errors. Score approach_independence HIGH (8-10) if the"
                " code is correct."
            )
        elif hallucination_count == 0:
            usage_summary += " No hallucinations to catch — return 7 for caught_ai_errors."

        model = get_chat_model(max_tokens=1024, temperature=0).with_structured_output(
            _ScorecardResult
        )
        prompt = (
            f"Interview transcript:\n{_transcript_block(transcripts)}\n\n"
            f"Candidate's final code:\n{latest_code or '(empty)'}\n\n"
            f"Signals:\n{run_summary}\n{usage_summary}"
        )
        result = cast(
            _ScorecardResult,
            await model.ainvoke(
                [{"role": "system", "content": _SYSTEM}, {"role": "user", "content": prompt}]
            ),
        )

        scores = {
            "prompt_quality": result.prompt_quality,
            "caught_ai_errors": result.caught_ai_errors,
            "code_correctness": result.code_correctness,
            "approach_independence": result.approach_independence,
        }
        overall = round(sum(scores.values()) / len(scores), 2)
        card = Scorecard(session_id=sid, scores=scores, summary=result.summary, overall=overall)
        db.add(card)
        await db.commit()
        await db.refresh(card)
        return _to_dict(card)


def _to_dict(card: Scorecard) -> dict[str, Any]:
    return {
        "id": str(card.id),
        "session_id": str(card.session_id),
        "scores": card.scores,
        "summary": card.summary,
        "overall": card.overall,
    }
