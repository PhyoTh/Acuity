"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError(signInError.message);
      setBusy(false);
      return;
    }
    try {
      const me = await api.me();
      router.push(me.role === "recruiter" ? "/dashboard" : "/");
    } catch {
      router.push("/");
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Log in</h1>
      <form onSubmit={onSubmit} className="space-y-3">
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
        <button
          type="submit"
          className="w-full rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Signing in..." : "Log in"}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Recruiter? <Link href="/signup" className="underline">Create an account</Link>. Candidates
        join via their invite link.
      </p>
    </main>
  );
}
