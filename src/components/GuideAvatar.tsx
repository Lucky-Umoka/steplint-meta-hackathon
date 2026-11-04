"use client";
/**
 * Gideon (StepLint Guide): a lightweight holographic companion face.
 *
 * Pure SVG + CSS. No image asset, no 3D engine, no network, no model.
 * It only *reflects* the deterministic evaluator result and the real
 * SpeechSynthesis state it is given — it never verifies anything itself.
 */
import { Component, Suspense, lazy, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { resolveGuideVisual } from "./guide-avatar-visual";

// Lazy chunk: three.js only loads in browsers that can render it.
const GuideAvatar3D = lazy(() => import("./GuideAvatar3D"));

class AvatarBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function useCan3D(): { ready: boolean; webgl: boolean; reduced: boolean } {
  const [s, setS] = useState({ ready: false, webgl: false, reduced: true });
  useEffect(() => {
    let webgl = false;
    try {
      const c = document.createElement("canvas");
      webgl = Boolean(c.getContext("webgl2") ?? c.getContext("webgl"));
    } catch {
      webgl = false;
    }
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setS({ ready: true, webgl, reduced: mq.matches });
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return s;
}

export type GuideAvatarMode =
  | "idle"
  | "thinking"
  | "warning"
  | "success"
  | "uncertain";
export type GuideAvatarSpeech = "silent" | "speaking" | "listening";
export function resolveAvatarMode(input: {
  violation: boolean;
  complete: boolean;
  uncertain: boolean;
  busy: boolean;
}): GuideAvatarMode {
  if (input.violation) return "warning";
  if (input.complete) return "success";
  if (input.uncertain) return "uncertain";
  if (input.busy) return "thinking";
  return "idle";
}
const PALETTE: Record<GuideAvatarMode, { main: string; soft: string }> = {
  idle: { main: "#22d3ee", soft: "#0e7490" },
  thinking: { main: "#38bdf8", soft: "#0369a1" },
  warning: { main: "#fb7185", soft: "#9f1239" },
  success: { main: "#34d399", soft: "#065f46" },
  uncertain: { main: "#fbbf24", soft: "#92400e" },
};
// Fixed mesh: node positions and links drawn once, never random per render.
const NODES: [number, number][] = [
  [100, 28],
  [64, 44],
  [136, 44],
  [46, 78],
  [154, 78],
  [40, 118],
  [160, 118],
  [58, 152],
  [142, 152],
  [78, 184],
  [122, 184],
  [100, 206],
  [82, 108],
  [118, 108],
];
const LINKS: [number, number][] = [
  [0, 1],
  [0, 2],
  [1, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 10],
  [9, 11],
  [10, 11],
  [1, 12],
  [2, 13],
  [12, 13],
  [12, 7],
  [13, 8],
  [5, 12],
  [6, 13],
];
const PARTICLES: { x: number; y: number; d: string }[] = [
  { x: 30, y: 60, d: "0s" },
  { x: 170, y: 52, d: "1.2s" },
  { x: 24, y: 140, d: "0.6s" },
  { x: 176, y: 150, d: "1.8s" },
  { x: 52, y: 210, d: "0.9s" },
  { x: 148, y: 216, d: "1.5s" },
];
export default function GuideAvatar({
  mode,
  speech,
  caption,
  compact = false,
  artClassName,
}: {
  mode: GuideAvatarMode;
  speech: GuideAvatarSpeech;
  caption?: string;
  compact?: boolean;
  artClassName?: string;
}) {
  const { main, soft } = PALETTE[mode];
  const label =
    mode === "warning"
      ? "Gideon, warning"
      : mode === "success"
        ? "Gideon, step verified"
        : mode === "uncertain"
          ? "Gideon, cannot verify yet"
          : mode === "thinking"
            ? "Gideon, checking evidence"
            : speech === "speaking"
              ? "Gideon, speaking"
              : speech === "listening"
                ? "Gideon, listening"
                : "Gideon, idle";
  const can3D = useCan3D();
  // SVG stays the fallback for SSR, no WebGL and prefers-reduced-motion.
  const use3D = can3D.ready && can3D.webgl && !can3D.reduced;
  const svgArt = (
    <svg viewBox="0 0 200 240" className="h-full w-full" role="presentation">
      <path
        d="M100 14 C58 14 34 52 34 104 C34 150 52 190 74 210 C86 221 114 221 126 210 C148 190 166 150 166 104 C166 52 142 14 100 14 Z"
        fill="none"
        stroke={main}
        strokeWidth="2"
        opacity="0.85"
      />
      {mode === "thinking" && (
        <ellipse
          cx="100"
          cy="120"
          rx="86"
          ry="100"
          fill="none"
          stroke={main}
          strokeWidth="1"
          strokeDasharray="6 10"
          opacity="0.5"
          className="guide-orbit"
        />
      )}
      <g stroke={soft} strokeWidth="1" opacity="0.8">
        {LINKS.map(([a, b], i) => (
          <line
            key={i}
            x1={NODES[a][0]}
            y1={NODES[a][1]}
            x2={NODES[b][0]}
            y2={NODES[b][1]}
          />
        ))}
      </g>
      <g fill={main}>
        {NODES.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 4 === 0 ? 3 : 2} opacity="0.9" />
        ))}
      </g>
      <g className="guide-eyes" fill={main}>
        <ellipse cx="76" cy="106" rx="11" ry="7" opacity="0.35" />
        <ellipse cx="124" cy="106" rx="11" ry="7" opacity="0.35" />
        <circle cx="76" cy="106" r="3.4" />
        <circle cx="124" cy="106" r="3.4" />
      </g>
      <rect
        x="78"
        y="160"
        width="44"
        height="10"
        rx="5"
        fill={main}
        opacity="0.9"
        className={
          speech === "speaking" ? "guide-mouth-talking" : "guide-mouth-idle"
        }
      />
      {speech === "listening" && (
        <circle
          cx="100"
          cy="120"
          r="10"
          fill="none"
          stroke={main}
          strokeWidth="2"
          opacity="0.9"
        />
      )}
      <g fill="#e0f2fe">
        {PARTICLES.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="1.6"
            className="guide-particle"
            style={{ animationDelay: p.d }}
          />
        ))}
      </g>
    </svg>
  );
  return (
    <section
      aria-label="Gideon"
      className={`flex h-full flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-center ${compact ? "min-h-0 p-2" : "min-h-80 p-4"}`}
    >
      <style>{`
        @keyframes guide-breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.02); } }
        @keyframes guide-blink { 0%,93%,100% { transform: scaleY(1); } 95.5% { transform: scaleY(0.08); } }
        @keyframes guide-talk { 0%,100% { transform: scaleY(0.35); } 50% { transform: scaleY(1); } }
        @keyframes guide-drift { 0%,100% { transform: translateY(0); opacity: .5; } 50% { transform: translateY(-7px); opacity: 1; } }
        @keyframes guide-orbit { to { transform: rotate(360deg); } }
        .guide-breathe { animation: guide-breathe 6s ease-in-out infinite; transform-origin: 100px 120px; }
        .guide-eyes { animation: guide-blink 7s ease-in-out infinite; transform-origin: 100px 108px; }
        .guide-mouth-idle { transform: scaleY(0.35); transform-origin: 100px 168px; }
        .guide-mouth-talking { animation: guide-talk 0.55s ease-in-out infinite; transform-origin: 100px 168px; }
        .guide-particle { animation: guide-drift 4s ease-in-out infinite; }
        .guide-orbit { animation: guide-orbit 9s linear infinite; transform-origin: 100px 120px; }
        @media (prefers-reduced-motion: reduce) {
          .guide-breathe, .guide-eyes, .guide-mouth-talking, .guide-particle, .guide-orbit { animation: none; }
        }
      `}</style>
      <div
        aria-hidden="true"
        className={
          artClassName ??
          (compact ? "mx-auto h-36 w-32" : "mx-auto h-60 w-56 sm:h-72 sm:w-64")
        }
        style={{
          background: `radial-gradient(ellipse at center, ${soft}55 0%, transparent 70%)`,
        }}
      >
        {use3D ? (
          <AvatarBoundary fallback={svgArt}>
            <Suspense fallback={svgArt}>
              <GuideAvatar3D
                visual={resolveGuideVisual(mode, speech)}
                animate
              />
            </Suspense>
          </AvatarBoundary>
        ) : (
          svgArt
        )}
      </div>
      <p className="mt-1 text-sm font-semibold text-cyan-100">
        Gideon · {label.replace("Gideon, ", "")}
      </p>
      {caption && !compact && (
        <p className="mt-1 min-h-10 line-clamp-2 text-sm text-slate-200">
          {caption}
        </p>
      )}
      <span className="sr-only" role="status">
        {label}
      </span>
    </section>
  );
}
