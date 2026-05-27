"use client";
import { useState } from "react";
import { Aperture, Icon, SectionLabel } from "@/components/ui";

type Intent = "try" | "demo" | "other";

export function Contact() {
  const [intent, setIntent] = useState<Intent>("try");
  const [submitted, setSubmitted] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [message, setMessage] = useState("");

  function reset() {
    setSubmitted(false);
    setName("");
    setEmail("");
    setCompany("");
    setMessage("");
    setIntent("try");
  }

  return (
    <section
      id="contact"
      style={{ maxWidth: 1320, margin: "100px auto 0", padding: "0 48px" }}
    >
      <div
        className="relative overflow-hidden"
        style={{
          background: "linear-gradient(160deg, var(--bg-1), oklch(0.18 0.012 155 / 0.35))",
          border: "1px solid var(--line-1)",
          borderRadius: 16,
          padding: "56px 48px",
        }}
      >
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: -120,
            right: -120,
            opacity: 0.06,
            pointerEvents: "none",
          }}
        >
          <Aperture size={420} color="var(--live)" />
        </div>

        <div className="grid gap-14" style={{ gridTemplateColumns: "1fr 1.1fr", position: "relative" }}>
          {/* LEFT — copy + info list */}
          <div>
            <SectionLabel>Contact</SectionLabel>
            <h2
              className="display mt-2"
              style={{ fontSize: 48, lineHeight: 1.05, letterSpacing: "-0.02em" }}
            >
              Get in touch with{" "}
              <span className="display-italic" style={{ color: "var(--live)" }}>the team</span>.
            </h2>
            <p className="mt-5" style={{ color: "var(--fg-2)", fontSize: 14.5, lineHeight: 1.6, maxWidth: 480 }}>
              Acuity is always free — you only pay Anthropic for the AI calls you use. Tell us a
              bit about how you&apos;d use it and we&apos;ll send you a sandbox key and walk through
              the platform together.
            </p>
            <div className="mt-7 flex flex-col gap-4">
              <InfoRow
                icon={<Icon name="sparkle" size={16} color="var(--live)" />}
                accent="var(--live)"
                label="Cost"
                value="Free, forever"
              />
              <InfoRow
                icon={<Aperture size={16} color="var(--signal)" />}
                accent="var(--signal)"
                label="Bring your own AI"
                value="Plug in your Anthropic key"
              />
              <InfoRow
                icon={<Icon name="clock" size={16} color="var(--fg-1)" />}
                accent="var(--fg-1)"
                label="Response time"
                value="Usually under 24 hours"
              />
            </div>
          </div>

          {/* RIGHT — form / success */}
          <div
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--line-1)",
              borderRadius: "var(--radius-lg)",
              padding: 28,
            }}
          >
            {!submitted ? (
              <form
                onSubmit={(e) => { e.preventDefault(); setSubmitted(true); }}
                className="flex flex-col gap-3"
              >
                <div className="grid gap-3" style={{ gridTemplateColumns: "1fr 1fr" }}>
                  <Field label="Name">
                    <input className="input" required value={name} onChange={(e) => setName(e.target.value)} />
                  </Field>
                  <Field label="Email">
                    <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                  </Field>
                </div>
                <Field label="Company">
                  <input className="input" value={company} onChange={(e) => setCompany(e.target.value)} />
                </Field>
                <Field label="What brings you here?">
                  <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr 1fr" }}>
                    {(["try", "demo", "other"] as const).map((k) => {
                      const labels = { try: "Try Acuity", demo: "Book a demo", other: "Something else" };
                      const isActive = intent === k;
                      return (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setIntent(k)}
                          style={{
                            padding: "8px 10px",
                            background: isActive ? "var(--live-dim)" : "var(--bg-2)",
                            border: `1px solid ${isActive ? "var(--live)" : "var(--line-1)"}`,
                            borderRadius: 6,
                            color: isActive ? "var(--live)" : "var(--fg-1)",
                            fontSize: 12.5,
                            cursor: "pointer",
                          }}
                        >
                          {labels[k]}
                        </button>
                      );
                    })}
                  </div>
                </Field>
                <Field label="Message">
                  <textarea
                    className="textarea"
                    rows={4}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </Field>
                <button type="submit" className="btn btn-primary mt-1 justify-center">
                  Send message <Icon name="arrow-right" size={14} />
                </button>
              </form>
            ) : (
              <div className="flex flex-col items-center text-center" style={{ padding: "12px 8px" }}>
                <span
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 999,
                    background: "var(--live-dim)",
                    border: "1px solid var(--live)",
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="check" size={26} color="var(--live)" />
                </span>
                <div className="display mt-4" style={{ fontSize: 32, color: "var(--fg-0)" }}>
                  We&apos;ll be in touch.
                </div>
                <p className="mt-2" style={{ color: "var(--fg-2)", fontSize: 13.5, maxWidth: 360 }}>
                  Thanks {name.split(" ")[0] || "there"} — we got your message and will reply within 24 hours.
                </p>
                <button onClick={reset} className="btn mt-5">Send another</button>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="section-label">{label}</span>
      {children}
    </label>
  );
}

function InfoRow({
  icon,
  accent,
  label,
  value,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          background: `color-mix(in oklch, ${accent} 12%, transparent)`,
          border: `1px solid ${accent}`,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </span>
      <div>
        <div className="section-label">{label}</div>
        <div className="mt-0.5" style={{ color: "var(--fg-0)", fontSize: 13.5 }}>{value}</div>
      </div>
    </div>
  );
}

export default Contact;
