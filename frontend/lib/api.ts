// Typed client for the FastAPI backend. Attaches the Supabase access token as a Bearer header.

import { createClient } from "@/lib/supabase/client";
import type {
  EventRow,
  Profile,
  RoomCandidateView,
  RoomConfig,
  RoomCreateInput,
  RoomSummary,
  Role,
  RunResult,
  Scorecard,
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
  createRoom: (body: RoomCreateInput) =>
    request<RoomConfig>("/rooms", { method: "POST", body: JSON.stringify(body) }),
  listRooms: () => request<RoomSummary[]>("/rooms"),
  joinRoom: (joinCode: string) =>
    request<{ room_id: string; role: Role }>("/rooms/join", {
      method: "POST",
      body: JSON.stringify({ join_code: joinCode }),
    }),
  getRoom: (id: string) => request<RoomConfig | RoomCandidateView>(`/rooms/${id}`),
  getScorecard: (id: string) => request<Scorecard>(`/rooms/${id}/scorecard`),
  runCode: (id: string, code: string) =>
    request<RunResult>(`/rooms/${id}/run`, { method: "POST", body: JSON.stringify({ code }) }),
  getEvents: (id: string) => request<EventRow[]>(`/rooms/${id}/events`),
};
