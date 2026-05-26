"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useState } from "react";

import { createClient } from "@/lib/supabase/client";
import type { Role } from "@/lib/types";

// Sign-up for both roles. The user picks interviewer or candidate up-front; the role is stored
// in Supabase user_metadata and read back by the backend on first authenticated request
// (see app/security.py). Candidates can also arrive via a session invite link (/join/<code>),
// which prefills role=candidate via the ?role= query param.
export default function SignupPage() {
  // `useSearchParams` requires a Suspense boundary for static rendering.
  return (
    <Suspense fallback={null}>
      <SignupForm />
    </Suspense>
  );
}

function SignupForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialRole = (searchParams.get("role") === "candidate" ? "candidate" : "interviewer") as Role;
  const nextPath = searchParams.get("next");

  const [role, setRole] = useState<Role>(initialRole);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { role } },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      const fallback = role === "interviewer" ? "/dashboard" : "/candidate";
      router.push(nextPath ?? fallback);
    } else {
      setMessage("Check your email to confirm your account, then log in.");
      setBusy(false);
    }
  }

  const roleButton = (value: Role, label: string, subtitle: string) => (
    <button
      type="button"
      onClick={() => setRole(value)}
      className={`flex-1 rounded border px-3 py-3 text-left transition ${
        role === value
          ? "border-emerald-600 bg-emerald-950/40"
          : "border-neutral-800 hover:border-neutral-700"
      }`}
    >
      <div className="text-sm font-semibold">{label}</div>
      <div className="mt-0.5 text-xs text-neutral-400">{subtitle}</div>
    </button>
  );

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Sign up</h1>
      <div className="flex gap-2">
        {roleButton("interviewer", "I'm an interviewer", "Create interview sessions, watch the live dashboard.")}
        {roleButton("candidate", "I'm a candidate", "Join interviews you've been invited to.")}
      </div>
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
          placeholder="Password (min 6 chars)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-400">{error}</p>}
        {message && <p className="text-sm text-green-400">{message}</p>}
        <button
          type="submit"
          className="w-full rounded bg-white px-4 py-2 text-sm font-medium text-black disabled:opacity-50"
          disabled={busy}
        >
          {busy ? "Creating..." : "Sign up"}
        </button>
      </form>
      <p className="text-sm text-neutral-500">
        Already have an account? <Link href="/login" className="underline">Log in</Link>.
      </p>
    </main>
  );
}
