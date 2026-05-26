import type { Scorecard } from "@/lib/types";

const LABELS: Record<string, string> = {
  prompt_quality: "Prompt quality",
  caught_ai_errors: "Caught AI errors",
  code_correctness: "Code correctness",
  approach_independence: "Approach & independence",
};

// Post-interview scorecard panel (recruiter dashboard).
export default function ScorecardPanel({ scorecard }: { scorecard: Scorecard }) {
  return (
    <div className="space-y-3 rounded border border-neutral-800 p-4">
      <div className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold">Scorecard</h3>
        {scorecard.overall !== null && (
          <span className="text-2xl font-bold">{scorecard.overall}/10</span>
        )}
      </div>
      <ul className="space-y-1">
        {Object.entries(scorecard.scores).map(([key, value]) => (
          <li key={key} className="flex justify-between text-sm">
            <span className="text-neutral-400">{LABELS[key] ?? key}</span>
            <span className="font-medium">{value}/10</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-neutral-300">{scorecard.summary}</p>
    </div>
  );
}
