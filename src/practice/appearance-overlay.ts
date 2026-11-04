import type { Box, ObjectDetection } from "../guide/schema";
import { foregroundPixels, type Foreground } from "../guide/foreground";
import type { Pixels } from "./tracker";
type Sample = { x: number; y: number; color: number[]; inside: boolean };
export type OverlayTrack = {
  objectId: string;
  measurement?: { cost: number; alternativeGap: number | null };
  scale?: number;
  box: Box;
  width: number;
  height: number;
  samples: Sample[];
  origin: { x: number; y: number };
  last: { x: number; y: number };
  palette: number[][];
  /**
   * Template grounded from Teach source pixels and matched against a live
   * camera with its own exposure: compensate global per-channel brightness
   * and contrast before scoring (live E2E root cause: phone auto-exposure).
   * The error, retention and competing-candidate gates are unchanged.
   */
  illumination?: boolean;
};
const rgb = (p: Pixels, x: number, y: number) => {
  const j = (Math.round(y) * p.width + Math.round(x)) * 4;
  return [p.data[j], p.data[j + 1], p.data[j + 2]];
};
/** Dense, mask-seeded appearance tracking for advisory overlays only. It cannot
 * establish contact, procedural correctness or identity after a lost view. */
export function groundOverlay(
  p: Pixels,
  objectId: string,
  box: Box,
  foreground?: Foreground | ((x: number, y: number) => boolean),
): OverlayTrack {
  const inside = !foreground
    ? null
    : typeof foreground === "function"
      ? foreground
      : foregroundPixels(foreground);
  const samples: Sample[] = [];
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      const xx =
          (box.left + ((box.right - box.left) * (x + 0.5)) / 8) * p.width,
        yy = (box.top + ((box.bottom - box.top) * (y + 0.5)) / 8) * p.height;
      samples.push({
        x: xx,
        y: yy,
        color: rgb(p, xx, yy),
        inside: inside ? inside(xx / p.width, yy / p.height) : true,
      });
    }
  const positive = samples.filter((s) => s.inside);
  if (positive.length < 12)
    throw Error("Insufficient visible appearance for local highlighting.");
  const palette = positive
    .filter((_, i) => i % Math.max(1, Math.floor(positive.length / 6)) === 0)
    .map((s) => s.color);
  if (inside) {
    for (const side of [-0.12, 1.12])
      for (let i = 0; i < 8; i++) {
        for (const [x, y] of [
          [side, (i + 0.5) / 8],
          [(i + 0.5) / 8, side],
        ]) {
          const xx = (box.left + (box.right - box.left) * x) * p.width,
            yy = (box.top + (box.bottom - box.top) * y) * p.height;
          if (xx >= 0 && yy >= 0 && xx < p.width - 1 && yy < p.height - 1)
            samples.push({
              x: xx,
              y: yy,
              color: rgb(p, xx, yy),
              inside: false,
            });
        }
      }
  }
  const center = {
    x: ((box.left + box.right) * p.width) / 2,
    y: ((box.top + box.bottom) * p.height) / 2,
  };
  return {
    objectId,
    box: { ...box },
    width: p.width,
    height: p.height,
    samples,
    origin: center,
    last: center,
    palette,
  };
}
/**
 * Object-only sample mask for a MOVED object (owner export 2026-11-04): the
 * box of a round white bowl also contains the towel at its corners, so the
 * template stopped matching as soon as the bowl stood on the black mat and
 * the bowl was "lost" while sitting still. Samples whose colour is close to
 * the colours along the box border are background; the rest are the object.
 * Returns null (use the whole box, as before) when fewer than 12 of the 64
 * samples stand out, e.g. an object the same colour as its surroundings.
 */
export function contrastForeground(
  p: Pixels,
  box: Box,
): ((x: number, y: number) => boolean) | null {
  const border: number[][] = [];
  const inset = 0.03;
  for (let i = 0; i < 12; i++) {
    const f = (i + 0.5) / 12;
    for (const [x, y] of [
      [box.left + (box.right - box.left) * f, box.top + (box.bottom - box.top) * inset],
      [box.left + (box.right - box.left) * f, box.bottom - (box.bottom - box.top) * inset],
      [box.left + (box.right - box.left) * inset, box.top + (box.bottom - box.top) * f],
      [box.right - (box.right - box.left) * inset, box.top + (box.bottom - box.top) * f],
    ])
      border.push(rgb(p, Math.min(p.width - 1, x * p.width), Math.min(p.height - 1, y * p.height)));
  }
  const distinct = (x: number, y: number) => {
    const c = rgb(p, Math.min(p.width - 1, x * p.width), Math.min(p.height - 1, y * p.height));
    let nearest = 255;
    for (const b of border)
      nearest = Math.min(
        nearest,
        Math.max(Math.abs(b[0] - c[0]), Math.abs(b[1] - c[1]), Math.abs(b[2] - c[2])),
      );
    return nearest > 40;
  };
  let count = 0;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++)
      if (
        distinct(
          box.left + ((box.right - box.left) * (x + 0.5)) / 8,
          box.top + ((box.bottom - box.top) * (y + 0.5)) / 8,
        )
      )
        count++;
  return count >= 12 ? distinct : null;
}
export function trackOverlay(
  p: Pixels,
  t: OverlayTrack,
  options?: {
    multiscale: boolean;
    retainFraction?: number;
    exhaustiveTranslation?: boolean;
    /** Grid step for exhaustive search (default 1 px). */
    searchStep?: 1 | 2;
  },
): ObjectDetection {
  t.measurement = undefined;
  const unknown = (): ObjectDetection => ({
    objectId: t.objectId,
    quality: "ambiguous",
    box: null,
    score: null,
  });
  if (p.width !== t.width || p.height !== t.height) return unknown();
  const originDx = t.last.x - t.origin.x,
    originDy = t.last.y - t.origin.y;
  const currentScale = t.scale ?? 1;
  // Templates are grounded from Uint8 pixels. Reuse a residual histogram
  // instead of allocating RGB arrays and sorting up to 64 errors per candidate.
  // This computes the exact same trimmed mean and keeps every matching gate.
  if (
    t.samples.length > 128 ||
    t.samples.some(
      (sample) =>
        sample.color.length !== 3 ||
        sample.color.some(
          (value) => !Number.isInteger(value) || value < 0 || value > 255,
        ),
    )
  )
    throw Error("Invalid grounded appearance template.");
  const histogram = new Uint16Array(256),
    fraction = options?.retainFraction ?? 0.8;
  if (fraction <= 0 || fraction > 1)
    throw Error("Invalid appearance retention policy.");
  // Template statistics for illumination compensation (inside samples only).
  const inside = t.samples.filter((sample) => sample.inside);
  const stats = [0, 1, 2].map((c) => {
    const values = inside.map((sample) => sample.color[c]);
    const mean = values.reduce((a, v) => a + v, 0) / Math.max(1, values.length);
    const sd = Math.sqrt(
      values.reduce((a, v) => a + (v - mean) ** 2, 0) /
        Math.max(1, values.length),
    );
    return { mean, sd };
  });
  // Latency (owner request 2026-11-04): the candidate loop below is the
  // tracker's hot path (~1,000 to ~9,400 evaluations per object per frame).
  // Everything that does not depend on the candidate is prepared once:
  // per-scale sample base positions (the SAME float expression as before,
  // so Math.round(base + d) is bit-identical), flat template colours, and
  // each outside sample's constant palette distance. Pixels are read once
  // per sample and reused for illumination fitting and scoring. Decisions
  // are unchanged (scripts/bench/tracking-bench.ts checksum).
  const sampleCount = t.samples.length;
  const insideFlag = new Uint8Array(sampleCount),
    colour = new Int16Array(sampleCount * 3),
    negativeCandidate = new Uint8Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    const sample = t.samples[i];
    insideFlag[i] = sample.inside ? 1 : 0;
    colour[i * 3] = sample.color[0];
    colour[i * 3 + 1] = sample.color[1];
    colour[i * 3 + 2] = sample.color[2];
    if (!sample.inside) {
      let old = 255;
      for (const c of t.palette)
        old = Math.min(
          old,
          Math.max(
            Math.abs(c[0] - sample.color[0]),
            Math.abs(c[1] - sample.color[1]),
            Math.abs(c[2] - sample.color[2]),
          ),
        );
      negativeCandidate[i] = old > 35 ? 1 : 0;
    }
  }
  const paletteFlat = t.palette.flat();
  const bases = new Map<number, { x: Float64Array; y: Float64Array }>();
  const baseFor = (scale: number) => {
    let base = bases.get(scale);
    if (!base) {
      base = { x: new Float64Array(sampleCount), y: new Float64Array(sampleCount) };
      for (let i = 0; i < sampleCount; i++) {
        base.x[i] = t.origin.x + (t.samples[i].x - t.origin.x) * scale;
        base.y[i] = t.origin.y + (t.samples[i].y - t.origin.y) * scale;
      }
      bases.set(scale, base);
    }
    return base;
  };
  const pixel = new Int32Array(sampleCount);
  const width = p.width,
    height = p.height,
    data = p.data;
  const evaluate = (dx: number, dy: number, scale = currentScale) => {
    const base = baseFor(scale);
    // One read per sample; any sample outside the frame rejects the
    // candidate (as both former passes did).
    let n = 0,
      s0 = 0,
      s1 = 0,
      s2 = 0,
      q0 = 0,
      q1 = 0,
      q2 = 0;
    for (let i = 0; i < sampleCount; i++) {
      const x = Math.round(base.x[i] + dx),
        y = Math.round(base.y[i] + dy);
      if (x < 0 || y < 0 || x >= width || y >= height) return Infinity;
      const index = (y * width + x) * 4;
      pixel[i] = index;
      if (insideFlag[i]) {
        const r = data[index],
          g = data[index + 1],
          b = data[index + 2];
        s0 += r;
        s1 += g;
        s2 += b;
        q0 += r * r;
        q1 += g * g;
        q2 += b * b;
        n++;
      }
    }
    let g0 = 1,
      g1 = 1,
      g2 = 1,
      o0 = 0,
      o1 = 0,
      o2 = 0;
    const illumination = !!t.illumination;
    if (illumination) {
      if (!n) return Infinity;
      const gainOf = (sum: number, sq: number, c: number) => {
        const mean = sum / n,
          sd = Math.sqrt(Math.max(0, sq / n - mean * mean));
        // Flat regions: brightness offset only (no noise amplification).
        return stats[c].sd < 6 || sd < 6 ? 1 : stats[c].sd / sd;
      };
      g0 = gainOf(s0, q0, 0);
      g1 = gainOf(s1, q1, 1);
      g2 = gainOf(s2, q2, 2);
      // A plausible global lighting change, not an arbitrary remapping.
      if (g0 < 0.5 || g0 > 2 || g1 < 0.5 || g1 > 2 || g2 < 0.5 || g2 > 2)
        return Infinity;
      o0 = stats[0].mean - g0 * (s0 / n);
      o1 = stats[1].mean - g1 * (s1 / n);
      o2 = stats[2].mean - g2 * (s2 / n);
    }
    histogram.fill(0);
    let count = 0,
      total = 0,
      negative = 0,
      negativeCount = 0;
    for (let i = 0; i < sampleCount; i++) {
      const index = pixel[i];
      let r = data[index],
        g = data[index + 1],
        b = data[index + 2];
      if (illumination) {
        r = Math.min(255, Math.max(0, Math.round(r * g0 + o0)));
        g = Math.min(255, Math.max(0, Math.round(g * g1 + o1)));
        b = Math.min(255, Math.max(0, Math.round(b * g2 + o2)));
      }
      if (insideFlag[i]) {
        const error = Math.max(
          Math.abs(r - colour[i * 3]),
          Math.abs(g - colour[i * 3 + 1]),
          Math.abs(b - colour[i * 3 + 2]),
        );
        histogram[error]++;
        count++;
        total += error;
      } else {
        negativeCount++;
        if (!negativeCandidate[i]) continue;
        let now = 255;
        for (let k = 0; k < paletteFlat.length; k += 3)
          now = Math.min(
            now,
            Math.max(
              Math.abs(paletteFlat[k] - r),
              Math.abs(paletteFlat[k + 1] - g),
              Math.abs(paletteFlat[k + 2] - b),
            ),
          );
        if (now < 25) negative++;
      }
    }
    const retained = Math.ceil(count * fraction);
    if (!retained) return Infinity;
    if (retained < count) {
      let remaining = retained;
      total = 0;
      for (let error = 0; error < 256 && remaining; error++) {
        const k = Math.min(remaining, histogram[error]);
        total += k * error;
        remaining -= k;
      }
    }
    return (
      total / retained + (negativeCount ? (negative / negativeCount) * 120 : 0)
    );
  };
  const candidates: { dx: number; dy: number; cost: number }[] = [];
  // Exhaustive search stays at 1 px by default: a 2 px grid can miss a
  // near-identical twin and break the lookalike-separation gate.
  const translationStep = options?.exhaustiveTranslation
    ? (options.searchStep ?? 1)
    : 4;
  for (let dy = -48; dy <= 48; dy += translationStep)
    for (let dx = -48; dx <= 48; dx += translationStep) {
      const x = Math.round(originDx + dx),
        y = Math.round(originDy + dy);
      candidates.push({ dx: x, dy: y, cost: evaluate(x, y) });
    }
  if (options?.multiscale)
    for (let dy = -8; dy <= 8; dy++)
      for (let dx = -8; dx <= 8; dx++) {
        const x = Math.round(originDx + dx),
          y = Math.round(originDy + dy);
        candidates.push({ dx: x, dy: y, cost: evaluate(x, y) });
      }
  candidates.sort((a, b) => a.cost - b.cost);
  let best = candidates[0];
  for (let dy = -3; dy <= 3; dy++)
    for (let dx = -3; dx <= 3; dx++) {
      const x = candidates[0].dx + dx,
        y = candidates[0].dy + dy,
        cost = evaluate(x, y);
      if (cost < best.cost) best = { dx: x, dy: y, cost };
    }
  let bestScale = currentScale;
  if (options?.multiscale) {
    const center = { ...best };
    for (const ratio of [0.85, 0.925, 1, 1.075, 1.15]) {
      const scale = currentScale * ratio;
      if (scale < 0.5 || scale > 2) continue;
      for (let dy = -4; dy <= 4; dy += 2)
        for (let dx = -4; dx <= 4; dx += 2) {
          const x = center.dx + dx,
            y = center.dy + dy,
            cost = evaluate(x, y, scale);
          if (cost < best.cost) {
            best = { dx: x, dy: y, cost };
            bestScale = scale;
          }
        }
    }
  }
  const separation = Math.max(
    8,
    Math.min(
      (t.box.right - t.box.left) * p.width,
      (t.box.bottom - t.box.top) * p.height,
    ) * 0.5,
  );
  const second = candidates.find(
    (c) => Math.hypot(c.dx - best.dx, c.dy - best.dy) > separation,
  );
  if (best.cost > 24 || (second && second.cost - best.cost < 2))
    return unknown();
  const box = {
    left:
      (t.origin.x + (t.box.left * p.width - t.origin.x) * bestScale + best.dx) /
      p.width,
    top:
      (t.origin.y + (t.box.top * p.height - t.origin.y) * bestScale + best.dy) /
      p.height,
    right:
      (t.origin.x +
        (t.box.right * p.width - t.origin.x) * bestScale +
        best.dx) /
      p.width,
    bottom:
      (t.origin.y +
        (t.box.bottom * p.height - t.origin.y) * bestScale +
        best.dy) /
      p.height,
  };
  if (box.left < 0 || box.top < 0 || box.right > 1 || box.bottom > 1)
    return unknown();
  t.measurement = {
    cost: best.cost,
    alternativeGap: second ? second.cost - best.cost : null,
  };
  t.scale = bestScale;
  t.last = { x: t.origin.x + best.dx, y: t.origin.y + best.dy };
  return { objectId: t.objectId, quality: "observed", box, score: null };
}
