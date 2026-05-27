"use client";
import Link from "next/link";
import { useState } from "react";
import { Aperture, Avatar, Icon, Pill } from "@/components/ui";

// Segments are tiers 1..4 of the AI's reply. Higher tiers corrupt only at higher probability.
// Drag the slider to change `pct` → active corruptions = ceil((pct/100)*4); when 0 → 0.
// Each tier carries the original text and a one-liner reason for the popover.
type Segment =
  | { t: string; mono?: boolean }
  | { c: string; orig: string; tier: 1 | 2 | 3 | 4; reason: string; mono?: boolean };

const SEGMENTS: readonly Segment[] = [
  { t: "Both " },
  { c: "heapq.heappush", orig: "heapq.heappush", tier: 1, reason: "Function name unchanged — but the complexity note for it is wrong below.", mono: true },
  { t: " and " },
  { t: "heapq.heappop", mono: true },
  { t: " run in " },
  { c: "O(n)", orig: "O(log n)", tier: 1, reason: "Logarithmic for a binary heap, not linear. Easy to miss if you skim." },
  { t: " time, because each operation has to walk " },
  { c: "the full array", orig: "log n levels", tier: 2, reason: "Heaps are array-backed but the sift operations only touch one root-to-leaf path." },
  { t: " to restore the heap invariant. heappush appends and sifts " },
  { c: "down", orig: "up", tier: 3, reason: "New elements go at the end and sift UP toward the root." },
  { t: ", heappop swaps the last element to position 0 and sifts " },
  { c: "up", orig: "down", tier: 3, reason: "After replacing the root we sift DOWN to the correct position." },
  { t: ". Space is " },
  { c: "O(n²)", orig: "O(1)", tier: 4, reason: "Both operations are in-place — constant extra space.", mono: true },
  { t: " auxiliary." },
];

export function Hero() {
  const [pct, setPct] = useState(30);
  const [hasDragged, setHasDragged] = useState(false);
  const [hasHovered, setHasHovered] = useState(false);
  const activeCount = pct === 0 ? 0 : Math.ceil((pct / 100) * 4);
  const injected = activeCount;
  const isCorrupted = injected > 0;

  return (
    <section
      style={{
        maxWidth: 1320,
        margin: "0 auto",
        padding: "80px 48px 64px",
      }}
    >
      <div className="grid gap-16" style={{ gridTemplateColumns: "1.05fr 1fr" }}>
        {/* LEFT — copy + CTA */}
        <div>
          <h1
            className="display"
            style={{
              fontSize: 92,
              lineHeight: 0.96,
              letterSpacing: "-0.03em",
              margin: 0,
              color: "var(--fg-0)",
            }}
          >
            Measure how
            <br />
            they <span className="display-italic" style={{ color: "var(--live)" }}>prompt.</span>
            <br />
            Measure what
            <br />
            they <span className="display-italic" style={{ color: "var(--warn)" }}>catch.</span>
          </h1>
          <p
            style={{
              marginTop: 28,
              fontSize: 17,
              lineHeight: 1.55,
              color: "var(--fg-1)",
              maxWidth: 540,
            }}
          >
            Acuity drops candidates into a live IDE with an AI pair-programmer on a strict
            token budget — then quietly corrupts a slice of its replies. You watch from the
            other side as they ration prompts and catch the lies. Or don&apos;t.
          </p>
          <div className="mt-7 flex items-center gap-3">
            <Link href="/signup" className="btn btn-primary">
              Start a session <Icon name="arrow-right" size={14} />
            </Link>
          </div>
          <div className="mt-5 flex items-center gap-2" style={{ fontSize: 12, color: "var(--fg-2)" }}>
            <span className="live-pulse-dot" />
            Acuity is free — you only pay Anthropic for the AI calls
            <a
              href="https://console.anthropic.com"
              target="_blank"
              rel="noreferrer"
              className="mono"
              style={{ color: "var(--fg-1)", marginLeft: 4, textDecoration: "underline" }}
            >
              (bring your own API key)
            </a>
          </div>
        </div>

        {/* RIGHT — live hallucination demo card */}
        <div
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--line-1)",
            borderRadius: 12,
            boxShadow:
              "0 40px 80px -40px oklch(0.74 0.16 155 / 0.25), 0 0 0 1px oklch(0.74 0.16 155 / 0.06)",
            overflow: "hidden",
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "12px 18px",
              borderBottom: "1px solid var(--line-1)",
              background: "var(--bg-2)",
            }}
          >
            <div className="mono flex items-center gap-2" style={{ fontSize: 11, color: "var(--fg-2)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: "var(--warn)",
                  display: "inline-block",
                }}
              />
              Interviewer view · hallucination injector
            </div>
            <div className="flex items-center gap-3">
              <span className="section-label">Probability</span>
              <input
                type="range"
                min={0}
                max={100}
                value={pct}
                onChange={(e) => { setPct(Number(e.target.value)); setHasDragged(true); }}
                style={{ accentColor: "var(--warn)", width: 110 }}
                aria-label="Hallucination probability"
              />
              <span
                className="mono tabular"
                style={{
                  color: "var(--warn)",
                  fontSize: 12,
                  width: 36,
                  textAlign: "right",
                }}
              >
                {pct}%
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-4" style={{ padding: 20 }}>
            {/* User bubble */}
            <div className="flex items-start gap-3">
              <Avatar name="Sithu" size={28} />
              <div className="flex-1">
                <div className="mono mb-1" style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                  Sithu · 14:22:48
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    background: "var(--bg-2)",
                    border: "1px solid var(--line-1)",
                    borderRadius: 8,
                    fontSize: 13,
                    color: "var(--fg-0)",
                  }}
                >
                  What&apos;s the time complexity of heapq.heappush and heappop?
                </div>
              </div>
            </div>

            {/* AI bubble */}
            <div className="flex items-start gap-3">
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 999,
                  background: "var(--bg-2)",
                  border: `1px solid ${isCorrupted ? "var(--warn)" : "var(--live)"}`,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                <Aperture size={16} color={isCorrupted ? "var(--warn)" : "var(--live)"} />
              </span>
              <div className="flex-1">
                <div className="mb-1 flex items-center gap-2">
                  <span className="mono" style={{ fontSize: 10, color: "var(--fg-3)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                    AI · 14:22:50
                  </span>
                  <Pill kind={isCorrupted ? "warn" : "live"}>
                    {isCorrupted ? "corrupted" : "clean"}
                  </Pill>
                </div>
                <div
                  onMouseEnter={() => setHasHovered(true)}
                  style={{
                    padding: "10px 12px",
                    background: isCorrupted ? "oklch(0.80 0.16 75 / 0.06)" : "var(--bg-2)",
                    border: `1px solid ${isCorrupted ? "oklch(0.80 0.16 75 / 0.35)" : "var(--line-1)"}`,
                    borderRadius: 8,
                    fontSize: 13.5,
                    color: "var(--fg-0)",
                    lineHeight: 1.6,
                  }}
                >
                  {SEGMENTS.map((seg, i) => {
                    const isCorruption = "c" in seg;
                    if (!isCorruption) {
                      return (
                        <span key={i} className={seg.mono ? "mono" : ""}>
                          {seg.t}
                        </span>
                      );
                    }
                    const active = seg.tier <= activeCount;
                    if (!active) {
                      return (
                        <span key={i} className={seg.mono ? "mono" : ""}>
                          {seg.orig}
                        </span>
                      );
                    }
                    return (
                      <HalluSpan
                        key={i}
                        text={seg.c}
                        original={seg.orig}
                        reason={seg.reason}
                        mono={seg.mono}
                      />
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Educational hints (auto-dismissed on interaction) */}
            {!hasDragged && (
              <div
                className="mono anim-bounce-y"
                style={{
                  alignSelf: "flex-end",
                  marginTop: -8,
                  marginRight: 4,
                  fontSize: 11,
                  color: "var(--warn)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                }}
              >
                ↑ drag to change
              </div>
            )}
            {isCorrupted && !hasHovered && (
              <div
                className="anim-fade-pulse"
                style={{
                  alignSelf: "flex-start",
                  marginTop: -8,
                  marginLeft: 40,
                  padding: "3px 10px",
                  borderRadius: 999,
                  border: "1px dashed var(--warn)",
                  background: "var(--warn-dim)",
                  fontSize: 11,
                  color: "var(--warn)",
                  textTransform: "uppercase",
                  letterSpacing: "0.04em",
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↑ hover the underlined spans
              </div>
            )}
          </div>

          {/* Footer strip */}
          <div
            className="flex items-center justify-between"
            style={{
              padding: "10px 18px",
              borderTop: "1px solid var(--line-1)",
              background: "var(--bg-0)",
              fontSize: 11,
            }}
          >
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1.5">
                <span className="live-pulse-dot" />
                <span className="mono" style={{ color: "var(--fg-2)" }}>live</span>
              </span>
              <span className="mono tabular" style={{ color: "var(--fg-2)" }}>
                tokens 1,242 / 6,000
              </span>
              <span
                className="mono tabular"
                style={{ color: injected > 0 ? "var(--warn)" : "var(--fg-2)" }}
              >
                injected {injected} / 4
              </span>
            </div>
            <span className="mono" style={{ color: "var(--fg-3)" }}>
              session · 7I1Q5K5Y
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function HalluSpan({
  text,
  original,
  reason,
  mono,
}: {
  text: string;
  original: string;
  reason: string;
  mono?: boolean;
}) {
  const [hover, setHover] = useState(false);
  return (
    <span
      className={`hallu ${mono ? "mono" : ""}`}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{ position: "relative" }}
    >
      {text}
      {hover && (
        <span
          style={{
            position: "absolute",
            left: "50%",
            bottom: "calc(100% + 8px)",
            transform: "translateX(-50%)",
            width: 280,
            background: "var(--bg-0)",
            border: "1px solid var(--warn)",
            borderRadius: 6,
            padding: 10,
            boxShadow: "0 12px 24px -8px black",
            zIndex: 20,
            color: "var(--fg-0)",
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
            lineHeight: 1.5,
            whiteSpace: "normal",
            cursor: "default",
          }}
        >
          <span
            className="mono mb-1 flex items-center gap-1"
            style={{ color: "var(--warn)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.06em" }}
          >
            <Icon name="warn" size={12} color="var(--warn)" />
            rewritten span
          </span>
          <div className="mt-1" style={{ color: "var(--fg-1)" }}>
            Original: <span className="mono" style={{ color: "var(--live)" }}>{original}</span>
          </div>
          <div className="mt-1" style={{ color: "var(--fg-2)" }}>{reason}</div>
        </span>
      )}
    </span>
  );
}

export default Hero;
