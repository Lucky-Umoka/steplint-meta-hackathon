import type { Box, ObjectDetection } from "../guide/schema";
import { foregroundPixels, type Foreground } from "../guide/foreground";
import type { Pixels } from "./tracker";
type Feature = { x: number; y: number; patch: Float32Array };
export type AppearanceTrack = {
  objectId: string;
  box: Box;
  features: Feature[];
  width: number;
  height: number;
  lost: boolean;
};
function grey(image: Pixels) {
  if (
    image.data.length !== image.width * image.height * 4 ||
    image.width * image.height > 640 * 480
  )
    throw Error("Invalid bounded tracking frame.");
  const out = new Float32Array(image.width * image.height);
  for (let i = 0; i < out.length; i++)
    out[i] =
      image.data[i * 4] * 0.299 +
      image.data[i * 4 + 1] * 0.587 +
      image.data[i * 4 + 2] * 0.114;
  return out;
}
function patch(data: Float32Array, w: number, h: number, x: number, y: number) {
  if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) return null;
  const p = new Float32Array(25);
  let n = 0,
    mean = 0;
  for (let yy = -2; yy <= 2; yy++)
    for (let xx = -2; xx <= 2; xx++) {
      const v = data[(y + yy) * w + x + xx];
      p[n++] = v;
      mean += v;
    }
  mean /= 25;
  let norm = 0;
  for (let i = 0; i < 25; i++) {
    p[i] -= mean;
    norm += p[i] * p[i];
  }
  if (norm < 400) return null;
  norm = Math.sqrt(norm);
  for (let i = 0; i < 25; i++) p[i] /= norm;
  return p;
}
const correlation = (a: Float32Array, b: Float32Array) => {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
};
function features(
  data: Float32Array,
  w: number,
  h: number,
  box: Box,
  maximum = 18,
  eligible?: (x: number, y: number) => boolean,
) {
  const candidates: { x: number; y: number; strength: number }[] = [];
  const x0 = Math.max(4, Math.ceil(box.left * w) + 2),
    x1 = Math.min(w - 5, Math.floor(box.right * w) - 2),
    y0 = Math.max(4, Math.ceil(box.top * h) + 2),
    y1 = Math.min(h - 5, Math.floor(box.bottom * h) - 2);
  for (let y = y0; y <= y1; y += 2)
    for (let x = x0; x <= x1; x += 2) {
      if (
        eligible &&
        ![-2, 0, 2].every((dy) =>
          [-2, 0, 2].every((dx) => eligible(x + dx, y + dy)),
        )
      )
        continue;
      const gx = Math.abs(data[y * w + x + 1] - data[y * w + x - 1]),
        gy = Math.abs(data[(y + 1) * w + x] - data[(y - 1) * w + x]);
      const strength = Math.min(gx, gy) + Math.max(gx, gy) * 0.15;
      if (strength > 8) candidates.push({ x, y, strength });
    }
  candidates.sort((a, b) => b.strength - a.strength);
  const picked: Feature[] = [];
  for (const c of candidates) {
    if (picked.some((p) => Math.hypot(p.x - c.x, p.y - c.y) < 6)) continue;
    const p = patch(data, w, h, c.x, c.y);
    if (p) picked.push({ x: c.x, y: c.y, patch: p });
    if (picked.length === maximum) break;
  }
  return picked;
}
export function groundAppearance(
  image: Pixels,
  objectId: string,
  box: Box,
  foreground?: Foreground,
): AppearanceTrack {
  const data = grey(image);
  const inside = foreground ? foregroundPixels(foreground) : null;
  const selected = features(
    data,
    image.width,
    image.height,
    box,
    18,
    inside
      ? (x, y) => inside((x + 0.5) / image.width, (y + 0.5) / image.height)
      : undefined,
  );
  if (selected.length < 5)
    throw Error(
      "This object needs a clearer, closer view. Hold the camera steady.",
    );
  return {
    objectId,
    box,
    features: selected,
    width: image.width,
    height: image.height,
    lost: false,
  };
}
function median(xs: number[]) {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}
/** Bounded feature-patch matching; scores are tracking quality, never action probabilities. */
export function trackAppearance(
  image: Pixels,
  track: AppearanceTrack,
): ObjectDetection {
  const failure = (quality: "obstructed" | "ambiguous"): ObjectDetection => {
    track.lost = true;
    return { objectId: track.objectId, quality, box: null, score: null };
  };
  if (
    track.lost ||
    image.width !== track.width ||
    image.height !== track.height
  )
    return failure("ambiguous");
  const data = grey(image),
    matched: {
      old: Feature;
      x: number;
      y: number;
      p: Float32Array;
      score: number;
    }[] = [];
  for (const f of track.features) {
    let best: { x: number; y: number; p: Float32Array; score: number } | null =
        null,
      second = -1;
    for (let dy = -16; dy <= 16; dy += 2)
      for (let dx = -16; dx <= 16; dx += 2) {
        const x = Math.round(f.x + dx),
          y = Math.round(f.y + dy),
          p = patch(data, image.width, image.height, x, y);
        if (!p) continue;
        const score = correlation(f.patch, p);
        if (
          !best ||
          score - 0.0005 * Math.hypot(x - f.x, y - f.y) >
            best.score - 0.0005 * Math.hypot(best.x - f.x, best.y - f.y)
        ) {
          second = best?.score ?? -1;
          best = { x, y, p, score };
        } else if (score > second) second = score;
      }
    if (
      best &&
      best.score >= 0.88 &&
      (best.score - second > 0.025 ||
        (best.score > 0.99 && Math.hypot(best.x - f.x, best.y - f.y) < 3))
    )
      matched.push({ old: f, ...best });
  }
  if (matched.length < 5 || matched.length / track.features.length < 0.65)
    return failure("obstructed");
  const dx = median(matched.map((m) => m.x - m.old.x)),
    dy = median(matched.map((m) => m.y - m.old.y));
  const consistent = matched.filter(
    (m) => Math.hypot(m.x - m.old.x - dx, m.y - m.old.y - dy) < 4,
  );
  if (consistent.length < 5 || consistent.length / matched.length < 0.75)
    return failure("ambiguous");
  const b = {
    left: track.box.left + dx / image.width,
    right: track.box.right + dx / image.width,
    top: track.box.top + dy / image.height,
    bottom: track.box.bottom + dy / image.height,
  };
  if (b.left < 0.005 || b.top < 0.005 || b.right > 0.995 || b.bottom > 0.995)
    return failure("obstructed");
  // Texture must remain recognisable; do not teach the tracker a hand/background after loss.
  track.box = b;
  track.features = consistent.map((m) => ({ x: m.x, y: m.y, patch: m.p }));
  return {
    objectId: track.objectId,
    quality: "observed",
    box: b,
    score: Math.min(
      0.99,
      0.9 + (0.09 * consistent.length) / track.features.length,
    ),
  };
}
export function frameQuality(image: Pixels) {
  const data = grey(image);
  let sum = 0,
    gradient = 0;
  for (let i = 0; i < data.length; i += 3) {
    sum += data[i];
    if (i % image.width < image.width - 1)
      gradient += Math.abs(data[i] - data[i + 1]);
  }
  const n = Math.ceil(data.length / 3);
  return {
    usable: sum / n > 20 && sum / n < 245 && gradient / n > 1.8,
    brightness: sum / n,
  };
}

export function groundBackground(
  image: Pixels,
  excluded: Box[],
): AppearanceTrack | null {
  const data = grey(image),
    box = { left: 0.06, top: 0.06, right: 0.94, bottom: 0.94 };
  const picked = features(
    data,
    image.width,
    image.height,
    box,
    18,
    (x, y) =>
      !excluded.some(
        (b) =>
          x / image.width > b.left - 0.04 &&
          x / image.width < b.right + 0.04 &&
          y / image.height > b.top - 0.04 &&
          y / image.height < b.bottom + 0.04,
      ),
  );
  return picked.length >= 6
    ? {
        objectId: "camera-background",
        box,
        features: picked,
        width: image.width,
        height: image.height,
        lost: false,
      }
    : null;
}
