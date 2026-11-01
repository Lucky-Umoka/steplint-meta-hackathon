/**
 * Gesture-to-action state machine. Pure logic: no DOM, no model imports.
 *
 * Interface-only by construction: it emits pointer positions and UI intents
 * (click at a point, pause request). It cannot verify steps, skip
 * prerequisites, override violations, or approve procedures — it never
 * touches the evaluator, and click intents resolve to ordinary DOM buttons.
 */
export type GestureKind = "point" | "pinch" | "open_palm" | "none";
export type GestureAction =
  | { kind: "move"; x: number; y: number }
  | { kind: "click"; x: number; y: number }
  | { kind: "pause" }
  | { kind: "none" };
export type GestureReading = {
  kind: GestureKind;
  /** 0..1 recognizer confidence. Below threshold the reading is ignored. */
  confidence: number | null;
  geometry?: "hand-relative-pinch";
  /** Normalized fingertip position (0..1). Required for point/pinch. */
  x?: number;
  y?: number;
  /** Pinch gap in normalized units (thumb tip to index tip). */
  pinchGap?: number;
  at: number;
};
export type GestureZone = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
const DEFAULTS = {
  minConfidence: 0.5,
  pinchStart: 0.05,
  pinchRelease: 0.08,
  pinchDwellMs: 250,
  palmDwellMs: 1200,
  clickCooldownMs: 800,
};
/** The designated control strip: right edge, away from the work area. */
export const DEFAULT_ZONE: GestureZone = {
  left: 0.8,
  top: 0.1,
  right: 0.98,
  bottom: 0.9,
};
export function inZone(zone: GestureZone, x: number, y: number) {
  return x >= zone.left && x <= zone.right && y >= zone.top && y <= zone.bottom;
}
/** Map the camera control strip to the full screen for ordinary UI controls. */
export function controlPointer(zone: GestureZone, x: number, y: number) {
  const clamp = (n: number) => Math.max(0, Math.min(1, n));
  return {
    x: clamp((x - zone.left) / (zone.right - zone.left)),
    y: clamp((y - zone.top) / (zone.bottom - zone.top)),
  };
}
export class GestureEngine {
  private pinchSince: number | null = null;
  private palmSince: number | null = null;
  private palmFired = false;
  private lastClickAt = -Infinity;
  private pinched = false;
  lastIgnored: string | null = null;
  constructor(
    private zone: GestureZone = DEFAULT_ZONE,
    private opts: typeof DEFAULTS = DEFAULTS,
  ) {}
  reset() {
    this.pinchSince = null;
    this.palmSince = null;
    this.palmFired = false;
    this.lastClickAt = -Infinity;
    this.pinched = false;
    this.lastIgnored = null;
  }
  observe(reading: GestureReading): GestureAction {
    this.lastIgnored = null;
    const geometricPinch =
      reading.kind === "pinch" &&
      reading.geometry === "hand-relative-pinch" &&
      reading.confidence === null &&
      Number.isFinite(reading.pinchGap) &&
      reading.pinchGap! >= 0 &&
      reading.pinchGap! <= 0.09;
    if (
      !geometricPinch &&
      (reading.confidence === null ||
        !Number.isFinite(reading.confidence) ||
        reading.confidence < this.opts.minConfidence)
    ) {
      this.lastIgnored = "low-confidence";
      this.resetHold();
      return { kind: "none" };
    }
    if (reading.kind === "open_palm") {
      if (
        reading.x === undefined ||
        reading.y === undefined ||
        !inZone(this.zone, reading.x, reading.y)
      ) {
        this.lastIgnored = "outside-zone";
        this.resetHold();
        return { kind: "none" };
      }
      this.pinched = false;
      this.pinchSince = null;
      if (this.palmSince === null) this.palmSince = reading.at;
      if (
        !this.palmFired &&
        reading.at - this.palmSince >= this.opts.palmDwellMs
      ) {
        this.palmFired = true;
        return { kind: "pause" };
      }
      return { kind: "none" };
    }
    this.palmSince = null;
    this.palmFired = false;
    if (reading.kind === "none") {
      this.resetHold();
      return { kind: "none" };
    }
    const { x, y } = reading;
    if (x === undefined || y === undefined || !inZone(this.zone, x, y)) {
      if (x !== undefined && y !== undefined) this.lastIgnored = "outside-zone";
      this.resetHold();
      // Pointer stays where it was; no move emitted outside the zone.
      return { kind: "none" };
    }
    if (reading.kind === "pinch") {
      const gap = reading.pinchGap ?? 0;
      if (!this.pinched && gap <= this.opts.pinchStart) {
        if (this.pinchSince === null) this.pinchSince = reading.at;
        if (reading.at - this.pinchSince >= this.opts.pinchDwellMs) {
          this.pinched = true;
          if (reading.at - this.lastClickAt >= this.opts.clickCooldownMs) {
            this.lastClickAt = reading.at;
            return { kind: "click", x, y };
          }
          return { kind: "none" };
        }
        return { kind: "none" };
      }
      if (this.pinched && gap >= this.opts.pinchRelease) {
        this.pinched = false;
        this.pinchSince = null;
      }
      return { kind: "move", x, y };
    }
    // point: track the pointer; a held pinch already fired above.
    this.pinchSince = null;
    this.pinched = false;
    return { kind: "move", x, y };
  }
  private resetHold() {
    this.pinchSince = null;
    this.pinched = false;
    this.palmSince = null;
    this.palmFired = false;
  }
}
