// Auth abstraction over Supabase, with a credential-free DEMO_MODE fallback.
//
// In normal mode the access token + user id come from the Supabase browser session. When
// NEXT_PUBLIC_DEMO_MODE=true the app needs no Supabase project: a demo token is minted by the
// backend (POST /auth/demo-login), stored in localStorage (for API/WS) + a cookie (so the
// server-side middleware can read the role), and used exactly like a real session. Everything
// that previously called `supabase.auth.getSession()` / `signOut()` should go through here.

import { createClient } from "@/lib/supabase/client";

export const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

export const DEMO_COOKIE = "acuity_demo_token";

const API_URL = process.env.NEXT_PUBLIC_API_URL!;

export type Role = "interviewer" | "candidate";
export type AuthSession = { token: string; userId: string };

/** Decode a JWT payload (base64url) without verifying — backend does the real verification. */
function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = part.padEnd(Math.ceil(part.length / 4) * 4, "=");
    return JSON.parse(atob(padded)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readDemoToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(DEMO_COOKIE);
}

/** The current session ({ token, userId }) or null if signed out. */
export async function getSession(): Promise<AuthSession | null> {
  if (DEMO_MODE) {
    const token = readDemoToken();
    if (!token) return null;
    const payload = decodeJwt(token);
    const userId = payload?.sub;
    return typeof userId === "string" ? { token, userId } : null;
  }
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token || !session.user.id) return null;
  return { token: session.access_token, userId: session.user.id };
}

/** Just the bearer token, or null. */
export async function getAccessToken(): Promise<string | null> {
  return (await getSession())?.token ?? null;
}

/** The signed-in user's email (demo token claim, or Supabase auth user). */
export async function getEmail(): Promise<string> {
  if (DEMO_MODE) {
    const token = readDemoToken();
    const email = token ? decodeJwt(token)?.email : null;
    return typeof email === "string" ? email : "";
  }
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.email ?? "";
}

/** DEMO_MODE only: mint + persist a demo identity for the given role. */
export async function demoLogin(role: Role): Promise<void> {
  const res = await fetch(`${API_URL}/auth/demo-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error("Demo login failed — is the backend running with DEMO_MODE=true?");
  const { token } = (await res.json()) as { token: string };
  window.localStorage.setItem(DEMO_COOKIE, token);
  // Cookie so the Edge middleware can read the role for route gating.
  document.cookie = `${DEMO_COOKIE}=${token}; path=/; max-age=${8 * 3600}; samesite=lax`;
}

export async function signOut(): Promise<void> {
  if (DEMO_MODE) {
    window.localStorage.removeItem(DEMO_COOKIE);
    document.cookie = `${DEMO_COOKIE}=; path=/; max-age=0; samesite=lax`;
    return;
  }
  const supabase = createClient();
  await supabase.auth.signOut();
}
