// Shared types mirroring the backend schemas (app/schemas.py).

export type Role = "candidate" | "interviewer";
export type SessionStatus = "pending" | "active" | "ended";

export const GUARDRAIL_PRESETS = [
  "hints_only",
  "no_full_solutions",
  "explain_dont_write",
  "open",
] as const;
export type GuardrailPreset = (typeof GUARDRAIL_PRESETS)[number];

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
  prompt: string;
  starting_code: string;
  guardrail_preset: string;
  guardrail_custom: string;
  hallucination_pct: number;
  test_cases: TestCaseInput[];
  query_quota: number;
  ai_max_tokens: number | null;
  enable_pushback: boolean;
  status: SessionStatus;
  created_at: string;
  ended_at: string | null;
}

export interface SessionCandidateView {
  id: string;
  title: string;
  language: string;
  prompt: string;
  starting_code: string;
  query_quota: number;
  status: SessionStatus;
}

export interface SessionSummary {
  id: string;
  join_code: string;
  title: string;
  language: string;
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
  prompt: string;
  starting_code: string;
  guardrail_preset: string;
  guardrail_custom: string;
  hallucination_pct: number;
  test_cases: TestCaseInput[];
  query_quota: number;
  ai_max_tokens: number | null;
  enable_pushback: boolean;
}
