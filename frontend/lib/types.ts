// Shared types mirroring the backend schemas (app/schemas.py).

export type Role = "candidate" | "interviewer";
export type SessionStatus = "pending" | "active" | "ended";

export const GUARDRAIL_PRESETS = [
  "hints_only",
  "no_full_solutions",
  "explain_dont_write",
  "syntax_only",
  "open",
] as const;
export type GuardrailPreset = (typeof GUARDRAIL_PRESETS)[number];

// Interview kinds the wizard offers. Mirrors backend INTERVIEW_TYPES in schemas.py — keep these
// two definitions in sync. The wizard pre-fills step 4 (AI behavior) from `defaults` here.
export interface InterviewTypeDef {
  value: string;
  label: string;
  description: string;
  defaults: {
    guardrail_preset: GuardrailPreset;
    hallucination_pct: number;
    token_budget: number;
  };
}

export const INTERVIEW_TYPES: InterviewTypeDef[] = [
  {
    value: "algorithm",
    label: "Algorithm / LeetCode",
    description:
      "Single algorithmic problem. AI restricted to syntax of the chosen language; no algorithm hints, no hallucinations.",
    defaults: { guardrail_preset: "syntax_only", hallucination_pct: 0, token_budget: 4000 },
  },
  {
    value: "api",
    label: "API integration",
    description:
      "Build a small flow with a real-world API (Stripe, Twilio, etc). AI gives hints, larger budget.",
    defaults: { guardrail_preset: "hints_only", hallucination_pct: 0, token_budget: 12000 },
  },
  {
    value: "debugging",
    label: "Debugging",
    description:
      "Find and fix bugs in given code. High hallucination rate — the candidate must spot bad AI suggestions.",
    defaults: { guardrail_preset: "explain_dont_write", hallucination_pct: 30, token_budget: 6000 },
  },
  {
    value: "code_review",
    label: "Code review",
    description: "Critique a provided diff or function in prose. Open AI, graded on the review.",
    defaults: { guardrail_preset: "open", hallucination_pct: 0, token_budget: 4000 },
  },
  {
    value: "refactor",
    label: "Refactor / optimize",
    description: "Improve correct-but-slow / messy code. Hints only, tests verify same behavior.",
    defaults: { guardrail_preset: "hints_only", hallucination_pct: 0, token_budget: 6000 },
  },
  {
    value: "sql",
    label: "SQL / data query",
    description: "Write a query against sample tables. Syntax-only AI; expected-output match.",
    defaults: { guardrail_preset: "syntax_only", hallucination_pct: 0, token_budget: 3000 },
  },
  {
    value: "tdd",
    label: "Test writing (TDD)",
    description: "Given a function, write tests for it. AI explains concepts but does not write code.",
    defaults: { guardrail_preset: "explain_dont_write", hallucination_pct: 0, token_budget: 4000 },
  },
  {
    value: "system_design",
    label: "System design",
    description: "Discuss architecture in writing. Open AI, large budget for back-and-forth.",
    defaults: { guardrail_preset: "open", hallucination_pct: 0, token_budget: 20000 },
  },
];

export interface TestCaseInput {
  stdin: string;
  expected: string;
  hidden: boolean;
}

export interface TestResult {
  name: string;
  passed: boolean;
  hidden: boolean;
  stdin?: string | null;
  expected?: string | null;
  actual?: string | null;
  stderr?: string | null;
}

export interface RunResult {
  passed: number;
  total: number;
  results: TestResult[];
  stdout?: string | null;
  stderr?: string | null;
}

export interface EventRow {
  type: string;
  actor: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface Profile {
  id: string;
  role: Role;
  display_name: string | null;
  created_at: string;
}

export interface SessionConfig {
  id: string;
  join_code: string;
  created_by: string;
  title: string;
  language: string;
  interview_type: string;
  prompt: string;
  starting_code: string;
  guardrail_preset: string;
  guardrail_custom: string;
  hallucination_pct: number;
  test_cases: TestCaseInput[];
  token_budget: number;
  enable_pushback: boolean;
  status: SessionStatus;
  created_at: string;
  ended_at: string | null;
}

export interface SessionCandidateView {
  id: string;
  title: string;
  language: string;
  interview_type: string;
  prompt: string;
  starting_code: string;
  token_budget: number;
  status: SessionStatus;
}

export interface SessionSummary {
  id: string;
  join_code: string;
  title: string;
  language: string;
  interview_type: string;
  status: SessionStatus;
  created_at: string;
}

export interface Scorecard {
  id: string;
  session_id: string;
  scores: Record<string, number>;
  summary: string;
  overall: number | null;
  created_at: string;
}

export interface SessionCreateInput {
  title: string;
  language: string;
  interview_type: string;
  prompt: string;
  starting_code: string;
  guardrail_preset: string;
  guardrail_custom: string;
  hallucination_pct: number;
  test_cases: TestCaseInput[];
  token_budget: number;
  enable_pushback: boolean;
}
