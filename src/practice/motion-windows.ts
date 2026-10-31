import type { Pixels } from "./tracker";
export type CameraSnapshot = {
  frame: number;
  image: string;
  width: number;
  height: number;
};
export type CapturedWindow = {
  frames: [CameraSnapshot, CameraSnapshot, CameraSnapshot];
  contextFrames: CameraSnapshot[];
};
/** Local capture only. Motion is never evidence that an action was correct. */
export function motionSignature(p: Pixels) {
  return Array.from({ length: 768 }, (_, i) => {
    const x = Math.min(
      p.width - 1,
      Math.floor((((i % 32) + 0.5) * p.width) / 32),
    );
    const y = Math.min(
      p.height - 1,
      Math.floor(((Math.floor(i / 32) + 0.5) * p.height) / 24),
    );
    const j = (y * p.width + x) * 4;
    return (p.data[j] + p.data[j + 1] + p.data[j + 2]) / 3;
  });
}
export function signatureDifference(a: number[], b: number[]) {
  return a.length && a.length === b.length
    ? a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length
    : Infinity;
}
export class MotionWindows {
  private baseline: CameraSnapshot | null = null;
  private baselineSignature: number[] = [];
  private previous: number[] = [];
  private result: CameraSnapshot | null = null;
  private context: CameraSnapshot[] = [];
  private lastMotion = 0;
  moving = false;
  reset() {
    this.baseline = null;
    this.result = null;
    this.context = [];
    this.previous = [];
    this.baselineSignature = [];
    this.moving = false;
  }
  observe(
    current: number[],
    now: number,
    capture: () => CameraSnapshot,
  ): CapturedWindow | null {
    const change = signatureDifference(this.previous, current);
    this.previous = current;
    if (!this.baseline) {
      this.baseline = capture();
      this.baselineSignature = current;
      return null;
    }
    // Cumulative drift catches slow actions that consecutive-frame differences miss.
    if (
      change > 2.5 ||
      (!this.moving && signatureDifference(this.baselineSignature, current) > 3)
    ) {
      this.moving = true;
      this.lastMotion = now;
      this.result = null;
      if (!this.context.length || now - this.context.at(-1)!.frame >= 350) {
        this.context.push(capture());
        if (this.context.length > 4) this.context.splice(1, 1);
      }
      return null;
    }
    if (!this.moving) {
      // Keep the same reference appearance, but a fresh pre-action timestamp.
      if (
        now - this.baseline.frame >= 500 &&
        signatureDifference(this.baselineSignature, current) < 1
      )
        this.baseline = capture();
      return null;
    }
    if (now - this.lastMotion < 400) return null;
    if (!this.result) {
      this.result = capture();
      return null;
    }
    if (now - this.result.frame < 400) return null;
    const last = capture();
    const window: CapturedWindow = {
      frames: [this.baseline, this.result, last],
      contextFrames: this.context.filter(
        (f) => f.frame > this.baseline!.frame && f.frame < this.result!.frame,
      ),
    };
    this.baseline = last;
    this.baselineSignature = current;
    this.result = null;
    this.context = [];
    this.moving = false;
    if (last.frame - window.frames[0].frame > 8000)
      throw Error(
        "This action exceeded the eight-second evidence window. Restore its starting view before continuing.",
      );
    return window;
  }
}
