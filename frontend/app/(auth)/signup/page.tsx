"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { createClient } from "@/lib/supabase/client";

// Recruiter sign-up. The role is stored in Supabase user_metadata and read back by the
// backend on first authenticated request (see app/security.py). Candidates do NOT sign up
// here — they arrive through a room invite link (/join/<code>).
export default function SignupPage() {
  const router = useRouter();
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
      options: { data: { role: "recruiter" } },
    });
    if (signUpError) {
      setError(signUpError.message);
      setBusy(false);
      return;
    }
    if (data.session) {
      router.push("/dashboard");
    } else {
      setMessage("Check your email to confirm your account, then log in.");
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-bold">Recruiter sign up</h1>
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
