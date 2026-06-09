"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Icon, SectionLabel } from "@/components/ui";
import { api } from "@/lib/api";
import { DEMO_MODE, demoLogin, type Role } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDemo(role: Role) {
    setBusy(true);
    setError(null);
    try {
      await demoLogin(role);
      router.push(role === "interviewer" ? "/dashboard" : "/candidate");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo login failed");
      setBusy(false);
    }
  }

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
      router.push(me.role === "interviewer" ? "/dashboard" : "/candidate");
    } catch {
      router.push("/");
    }
  }

  return (
    <AuthLayout
      side={
        <>
          <h2
            className="display"
            style={{ fontSize: 56, lineHeight: 1.04, letterSpacing: "-0.02em" }}
          >
            Welcome <span className="display-italic" style={{ color: "var(--live)" }}>back</span>.
          </h2>
          <p
            className="mt-5"
            style={{ color: "var(--fg-2)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 440 }}
          >
            Pick up where you left off. Active sessions, scorecards, and your problem library
            are waiting.
          </p>
        </>
      }
    >
      <SectionLabel>Sign in</SectionLabel>
      <h1
        className="display mt-2"
        style={{ fontSize: 40, lineHeight: 1.04, letterSpacing: "-0.02em" }}
      >
        Log in
      </h1>
      {DEMO_MODE && (
        <div
          className="mt-6 flex flex-col gap-2 rounded-lg"
          style={{ border: "1px solid var(--line-1)", padding: 16, background: "var(--bg-1)" }}
        >
          <span className="section-label" style={{ color: "var(--live)" }}>Demo mode</span>
          <p style={{ color: "var(--fg-2)", fontSize: 12.5, lineHeight: 1.5 }}>
            No account needed — enter the full product with a one-click identity. For the
            candidate side, open an invite link in an incognito window.
          </p>
          <div className="mt-1 flex gap-2">
            <button
              type="button"
              className="btn btn-primary flex-1 justify-center"
              disabled={busy}
              aria-disabled={busy}
              onClick={() => onDemo("interviewer")}
            >
              Enter as interviewer <Icon name="arrow-right" size={14} />
            </button>
            <button
              type="button"
              className="btn flex-1 justify-center"
              disabled={busy}
              aria-disabled={busy}
              onClick={() => onDemo("candidate")}
            >
              Enter as candidate
            </button>
          </div>
        </div>
      )}
      <form onSubmit={onSubmit} className="mt-7 flex flex-col gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Email</span>
          <input
            className="input"
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center justify-between">
            <span className="section-label">Password</span>
            <a
              href="#forgot"
              className="mono"
              style={{ color: "var(--fg-2)", fontSize: 11, letterSpacing: "0.04em" }}
              aria-disabled
              title="Password reset not yet wired up"
            >
              Forgot?
            </a>
          </span>
          <input
            className="input"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="mono" style={{ color: "var(--bad)", fontSize: 12 }}>{error}</p>
        )}
        <button
          type="submit"
          className="btn btn-primary mt-2 w-full justify-center"
          disabled={busy}
          aria-disabled={busy}
        >
          {busy ? "Signing in…" : <>Continue <Icon name="arrow-right" size={14} /></>}
        </button>
      </form>
      <p className="mt-6" style={{ color: "var(--fg-2)", fontSize: 12.5 }}>
        Interviewer?{" "}
        <Link href="/signup" style={{ color: "var(--fg-0)", textDecoration: "underline" }}>
          Create an account
        </Link>
        . Candidates join via their invite link.
      </p>
    </AuthLayout>
  );
}
