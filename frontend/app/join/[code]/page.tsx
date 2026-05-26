"use client";

import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

// Candidate invite entry point. If already signed in, joins immediately; otherwise lets the
// candidate sign up / sign in (role = candidate) and then joins the room.
export default function JoinPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = params.code;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);

  const join = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { room_id } = await api.joinRoom(code);
      router.push(`/interview/${room_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join room");
      setBusy(false);
    }
  }, [code, router]);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        void join();
      } else {
        setNeedsAuth(true);
      }
    });
  }, [join]);

  async function authenticate(e: FormEvent, mode: "signup" | "signin") {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const result =
      mode === "signup"
        ? await supabase.auth.signUp({
            email,
            password,
            options: { data: { role: "candidate" } },
          })
        : await supabase.auth.signInWithPassword({ email, password });
    if (result.error) {
      setError(result.error.message);
      setBusy(false);
      return;
    }
    if (result.data.session) {
      await join();
    } else {
      setError("Check your email to confirm your account, then return to this link.");
      setBusy(false);
    }
  }

  if (!needsAuth) {
    return (
      <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-3 px-6">
        <h1 className="text-xl font-bold">Joining interview...</h1>
        {error && <p className="text-sm text-red-400">{error}</p>}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <div>
        <h1 className="text-2xl font-bold">Join interview</h1>
        <p className="mt-1 text-sm text-neutral-500">Room code: {code}</p>
      </div>
      <form className="space-y-3">
        <input
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="w-full rounded bg-neutral-900 px-3 py-2 text-sm outline-none"
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2">
          <button
            type="submit"
            onClick={(e) => authenticate(e, "signup")}
            className="flex-1 rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
            disabled={busy}
          >
            Sign up &amp; join
          </button>
          <button
            type="button"
            onClick={(e) => authenticate(e, "signin")}
            className="flex-1 rounded border border-neutral-700 px-4 py-2 text-sm disabled:opacity-50"
            disabled={busy}
          >
            Log in &amp; join
          </button>
        </div>
      </form>
    </main>
  );
}
