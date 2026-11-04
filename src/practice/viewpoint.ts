import type { Box } from "../guide/schema";
import type { Pixels } from "./tracker";

/**
 * Viewpoint mapping (owner physical-camera root cause, 2026-11-04).
 *
 * Practice matched every approved object only within ±48 px and ±15 % size
 * of where it sat in the Teach video, so a camera placed differently from the
 * recording camera could never start automatic tracking (every replay passed
 * because it used the Teach video itself as the camera). At Practice start,
 * SAM 3.1 locates the approved objects once in the learner's camera
 * (src/server/practice/locate.ts). From those boxes and the approved Teach
 * boxes we derive ONE camera mapping (uniform scale + shift), accepted only
 * when at least two objects agree. Live frames are then resampled into the
 * Teach viewpoint, so zones, templates, references and the verifier are
 * unchanged and every observation still passes the existing gates.
 */
export type View = { scale: number; dx: number; dy: number };

/** Teach -> live: live = teach * scale + d (normalized coordinates). */
export function viewFromBoxes(
  pairs: { teach: Box; live: Box }[],
): View | null {
  const centre = (b: Box) => ({ x: (b.left + b.right) / 2, y: (b.top + b.bottom) / 2 });
  const size = (b: Box) => Math.sqrt((b.right - b.left) * (b.bottom - b.top));
  const views = pairs
    .filter((p) => size(p.teach) > 0.01 && size(p.live) > 0.01)
    .map((p) => {
      const scale = size(p.live) / size(p.teach);
      const t = centre(p.teach),
        l = centre(p.live);
      return { scale, dx: l.x - scale * t.x, dy: l.y - scale * t.y };
    })
    .filter((v) => v.scale >= 0.35 && v.scale <= 2.5);
  let best: View[] = [];
  for (const anchor of views) {
    const agree = views.filter(
      (v) =>
        Math.abs(v.scale / anchor.scale - 1) <= 0.25 &&
        Math.hypot(v.dx - anchor.dx, v.dy - anchor.dy) <= 0.08,
    );
    if (agree.length > best.length) best = agree;
  }
  if (best.length < 2) return null;
  const mean = (k: keyof View) => best.reduce((a, v) => a + v[k], 0) / best.length;
  const view = { scale: mean("scale"), dx: mean("dx"), dy: mean("dy") };
  // Already the demonstrated viewpoint: no resampling.
  if (Math.abs(view.scale - 1) < 0.08 && Math.hypot(view.dx, view.dy) < 0.03) return null;
  return view;
}

/** Live frame resampled (bilinear) into the Teach viewpoint; outside: grey. */
export function warpToTeach(live: Pixels, view: View): Pixels {
  const { width, height } = live;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    const fy = (((y + 0.5) / height) * view.scale + view.dy) * height - 0.5;
    const y0 = Math.floor(fy),
      ty = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = (((x + 0.5) / width) * view.scale + view.dx) * width - 0.5;
      const x0 = Math.floor(fx),
        tx = fx - x0;
      const o = (y * width + x) * 4;
      data[o + 3] = 255;
      if (x0 < 0 || y0 < 0 || x0 + 1 >= width || y0 + 1 >= height) {
        data[o] = data[o + 1] = data[o + 2] = 128;
        continue;
      }
      const i00 = (y0 * width + x0) * 4,
        i10 = i00 + 4,
        i01 = i00 + width * 4,
        i11 = i01 + 4;
      for (let c = 0; c < 3; c++)
        data[o + c] =
          (live.data[i00 + c] * (1 - tx) + live.data[i10 + c] * tx) * (1 - ty) +
          (live.data[i01 + c] * (1 - tx) + live.data[i11 + c] * tx) * ty;
    }
  }
  return { width, height, data };
}
/** A Teach-viewpoint box drawn on the live camera image. */
export function toLive(box: Box, view: View | null): Box {
  if (!view) return box;
  return {
    left: box.left * view.scale + view.dx,
    top: box.top * view.scale + view.dy,
    right: box.right * view.scale + view.dx,
    bottom: box.bottom * view.scale + view.dy,
  };
}

/**
 * With a SAM-derived camera mapping, the remaining per-reference correction
 * must be small: a large residual means a reference was matched at a wrong
 * place, so that setup attempt is refused (the next attempt retries).
 */
export const MAPPED_MAX_RESIDUAL = 0.05;
export function mappedSetupIssue(
  translations: { x: number; y: number }[],
): string | null {
  return translations.some((t) => Math.hypot(t.x, t.y) > MAPPED_MAX_RESIDUAL)
    ? "Finding the work area again: a reference did not match where the camera mapping places it."
    : null;
}

/** Short noun phrase for a SAM concept prompt from an approved description. */
export function shortNoun(description: string): string {
  const cut = description
    .split(/[(,;:]|\s(?:on|in|under|over|at|from|to|with|moved|serving|used|placed|near|inside|beside|that|which|initially|as)\s/i)[0]
    .replace(/[^\p{L}\p{N} '\-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (cut || description).split(" ").slice(0, 5).join(" ").slice(0, 60).trim();
}
