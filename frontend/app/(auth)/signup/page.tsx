"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, Suspense, useEffect, useState } from "react";

import { AuthLayout } from "@/components/auth/AuthLayout";
import { Icon, SectionLabel } from "@/components/ui";
import { DEMO_MODE } from "@/lib/auth";
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

  // Demo mode has no real signup — send people to the login page's one-click demo buttons.
  useEffect(() => {
    if (DEMO_MODE) router.replace("/login");
  }, [router]);

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

  return (
    <AuthLayout
      side={
        <>
          <h2
            className="display"
            style={{ fontSize: 56, lineHeight: 1.04, letterSpacing: "-0.02em" }}
          >
            A <span className="display-italic" style={{ color: "var(--live)" }}>better</span> coding interview.
          </h2>
          <p
            className="mt-5"
            style={{ color: "var(--fg-2)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 460 }}
          >
            Acuity makes interviews about how you <em>use</em> AI — not whether you can copy from it.
          </p>
          <ul className="mt-7 flex flex-col gap-3">
            {[
              "Drop candidates into a real Monaco IDE",
              "Subtly corrupt AI replies at a probability you set",
              "Grade four dimensions with an LLM scorecard",
              "Replay every keystroke, paste, and prompt",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3" style={{ color: "var(--fg-1)", fontSize: 13.5 }}>
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "var(--live-dim)",
                    border: "1px solid var(--live)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    marginTop: 1,
                  }}
                >
                  <Icon name="check" size={12} color="var(--live)" />
                </span>
                {item}
              </li>
            ))}
          </ul>
        </>
      }
    >
      <SectionLabel>Get started</SectionLabel>
      <h1
        className="display mt-2"
        style={{ fontSize: 40, lineHeight: 1.04, letterSpacing: "-0.02em" }}
      >
        Create account
      </h1>

      <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <RoleCard
          active={role === "interviewer"}
          onClick={() => setRole("interviewer")}
          icon="eye"
          title="I'm an interviewer"
          subtitle="Create sessions, watch the live dashboard."
        />
        <RoleCard
          active={role === "candidate"}
          onClick={() => setRole("candidate")}
          icon="code"
          title="I'm a candidate"
          subtitle="Join interviews you've been invited to."
        />
      </div>

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3">
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
          <span className="section-label">Password</span>
          <input
            className="input"
            type="password"
            required
            placeholder="min 6 chars"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && (
          <p className="mono" style={{ color: "var(--bad)", fontSize: 12 }}>{error}</p>
        )}
        {message && (
          <p className="mono" style={{ color: "var(--live)", fontSize: 12 }}>{message}</p>
        )}
        <button
          type="submit"
          className="btn btn-primary mt-2 w-full justify-center"
          disabled={busy}
          aria-disabled={busy}
        >
          {busy ? "Creating…" : <>Create account <Icon name="arrow-right" size={14} /></>}
        </button>
      </form>
      <p className="mt-6" style={{ color: "var(--fg-2)", fontSize: 12.5 }}>
        Already have an account?{" "}
        <Link href="/login" style={{ color: "var(--fg-0)", textDecoration: "underline" }}>
          Log in
        </Link>
        .
      </p>
    </AuthLayout>
  );
}

function RoleCard({
  active,
  onClick,
  icon,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  icon: "eye" | "code";
  title: string;
  subtitle: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        position: "relative",
        textAlign: "left",
        padding: 14,
        background: active ? "var(--live-dim)" : "var(--bg-1)",
        border: `1px solid ${active ? "var(--live)" : "var(--line-1)"}`,
        borderRadius: "var(--radius-lg)",
        cursor: "pointer",
        transition: "all 0.12s ease",
      }}
    >
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 18,
            height: 18,
            borderRadius: 999,
            background: "var(--live)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Icon name="check" size={12} color="oklch(0.10 0.01 155)" strokeWidth={2.4} />
        </span>
      )}
      <Icon name={icon} size={18} color={active ? "var(--live)" : "var(--fg-1)"} />
      <div className="mt-3" style={{ fontSize: 13.5, fontWeight: 600, color: "var(--fg-0)" }}>
        {title}
      </div>
      <div className="mt-1" style={{ fontSize: 11.5, color: "var(--fg-2)", lineHeight: 1.45 }}>
        {subtitle}
      </div>
    </button>
  );
}
