"use client";

// Compact transparency strip rendered above the chat. Tells both sides which Claude model is
// answering, what guardrail is active, and whether the hallucination injector is enabled.
// Candidates should never be surprised by "the AI made things up" — if hallucination > 0,
// we say so up-front.
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
  hallucinationPct,
}: {
  model?: string;
  guardrailPreset?: string;
  hallucinationPct?: number;
}) {
  if (!model && !guardrailPreset && (hallucinationPct ?? 0) === 0) return null;

  const presetLabel = guardrailPreset ? (PRESET_LABELS[guardrailPreset] ?? guardrailPreset) : null;

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
        </div>
      )}
      {(hallucinationPct ?? 0) > 0 && (
        <div className="text-amber-300">
          ⚠ Hallucination injector ON ({hallucinationPct}% of replies are deliberately corrupted —
          double-check the AI&apos;s answers).
        </div>
      )}
    </div>
  );
}
