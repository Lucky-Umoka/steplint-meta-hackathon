/** Controlled-scene colour segmentation; no model calls or mechanical-state inference. */
export type Point = { x: number; y: number };
export type ColourProfile = { componentId: string; hue: number; area: number };
export type Detection = { componentId: string; quality: "observed" | "missing" | "ambiguous" | "obstructed"; center: Point | null; score: number | null; reason: string };
export type Pixels = { data: Uint8ClampedArray; width: number; height: number };
export function hsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  let hue = delta === 0 ? 0 : max === r ? 60 * (((g - b) / delta) % 6) : max === g ? 60 * ((b - r) / delta + 2) : 60 * ((r - g) / delta + 4);
  if (hue < 0) hue += 360;
  return { hue, saturation: max === 0 ? 0 : delta / max, value: max / 255 };
}
export const hueDistance = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));
function blobs(image: Pixels, hue: number) {
  const { width, height, data } = image;
  if (width < 1 || height < 1 || width * height > 320 * 240 || data.length !== width * height * 4) throw new Error("Invalid bounded tracking frame.");
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) {
    const c = hsv(data[i * 4], data[i * 4 + 1], data[i * 4 + 2]);
    if (c.saturation >= 0.4 && c.value >= 0.18 && hueDistance(c.hue, hue) <= 18) mask[i] = 1;
  }
  const found: { count: number; x: number; y: number; border: boolean; colourScore: number }[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const queue = [i]; mask[i] = 0;
    let x = 0, y = 0, border = false, totalDistance = 0;
    for (let k = 0; k < queue.length; k++) {
      const p = queue[k], px = p % width, py = Math.floor(p / width);
      x += px; y += py; border ||= px === 0 || py === 0 || px === width - 1 || py === height - 1;
      totalDistance += hueDistance(hsv(data[p * 4], data[p * 4 + 1], data[p * 4 + 2]).hue, hue);
      const neighbours = [px > 0 ? p - 1 : -1, px < width - 1 ? p + 1 : -1, py > 0 ? p - width : -1, py < height - 1 ? p + width : -1];
      for (const next of neighbours) if (next >= 0 && mask[next]) { mask[next] = 0; queue.push(next); }
    }
    if (queue.length >= 8) found.push({ count: queue.length, x: x / queue.length / width, y: y / queue.length / height, border, colourScore: 1 - totalDistance / queue.length / 180 });
  }
  return found.sort((a, b) => b.count - a.count);
}
export function groundColour(image: Pixels, componentId: string, point: Point, existing: ColourProfile[]): ColourProfile {
  const x = Math.floor(point.x * image.width), y = Math.floor(point.y * image.height);
  if (x < 1 || y < 1 || x >= image.width - 1 || y >= image.height - 1) throw new Error("Sample inside the component, away from the frame edge.");
  let sin = 0, cos = 0;
  for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) {
    const i = (yy * image.width + xx) * 4, c = hsv(image.data[i], image.data[i + 1], image.data[i + 2]);
    if (c.saturation < 0.4 || c.value < 0.18) throw new Error("Use a well-lit, solid, saturated colour patch.");
    sin += Math.sin(c.hue * Math.PI / 180); cos += Math.cos(c.hue * Math.PI / 180);
  }
  const hue = (Math.atan2(sin, cos) * 180 / Math.PI + 360) % 360;
  if (existing.some((p) => p.componentId !== componentId && hueDistance(p.hue, hue) < 40)) throw new Error("Components must have clearly different colours. Reposition or use distinctive markers.");
  const found = blobs(image, hue), first = found[0];
  if (!first || first.border || found[1]?.count >= first.count * 0.2 || Math.hypot(first.x - point.x, first.y - point.y) > 0.12) throw new Error("Cannot uniquely ground that component. Remove similar colours and sample its centre.");
  return { componentId, hue, area: first.count };
}
export function trackColour(image: Pixels, profile: ColourProfile): Detection {
  const found = blobs(image, profile.hue), first = found[0];
  const fail = (quality: Detection["quality"], reason: string): Detection => ({ componentId: profile.componentId, quality, center: null, score: null, reason });
  if (!first) return fail("missing", "Tracking lost or component missing. Restore visibility and return to the starting zone.");
  if (found[1]?.count >= first.count * 0.2) return fail("ambiguous", "Multiple similar-colour regions. Remove distractors and recalibrate.");
  const ratio = first.count / profile.area;
  if (first.border || ratio < 0.8 || ratio > 1.2) return fail("obstructed", "Component clipped, obstructed or changed apparent size. Restore the fixed view or recalibrate.");
  return { componentId: profile.componentId, quality: "observed", center: { x: first.x, y: first.y }, score: Math.min(0.99, ratio, 1 / ratio, first.colourScore), reason: "Local colour/area quality score; not a probability of action correctness." };
}
