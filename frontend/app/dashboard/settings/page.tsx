"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { DashboardSidebar } from "@/components/Dashboard/Sidebar";
import { Avatar, Icon, Pill, Progress, SectionLabel } from "@/components/ui";
import { api } from "@/lib/api";
import { getEmail, signOut } from "@/lib/auth";
import { API_BALANCE } from "@/lib/mocks";
import type { Profile } from "@/lib/types";

// Interviewer settings panel at /dashboard/settings.
//
// Wired sections:
//   - Account (display name → PATCH /auth/me; email read-only from Supabase auth)
//   - Sign out (Supabase signOut + redirect)
//
// Mock-only (UI present, no backend):
//   - Anthropic API key with reveal toggle
//   - Team & billing (invite-by-email, monthly Anthropic budget)
//   - Email notifications
//   - Slack webhook
export default function SettingsPage() {
  const router = useRouter();
  const [me, setMe] = useState<Profile | null>(null);
  const [email, setEmail] = useState<string>("");

  useEffect(() => {
    api.me().then(setMe).catch(() => setMe(null));
    getEmail().then(setEmail);
  }, []);

  async function onSignOut() {
    await signOut();
    router.push("/");
  }

  return (
    <div className="flex">
      <DashboardSidebar activeKey="settings" />
      <main className="flex-1" style={{ padding: "32px 40px 80px" }}>
        <header>
          <SectionLabel>Account · preferences</SectionLabel>
          <h1
            className="display mt-2"
            style={{ fontSize: 44, lineHeight: 1.04, letterSpacing: "-0.02em" }}
          >
            Settings
          </h1>
          <p className="mt-3" style={{ color: "var(--fg-2)", fontSize: 14, lineHeight: 1.55, maxWidth: 640 }}>
            Tune how Acuity works for you and your team. The Anthropic key here overrides the
            shared team key for sessions you create.
          </p>
        </header>

        <div className="mt-10" style={{ maxWidth: 820 }}>
          <ApiKeySection />
          <AccountSection
            displayName={me?.display_name ?? ""}
            email={email}
            onSaved={(name) => setMe((p) => (p ? { ...p, display_name: name } : p))}
          />
          <TeamBillingSection />
          <NotificationsSection />
          <SlackSection />

          <div className="mt-12 flex justify-center">
            <button onClick={onSignOut} className="btn btn-danger">
              <Icon name="logout" size={14} /> Sign out
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

/* -------- API key (mock — env-driven in reality) -------- */

function ApiKeySection() {
  const [revealed, setRevealed] = useState(false);
  const [value, setValue] = useState("sk-ant-XXXXXXXXXXXXXXXXXXXXXXXXXXXX7c2a");
  const [saved, setSaved] = useState<string | null>(null);
  // Visible string when masked: keep the sk-ant prefix + last 4 chars so the user can tell
  // *which* key is configured without seeing the full secret.
  const masked = useMemo(() => {
    const tail = value.slice(-4);
    return `sk-ant-${"•".repeat(28)}${tail}`;
  }, [value]);

  function onSave() {
    // Mock: no backend persists this yet. Show transient confirmation.
    setSaved("Saved (local only — server-side persistence pending)");
    setTimeout(() => setSaved(null), 2200);
  }

  return (
    <SettingsCard
      title="Anthropic key"
      subtitle="Use your own Anthropic API key for sessions you create. Falls back to the shared team key if empty."
    >
      <div className="flex flex-col gap-2.5">
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Your API key</span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              className="input mono"
              style={{
                fontSize: 12.5,
                letterSpacing: "0.04em",
                color: revealed ? "var(--fg-0)" : "var(--fg-2)",
              }}
              value={revealed ? value : masked}
              onChange={(e) => { if (revealed) setValue(e.target.value); }}
              readOnly={!revealed}
              spellCheck={false}
              autoComplete="off"
            />
            <button
              type="button"
              onClick={() => setRevealed((r) => !r)}
              className="btn btn-sm"
              aria-label={revealed ? "Hide key" : "Reveal and edit key"}
              title={revealed ? "Hide" : "Reveal and edit"}
            >
              <Icon name={revealed ? "eye-off" : "eye"} size={14} />
              {revealed ? "Hide" : "Reveal"}
            </button>
            <button type="button" onClick={onSave} className="btn btn-primary btn-sm">
              Save
            </button>
          </div>
        </label>
        {saved && (
          <p className="mono" style={{ color: "var(--live)", fontSize: 11 }}>{saved}</p>
        )}
        <p style={{ color: "var(--fg-3)", fontSize: 12, lineHeight: 1.5 }}>
          Get one at{" "}
          <a
            href="https://console.anthropic.com"
            target="_blank"
            rel="noreferrer"
            className="mono"
            style={{ color: "var(--fg-1)", textDecoration: "underline" }}
          >
            console.anthropic.com
          </a>
          . Click <strong style={{ color: "var(--fg-1)" }}>Reveal</strong> to edit.
        </p>
      </div>
    </SettingsCard>
  );
}

/* -------- Account (display name is real; email is read-only) -------- */

function AccountSection({
  displayName: initial,
  email,
  onSaved,
}: {
  displayName: string;
  email: string;
  onSaved: (newName: string) => void;
}) {
  const [name, setName] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setName(initial);
  }, [initial]);

  async function onSave() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api.updateMe({ display_name: name.trim() });
      onSaved(name.trim());
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title="Account" subtitle="How you show up to your candidates and your team.">
      <div className="grid items-end gap-3" style={{ gridTemplateColumns: "1fr auto" }}>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Display name</span>
          <input
            className="input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="how you show up to candidates"
          />
        </label>
        <button
          onClick={onSave}
          className="btn btn-primary"
          disabled={busy || !name.trim() || name.trim() === initial}
          aria-disabled={busy}
        >
          {busy ? "Saving…" : saved ? "Saved" : "Save"}
        </button>
      </div>
      <label className="mt-3 flex flex-col gap-1.5">
        <span className="section-label">Email</span>
        <input
          className="input mono"
          value={email}
          readOnly
          style={{ color: "var(--fg-3)", cursor: "not-allowed", fontSize: 12.5 }}
        />
      </label>
      {error && <p className="mono mt-2" style={{ color: "var(--bad)", fontSize: 11 }}>{error}</p>}
    </SettingsCard>
  );
}

/* -------- Team & billing (all mock) -------- */

function TeamBillingSection() {
  const [budget, setBudget] = useState(String(API_BALANCE.total));
  const [invite, setInvite] = useState("");
  return (
    <SettingsCard
      title="Team & billing"
      subtitle="The Anthropic budget is shared across everyone on the team. Adjust the monthly cap and watch the meter."
    >
      <div className="flex flex-col gap-5">
        {/* Team list — mock */}
        <div>
          <SectionLabel>Teammates</SectionLabel>
          <div className="mt-3 flex flex-col gap-2">
            {[
              { name: "Phyo Thant",  role: "interviewer", you: true },
              { name: "Sithu Soe",   role: "interviewer", you: false },
            ].map((t) => (
              <div
                key={t.name}
                className="flex items-center justify-between"
                style={{
                  padding: "8px 12px",
                  background: "var(--bg-2)",
                  border: "1px solid var(--line-1)",
                  borderRadius: "var(--radius)",
                  fontSize: 13,
                }}
              >
                <div className="flex items-center gap-2.5">
                  <Avatar name={t.name} size={24} />
                  <span style={{ color: "var(--fg-0)" }}>{t.name}</span>
                  {t.you && <Pill kind="live">you</Pill>}
                </div>
                <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10, letterSpacing: "0.06em" }}>
                  {t.role.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 grid items-end gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
            <label className="flex flex-col gap-1.5">
              <span className="section-label">Invite by email</span>
              <input
                className="input"
                type="email"
                value={invite}
                onChange={(e) => setInvite(e.target.value)}
                placeholder="teammate@company.com"
              />
            </label>
            <button
              type="button"
              className="btn"
              disabled={!invite.trim()}
              aria-disabled={!invite.trim()}
              title="Team invites are not yet wired"
            >
              Send invite
            </button>
          </div>
        </div>

        {/* Monthly budget — mock */}
        <div>
          <SectionLabel>Monthly Anthropic budget</SectionLabel>
          <div className="mt-3 grid items-end gap-2" style={{ gridTemplateColumns: "1fr auto" }}>
            <div className="flex items-center gap-2">
              <span className="mono" style={{ color: "var(--fg-2)", fontSize: 13 }}>$</span>
              <input
                className="input mono tabular"
                type="number"
                min={0}
                step={5}
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <button type="button" className="btn" title="Budget persistence is not yet wired">
              Save
            </button>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1.5">
              <span className="mono" style={{ color: "var(--fg-3)", fontSize: 10.5, letterSpacing: "0.06em" }}>
                CURRENT MONTH
              </span>
              <span className="mono tabular" style={{ color: "var(--fg-1)", fontSize: 12 }}>
                {API_BALANCE.spentLabel} / ${budget} · {API_BALANCE.remainingLabel}
              </span>
            </div>
            <Progress
              value={API_BALANCE.used}
              max={Number(budget) || 1}
              color="var(--signal)"
            />
          </div>
        </div>
      </div>
    </SettingsCard>
  );
}

/* -------- Notifications (mock) -------- */

function NotificationsSection() {
  const [onJoin, setOnJoin] = useState(false);
  const [onScorecard, setOnScorecard] = useState(true);
  return (
    <SettingsCard
      title="Email notifications"
      subtitle="We'll send these to your account email."
    >
      <ToggleRow
        label="Email me when a candidate joins"
        checked={onJoin}
        onChange={setOnJoin}
      />
      <ToggleRow
        label="Email me when a scorecard is ready"
        checked={onScorecard}
        onChange={setOnScorecard}
      />
    </SettingsCard>
  );
}

/* -------- Slack webhook (mock) -------- */

function SlackSection() {
  const [url, setUrl] = useState("");
  return (
    <SettingsCard
      title="Slack webhook"
      subtitle="Post session events (start, paste flag, scorecard ready) to a Slack channel."
    >
      <div className="grid items-end gap-2" style={{ gridTemplateColumns: "1fr auto auto" }}>
        <label className="flex flex-col gap-1.5">
          <span className="section-label">Incoming webhook URL</span>
          <input
            className="input mono"
            style={{ fontSize: 12.5 }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://hooks.slack.com/services/T0…/B0…/xxxx"
            spellCheck={false}
          />
        </label>
        <button
          type="button"
          className="btn"
          disabled={!url.trim()}
          aria-disabled={!url.trim()}
          title="Test sends a sample event (not yet wired)"
        >
          Test
        </button>
        <button
          type="button"
          className="btn btn-primary"
          disabled={!url.trim()}
          aria-disabled={!url.trim()}
          title="Webhook persistence is not yet wired"
        >
          Save
        </button>
      </div>
    </SettingsCard>
  );
}

/* -------- shared layout primitives -------- */

function SettingsCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="mb-5"
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius-lg)",
        overflow: "hidden",
      }}
    >
      <header
        style={{
          padding: "14px 18px",
          background: "var(--bg-2)",
          borderBottom: "1px solid var(--line-1)",
        }}
      >
        <div className="display" style={{ fontSize: 18, color: "var(--fg-0)" }}>{title}</div>
        <div className="mt-1" style={{ color: "var(--fg-3)", fontSize: 12, lineHeight: 1.5 }}>
          {subtitle}
        </div>
      </header>
      <div style={{ padding: 18 }}>{children}</div>
    </section>
  );
}

function ToggleRow({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className="flex items-center justify-between"
      style={{
        padding: "10px 12px",
        background: "var(--bg-2)",
        border: "1px solid var(--line-1)",
        borderRadius: "var(--radius)",
        fontSize: 13,
        color: "var(--fg-1)",
        cursor: "pointer",
        marginBottom: 8,
      }}
    >
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        style={{
          width: 36,
          height: 20,
          padding: 2,
          background: checked ? "var(--live)" : "var(--bg-3)",
          border: `1px solid ${checked ? "var(--live)" : "var(--line-2)"}`,
          borderRadius: 999,
          position: "relative",
          cursor: "pointer",
          transition: "all 0.18s ease",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 999,
            background: checked ? "oklch(0.10 0.01 155)" : "var(--fg-2)",
            display: "block",
            transform: checked ? "translateX(16px)" : "translateX(0)",
            transition: "transform 0.18s ease",
          }}
        />
      </button>
    </label>
  );
}
