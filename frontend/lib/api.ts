// Typed client for the FastAPI backend. Attaches the Supabase access token as a Bearer header.

import { createClient } from "@/lib/supabase/client";
import type {
  CandidateSessionLog,
  EventRow,
  Profile,
  Role,
  RunResult,
  Scorecard,
  SessionCandidateView,
  SessionConfig,
  SessionCreateInput,
  SessionFile,
  SessionSummary,
  TranscriptTurn,
} from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

async function authHeaders(): Promise<Record<string, string>> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(await authHeaders()),
    ...((init?.headers as Record<string, string>) ?? {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { detail?: string } | null;
    throw new Error(body?.detail ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

export const api = {
  me: () => request<Profile>("/auth/me"),
  updateMe: (body: { display_name: string }) =>
    request<Profile>("/auth/me", { method: "PATCH", body: JSON.stringify(body) }),
  createSession: (body: SessionCreateInput) =>
    request<SessionConfig>("/sessions", { method: "POST", body: JSON.stringify(body) }),
  listSessions: () => request<SessionSummary[]>("/sessions"),
  listMyCandidateSessions: () => request<CandidateSessionLog[]>("/sessions/mine"),
  joinSession: (joinCode: string) =>
    request<{ session_id: string; role: Role }>("/sessions/join", {
      method: "POST",
      body: JSON.stringify({ join_code: joinCode }),
    }),
  getSession: (id: string) => request<SessionConfig | SessionCandidateView>(`/sessions/${id}`),
  getScorecard: (id: string) => request<Scorecard>(`/sessions/${id}/scorecard`),
  runCode: (id: string, code: string) =>
    request<RunResult>(`/sessions/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ code }),
    }),
  getEvents: (id: string) => request<EventRow[]>(`/sessions/${id}/events`),
  getTranscripts: (id: string) => request<TranscriptTurn[]>(`/sessions/${id}/transcripts`),
  // Multi-file project tree
  listFiles: (id: string) => request<SessionFile[]>(`/sessions/${id}/files`),
  createFile: (id: string, body: { path: string; content?: string; is_folder?: boolean }) =>
    request<SessionFile>(`/sessions/${id}/files`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  updateFile: (
    id: string,
    fileId: string,
    body: { path?: string; content?: string },
  ) =>
    request<SessionFile>(`/sessions/${id}/files/${fileId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteFile: async (id: string, fileId: string) => {
    const res = await fetch(`${API_URL}/sessions/${id}/files/${fileId}`, {
      method: "DELETE",
      headers: { ...(await authHeaders()) },
    });
    if (!res.ok && res.status !== 204) throw new Error(`${res.status} ${res.statusText}`);
  },
};
