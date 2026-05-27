"use client";

import { useParams, useRouter } from "next/navigation";
import { type FormEvent, useCallback, useEffect, useState } from "react";

import { Aperture, Icon, SectionLabel, Wordmark } from "@/components/ui";
import { api } from "@/lib/api";
import { createClient } from "@/lib/supabase/client";

// Candidate invite entry point. If already signed in, joins immediately; otherwise lets the
// candidate sign up / sign in (role = candidate) and then joins the session.
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
      const { session_id } = await api.joinSession(code);
      router.push(`/interview/${session_id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not join session");
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
      <main className="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <span className="live-pulse-dot" style={{ width: 14, height: 14 }} />
        <h1 className="display mt-5" style={{ fontSize: 36, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
          Joining interview…
        </h1>
        <p className="mono mt-3" style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em" }}>
          session · {code}
        </p>
        {error && (
          <p className="mono mt-4" style={{ color: "var(--bad)", fontSize: 12 }}>{error}</p>
        )}
      </main>
    );
  }

  return (
    <main className="grid min-h-screen" style={{ gridTemplateColumns: "1fr 1fr" }}>
      {/* Left — form */}
      <div className="flex flex-col">
        <div className="flex items-center justify-between" style={{ padding: "20px 40px" }}>
          <Wordmark size={16} />
        </div>
        <div className="flex flex-1 items-center justify-center" style={{ padding: "0 40px" }}>
          <div style={{ width: "100%", maxWidth: 400 }}>
            <SectionLabel>Invite</SectionLabel>
            <h1
              className="display mt-2"
              style={{ fontSize: 40, lineHeight: 1.05, letterSpacing: "-0.02em" }}
            >
              Join interview
            </h1>
            <p className="mono mt-2" style={{ color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em" }}>
              session · {code}
            </p>

            <form className="mt-7 flex flex-col gap-3">
              <label className="flex flex-col gap-1.5">
                <span className="section-label">Email</span>
                <input
                  className="input"
                  type="email"
                  required
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
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </label>
              {error && (
                <p className="mono" style={{ color: "var(--bad)", fontSize: 12 }}>{error}</p>
              )}
              <div className="mt-2 flex gap-2">
                <button
                  type="submit"
                  onClick={(e) => authenticate(e, "signup")}
                  className="btn btn-primary flex-1 justify-center"
                  disabled={busy}
                  aria-disabled={busy}
                >
                  Sign up &amp; join <Icon name="arrow-right" size={14} />
                </button>
                <button
                  type="button"
                  onClick={(e) => authenticate(e, "signin")}
                  className="btn flex-1 justify-center"
                  disabled={busy}
                  aria-disabled={busy}
                >
                  Log in &amp; join
                </button>
              </div>
            </form>
          </div>
        </div>
        <div className="mono" style={{ padding: "20px 40px", color: "var(--fg-3)", fontSize: 11, letterSpacing: "0.06em" }}>
          © 2026 Acuity
        </div>
      </div>

      {/* Right — promo */}
      <div
        className="relative overflow-hidden flex items-center justify-center"
        style={{
          background: "linear-gradient(160deg, var(--bg-1), oklch(0.18 0.012 155 / 0.4))",
          borderLeft: "1px solid var(--line-1)",
          padding: 48,
        }}
      >
        <div
          aria-hidden
          style={{ position: "absolute", top: -120, right: -120, opacity: 0.08, pointerEvents: "none" }}
        >
          <Aperture size={480} color="var(--live)" />
        </div>
        <div style={{ position: "relative", maxWidth: 460, textAlign: "center" }}>
          <h2 className="display" style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.02em" }}>
            One <span className="display-italic" style={{ color: "var(--live)" }}>link</span>. No install.
          </h2>
          <p className="mt-5" style={{ color: "var(--fg-2)", fontSize: 14, lineHeight: 1.6 }}>
            You&apos;ll land in a real IDE with an AI pair-programmer. The interviewer is on the
            other side watching the same code. Sign in to join — it takes a second.
          </p>
        </div>
      </div>
    </main>
  );
}
