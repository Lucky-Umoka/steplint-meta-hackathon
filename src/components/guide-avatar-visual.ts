/**
 * Pure mapping from the existing Guide avatar state API to 3D visual
 * parameters. Display only: it never verifies anything.
 */
export type GuideVisualState =
  | "idle"
  | "listening"
  | "thinking"
  | "warning"
  | "uncertain"
  | "speaking"
  | "success";

export type GuideVisual = {
  state: GuideVisualState;
  color: string;
  intensity: number;
  pulse: number; // pulse speed in rad/s; 0 = steady
  mouthOpen: number; // 0..1 mean opening
  talk: boolean;
  orbit: boolean;
  listenRing: boolean;
};

export function resolveVisualState(
  mode: "idle" | "thinking" | "warning" | "success" | "uncertain",
  speech: "silent" | "speaking" | "listening",
): GuideVisualState {
  if (mode === "warning") return "warning";
  if (mode === "success") return "success";
  if (mode === "uncertain") return "uncertain";
  if (mode === "thinking") return "thinking";
  if (speech === "speaking") return "speaking";
  if (speech === "listening") return "listening";
  return "idle";
}

const BASE = { mouthOpen: 0.2, talk: false, orbit: false, listenRing: false };

export function visualForState(state: GuideVisualState): GuideVisual {
  switch (state) {
    case "warning":
      return { ...BASE, state, color: "#fb7185", intensity: 1.4, pulse: 6 };
    case "success":
      return { ...BASE, state, color: "#34d399", intensity: 1.5, pulse: 0 };
    case "uncertain":
      return { ...BASE, state, color: "#fbbf24", intensity: 0.6, pulse: 0 };
    case "thinking":
      return {
        ...BASE,
        state,
        color: "#38bdf8",
        intensity: 1,
        pulse: 1.5,
        orbit: true,
      };
    case "speaking":
      return {
        ...BASE,
        state,
        color: "#22d3ee",
        intensity: 1.2,
        pulse: 0,
        talk: true,
        mouthOpen: 0.6,
      };
    case "listening":
      return {
        ...BASE,
        state,
        color: "#22d3ee",
        intensity: 1.1,
        pulse: 3,
        listenRing: true,
      };
    case "idle":
      return { ...BASE, state, color: "#22d3ee", intensity: 0.9, pulse: 0 };
  }
}

export function resolveGuideVisual(
  mode: Parameters<typeof resolveVisualState>[0],
  speech: Parameters<typeof resolveVisualState>[1],
): GuideVisual {
  return visualForState(resolveVisualState(mode, speech));
}
