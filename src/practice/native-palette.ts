import type { Box, ObjectDetection } from "../guide/schema";
import type { Pixels } from "./tracker";
type Colour = [number, number, number];
export type NativePalette = {
  objectId: string;
  colour: Colour;
  area: number;
  aspect: number;
  last: { x: number; y: number };
  lost: boolean;
  seedBox: Box;
  seedPixels: number;
  partialIdentity?: { score: number; visibleFraction: number };
  measurement?: { error: number; pixels: number };
};
const distance = (a: Colour, b: Colour) => {
  // Chromaticity is invariant to moderate illumination on naturally coloured
  // surfaces; neutral surfaces retain absolute RGB and may need texture mode.
  if (Math.max(...b) - Math.min(...b) > 40 && Math.max(...b) > 50) {
    if (Math.max(...a) < 25) return 255;
    const sumA = a[0] + a[1] + a[2],
      sumB = b[0] + b[1] + b[2];
    return Math.max(
      ...a.map((value, i) => Math.abs(value / sumA - b[i] / sumB) * 255),
    );
  }
  return Math.max(
    Math.abs(a[0] - b[0]),
    Math.abs(a[1] - b[1]),
    Math.abs(a[2] - b[2]),
  );
};
const pixel = (image: Pixels, x: number, y: number): Colour => {
  const i = (y * image.width + x) * 4;
  return [image.data[i], image.data[i + 1], image.data[i + 2]];
};
/** Learn a naturally distinctive surface, without requiring a marker or named colour. */
export function groundNativePalette(
  image: Pixels,
  objectId: string,
  box: Box,
): NativePalette | null {
  // Paid run 17: a SAM box cropping the bottle's base by more than the 10%
  // margin put the object's own base in its "surroundings", so a distinctive
  // red bottle was refused colour tracking (and lost under every grasp). The
  // surroundings are re-sampled once twice as far out; the distinctiveness
  // limits are unchanged, so a colour common near the object still fails.
  return (
    groundAt(image, objectId, box, 0.1) ?? groundAt(image, objectId, box, 0.2)
  );
}
function groundAt(
  image: Pixels,
  objectId: string,
  box: Box,
  margin: number,
): NativePalette | null {
  const samples: Colour[] = [],
    ring: Colour[] = [];
  const x0 = Math.floor(box.left * image.width),
    x1 = Math.ceil(box.right * image.width),
    y0 = Math.floor(box.top * image.height),
    y1 = Math.ceil(box.bottom * image.height);
  for (let y = y0; y < y1; y += 2)
    for (let x = x0; x < x1; x += 2) samples.push(pixel(image, x, y));
  // Surroundings are sampled a margin outside the reviewed box: a SAM box
  // that slightly crops the object (e.g. excludes a bottle's cap) must not
  // count the object's own pixels as background (browser root cause,
  // 2026-11-03). The distinctiveness limits below are unchanged.
  const mx = Math.max(3, Math.round((x1 - x0) * margin)),
    my = Math.max(3, Math.round((y1 - y0) * margin));
  for (let i = 0; i < 24; i++)
    for (const [x, y] of [
      [x0 - mx, y0 + ((y1 - y0) * i) / 24],
      [x1 + mx, y0 + ((y1 - y0) * i) / 24],
      [x0 + ((x1 - x0) * i) / 24, y0 - my],
      [x0 + ((x1 - x0) * i) / 24, y1 + my],
    ]) {
      const xx = Math.round(x),
        yy = Math.round(y);
      if (xx >= 0 && yy >= 0 && xx < image.width && yy < image.height)
        ring.push(pixel(image, xx, yy));
    }
  if (samples.length < 30 || ring.length < 20) return null;
  const bins = new Map<string, { sum: Colour; count: number }>();
  for (const c of samples) {
    const key = c.map((v) => Math.floor(v / 32)).join(":");
    const bin = bins.get(key) ?? { sum: [0, 0, 0], count: 0 };
    for (let k = 0; k < 3; k++) bin.sum[k] += c[k];
    bin.count++;
    bins.set(key, bin);
  }
  const candidates = [...bins.values()].sort((a, b) => b.count - a.count);
  for (const candidate of candidates.slice(0, 8)) {
    const colour = candidate.sum.map((v) => v / candidate.count) as Colour;
    const positives =
      samples.filter((c) => distance(c, colour) <= 40).length / samples.length;
    const background =
      ring.filter((c) => distance(c, colour) <= 50).length / ring.length;
    if (positives < 0.35 || background > 0.08) continue;
    const profile: NativePalette = {
      objectId,
      colour,
      area: 0,
      aspect: (x1 - x0) / (y1 - y0),
      last: { x: (x0 + x1) / 2, y: (y0 + y1) / 2 },
      lost: false,
      seedBox: { ...box },
      seedPixels: 0,
    };
    const result = measureNativePalette(image, profile, true);
    if (result.quality === "observed" && result.box) {
      profile.seedPixels = profile.measurement?.pixels ?? 0;
      profile.area =
        (result.box.right - result.box.left) *
        image.width *
        (result.box.bottom - result.box.top) *
        image.height;
      return profile;
    }
  }
  return null;
}
export function measureNativePalette(
  image: Pixels,
  profile: NativePalette,
  grounding = false,
): ObjectDetection {
  const unknown = (): ObjectDetection => ({
    objectId: profile.objectId,
    quality: "ambiguous",
    box: null,
    score: null,
  });
  profile.partialIdentity = undefined;
  if (profile.lost) return unknown();
  const mask = new Uint8Array(image.width * image.height),
    blobs: {
      count: number;
      error: number;
      x: number;
      y: number;
      left: number;
      top: number;
      right: number;
      bottom: number;
    }[] = [];
  const radius = grounding
    ? Math.max(25, Math.sqrt(profile.area || 10000))
    : 64;
  const x0 = grounding
      ? Math.max(0, Math.floor(profile.seedBox.left * image.width))
      : Math.max(0, Math.floor(profile.last.x - radius)),
    x1 = grounding
      ? Math.min(image.width, Math.ceil(profile.seedBox.right * image.width))
      : Math.min(image.width, Math.ceil(profile.last.x + radius));
  const y0 = grounding
      ? Math.max(0, Math.floor(profile.seedBox.top * image.height))
      : Math.max(0, Math.floor(profile.last.y - radius)),
    y1 = grounding
      ? Math.min(image.height, Math.ceil(profile.seedBox.bottom * image.height))
      : Math.min(image.height, Math.ceil(profile.last.y + radius));
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++)
      if (distance(pixel(image, x, y), profile.colour) <= 45)
        mask[y * image.width + x] = 1;
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      const start = y * image.width + x;
      if (!mask[start]) continue;
      const queue = [start];
      mask[start] = 0;
      const blob = {
        count: 0,
        error: 0,
        x: 0,
        y: 0,
        left: x,
        top: y,
        right: x,
        bottom: y,
      };
      for (let n = 0; n < queue.length; n++) {
        const i = queue[n],
          xx = i % image.width,
          yy = Math.floor(i / image.width);
        blob.count++;
        blob.error += distance(pixel(image, xx, yy), profile.colour);
        blob.x += xx;
        blob.y += yy;
        blob.left = Math.min(blob.left, xx);
        blob.top = Math.min(blob.top, yy);
        blob.right = Math.max(blob.right, xx);
        blob.bottom = Math.max(blob.bottom, yy);
        for (const [nx, ny] of [
          [xx - 1, yy],
          [xx + 1, yy],
          [xx, yy - 1],
          [xx, yy + 1],
        ]) {
          if (nx < x0 || nx >= x1 || ny < y0 || ny >= y1) continue;
          const next = ny * image.width + nx;
          if (mask[next]) {
            mask[next] = 0;
            queue.push(next);
          }
        }
      }
      if (blob.count >= 30) blobs.push(blob);
    }
  blobs.sort((a, b) => b.count - a.count);
  const best = blobs[0];
  if (!best || (blobs[1] && blobs[1].count > best.count * 0.2)) {
    profile.lost = !grounding;
    return unknown();
  }
  const area = (best.right - best.left + 1) * (best.bottom - best.top + 1),
    aspect = (best.right - best.left + 1) / (best.bottom - best.top + 1);
  profile.measurement = { error: best.error / best.count, pixels: best.count };
  const score = 1 - best.error / best.count / 255;
  if (score < 0.9) {
    profile.lost = !grounding;
    return unknown();
  }
  const clipped =
    best.left === 0 ||
    best.top === 0 ||
    best.right === image.width - 1 ||
    best.bottom === image.height - 1;
  const shapeChanged =
    !grounding &&
    (area < profile.area * 0.55 ||
      area > profile.area * 1.8 ||
      aspect < profile.aspect * 0.55 ||
      aspect > profile.aspect * 1.8);
  if (clipped || shapeChanged) {
    // A continuously visible distinctive body may preserve identity while its
    // full geometry is obstructed. It NEVER supplies endpoint coordinates.
    if (
      !grounding &&
      best.count >= profile.seedPixels * 0.45 &&
      best.count <= profile.seedPixels * 1.8
    ) {
      profile.last = { x: best.x / best.count, y: best.y / best.count };
      profile.partialIdentity = {
        score,
        visibleFraction: Math.min(1, best.count / profile.seedPixels),
      };
      return {
        objectId: profile.objectId,
        quality: "obstructed",
        box: null,
        score: null,
      };
    }
    profile.lost = !grounding;
    return unknown();
  }
  profile.last = { x: best.x / best.count, y: best.y / best.count };
  return {
    objectId: profile.objectId,
    quality: "observed",
    score,
    box: {
      left: best.left / image.width,
      top: best.top / image.height,
      right: (best.right + 1) / image.width,
      bottom: (best.bottom + 1) / image.height,
    },
  };
}
