"use client";

// Compact transparency strip rendered above the chat. Tells both sides which Claude model is
// answering, what guardrail is active, and whether the hallucination injector is enabled.
// Candidates should never be surprised by "the AI made things up" — if hallucination > 0,
// we say so up-front.
import { HALLUCINATION_TYPE_LABELS } from "@/lib/types";

const PRESET_LABELS: Record<string, string> = {
  hints_only: "Hints only",
  no_full_solutions: "No full solutions",
  explain_dont_write: "Explains, doesn't write code",
  syntax_only: "Syntax only",
  open: "Open AI",
};

export default function AIInfoHeader({
  model,
  guardrailPreset,
  guardrailPresets,
  hasCustomGuardrail,
  hallucinationPct,
  hallucinationType,
}: {
  model?: string;
  guardrailPreset?: string;
  guardrailPresets?: string[];
  hasCustomGuardrail?: boolean;
  hallucinationPct?: number;
  hallucinationType?: string;
}) {
  const activePresets =
    guardrailPresets && guardrailPresets.length > 0
      ? guardrailPresets
      : guardrailPreset
        ? [guardrailPreset]
        : [];
  if (
    !model &&
    activePresets.length === 0 &&
    !hasCustomGuardrail &&
    (hallucinationPct ?? 0) === 0
  )
    return null;

  const presetLabel = activePresets.length
    ? activePresets.map((p) => PRESET_LABELS[p] ?? p).join(" + ")
    : null;

  return (
    <div className="space-y-1 border-b border-neutral-800 bg-neutral-950/60 px-3 py-2 text-[11px] text-neutral-400">
      {model && (
        <div>
          Model: <span className="font-mono text-neutral-300">{model}</span>
        </div>
      )}
      {presetLabel && (
        <div>
          Guardrail: <span className="text-neutral-300">{presetLabel}</span>
          {hasCustomGuardrail && (
            <span className="text-neutral-300"> + additional custom instructions apply</span>
          )}
        </div>
      )}
      {!presetLabel && hasCustomGuardrail && (
        <div>
          Guardrail: <span className="text-neutral-300">additional custom instructions apply</span>
        </div>
      )}
      {(hallucinationPct ?? 0) > 0 && (
        <div className="text-amber-300">
          ⚠ Hallucination injector ON ({hallucinationPct}% of replies are deliberately corrupted —
          double-check the AI&apos;s answers).
          {hallucinationType && (
            <span className="text-neutral-400">
              {" "}
              Type: {HALLUCINATION_TYPE_LABELS[hallucinationType] ?? hallucinationType}.
            </span>
          )}
        </div>
      )}
    </div>
  );
}
