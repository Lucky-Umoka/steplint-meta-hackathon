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

/**
 * Live setup from SAM boxes (owner physical-camera root cause, 2026-11-04):
 * Practice must calibrate on what is in front of the learner's camera now,
 * not on the Teach recording's pixels. Objects take SAM's live boxes; every
 * approved zone moves with the object it belongs to in Teach (the fixed
 * object whose Teach box contains the zone centre, else the one it overlaps
 * most, else the mover that starts in it), keeping its relative position and
 * size inside that object's box. Returns null when any object is missing.
 */
export function liveSetup(
  input: {
    /** `name`: the approved component's short noun ("blue towel"). */
    objects: { id: string; teach: Box; fixed: boolean; name?: string }[];
    live: Record<string, Box | null | undefined>;
    /** `description`: the approved zone text ("Area covering blue towel"). */
    zones: { zoneId: string; region: Box; description?: string }[];
  },
  onIssue: (issue: string) => void = () => {},
): { objects: { id: string; box: Box; fixed: boolean }[]; zones: Record<string, Box> } | null {
  const objects = input.objects.map((o) => ({ ...o, box: input.live[o.id] ?? null }));
  if (objects.some((o) => !o.box)) {
    onIssue("an approved object was not found in the camera view");
    return null;
  }
  const anchors = new Map<string, string>();
  const inside = (b: Box, x: number, y: number) =>
    x >= b.left && x <= b.right && y >= b.top && y <= b.bottom;
  const overlap = (a: Box, b: Box) =>
    Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) *
    Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const zones: Record<string, Box> = {};
  for (const { zoneId, region } of input.zones) {
    const cx = (region.left + region.right) / 2,
      cy = (region.top + region.bottom) / 2;
    const fixed = objects.filter((o) => o.fixed);
    const centreDistance = (o: { teach: Box }) =>
      Math.hypot(
        (o.teach.left + o.teach.right) / 2 - cx,
        (o.teach.top + o.teach.bottom) / 2 - cy,
      );
    // The mover is never an anchor when the lesson has supports: anchoring a
    // zone to the bowl places the START zone wherever the bowl is now (owner:
    // "Practice started at the final goal"). Zones belong to the support that
    // contains them, else overlaps them most, else the nearest support.
    // Explicit approved binding first (owner physical-camera root cause,
    // 2026-11-04): "zone-blue-towel / Area covering blue towel" belongs to
    // the support named "blue towel". Teach-box geometry alone attached BOTH
    // zones to the black mat, so the bowl on the real towel was outside every
    // zone ("I can't see the bowl") and the bowl on the mat counted as the
    // starting position.
    const named = namedSupport(fixed, `${zoneId} ${input.zones.find((z) => z.zoneId === zoneId)?.description ?? ""}`);
    const anchor = fixed.length
      ? (named ??
        fixed.find((o) => inside(o.teach, cx, cy)) ??
        [...fixed]
          .filter((o) => overlap(o.teach, region) > 0)
          .sort((a, b) => overlap(b.teach, region) - overlap(a.teach, region))[0] ??
        [...fixed].sort((a, b) => centreDistance(a) - centreDistance(b))[0])
      : // No supports at all: relative to the nearest object (best effort).
        [...objects].sort((a, b) => centreDistance(a) - centreDistance(b))[0];
    if (!anchor) {
      onIssue(`zone ${zoneId} has no object to attach to`);
      return null;
    }
    // Two approved zones on ONE physical support would have to be invented
    // by cutting its box in two; that is not evidence. Refuse the setup.
    const shared = anchor.fixed
      ? [...anchors].find(([, id]) => id === anchor.id)?.[0]
      : undefined;
    if (shared) {
      onIssue(`zones ${shared} and ${zoneId} both attach to ${anchor.name ?? anchor.id}; refusing to split one object into two zones`);
      return null;
    }
    anchors.set(zoneId, anchor.id);
    // A zone on a supporting object ("on the towel", "on the mat") is that
    // object's whole live box: the camera's angle differs from Teach, so a
    // small Teach-relative patch lands on the wrong part of the surface.
    if (anchor.fixed) {
      zones[zoneId] = { ...anchor.box! };
      continue;
    }
    const t = anchor.teach,
      l = anchor.box!;
    const sx = (l.right - l.left) / (t.right - t.left),
      sy = (l.bottom - l.top) / (t.bottom - t.top);
    const box = {
      left: l.left + (region.left - t.left) * sx,
      top: l.top + (region.top - t.top) * sy,
      right: l.left + (region.right - t.left) * sx,
      bottom: l.top + (region.bottom - t.top) * sy,
    };
    zones[zoneId] = {
      left: Math.max(0, box.left),
      top: Math.max(0, box.top),
      right: Math.min(1, box.right),
      bottom: Math.min(1, box.bottom),
    };
  }
  // Supports placed close together (towel next to mat) can overlap; zones
  // must not, so overlapping zones are split at the middle of the overlap.
  const ids = Object.keys(zones);
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = zones[ids[i]],
        b = zones[ids[j]];
      const ox = Math.min(a.right, b.right) - Math.max(a.left, b.left),
        oy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
      if (ox <= 0 || oy <= 0) continue;
      const acx = (a.left + a.right) / 2,
        bcx = (b.left + b.right) / 2,
        acy = (a.top + a.bottom) / 2,
        bcy = (b.top + b.bottom) / 2;
      if (Math.abs(acx - bcx) >= Math.abs(acy - bcy)) {
        const mid = (Math.max(a.left, b.left) + Math.min(a.right, b.right)) / 2;
        if (acx < bcx) { a.right = Math.min(a.right, mid - 0.005); b.left = Math.max(b.left, mid + 0.005); }
        else { b.right = Math.min(b.right, mid - 0.005); a.left = Math.max(a.left, mid + 0.005); }
      } else {
        const mid = (Math.max(a.top, b.top) + Math.min(a.bottom, b.bottom)) / 2;
        if (acy < bcy) { a.bottom = Math.min(a.bottom, mid - 0.005); b.top = Math.max(b.top, mid + 0.005); }
        else { b.bottom = Math.min(b.bottom, mid - 0.005); a.top = Math.max(a.top, mid + 0.005); }
      }
    }
  if (ids.some((id) => zones[id].right <= zones[id].left || zones[id].bottom <= zones[id].top)) {
    onIssue("two supports overlap so much that their zones cannot be separated");
    return null;
  }
  return { objects: objects.map(({ id, box, fixed }) => ({ id, box: box!, fixed })), zones };
}

const words = (text: string) =>
  new Set(text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3));
/**
 * The one support whose approved name appears in the zone's id/description
 * (every word of the name), or null when none or several do.
 */
export function namedSupport<T extends { name?: string }>(
  supports: T[],
  zoneText: string,
): T | null {
  const zone = words(zoneText);
  const hits = supports.filter((o) => {
    const name = [...words(o.name ?? "")];
    return name.length > 0 && name.every((w) => zone.has(w));
  });
  return hits.length === 1 ? hits[0] : null;
}

/** Most textured patch not overlapping any object: the camera-motion anchor. */
export function chooseWorkspace(image: Pixels, avoid: Box[]): Box | null {
  // Prefer the band above the objects and away from the side edges, where
  // the learner's arms and body enter (owner camera: arm at the right edge).
  const topOfObjects = avoid.length ? Math.min(...avoid.map((a) => a.top)) : 1;
  const preferred = (box: Box) =>
    box.bottom <= topOfObjects - 0.02 && box.left >= 0.18 && box.right <= 0.82;
  let best: { box: Box; score: number } | null = null;
  const size = 0.14;
  for (let top = 0.02; top + size <= 0.98; top += 0.04)
    for (let left = 0.02; left + size <= 0.98; left += 0.04) {
      const box = { left, top, right: left + size, bottom: top + size };
      if (avoid.some((a) => !(box.right < a.left - 0.03 || box.left > a.right + 0.03 || box.bottom < a.top - 0.03 || box.top > a.bottom + 0.03)))
        continue;
      let n = 0,
        sum = 0,
        sq = 0;
      for (let y = Math.floor(top * image.height); y < (top + size) * image.height; y += 2)
        for (let x = Math.floor(left * image.width); x < (left + size) * image.width; x += 2) {
          const i = (y * image.width + x) * 4;
          const v = (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
          n++;
          sum += v;
          sq += v * v;
        }
      const sd = Math.sqrt(Math.max(0, sq / n - (sum / n) ** 2));
      // Preferred placement wins whenever it has usable texture.
      const score = sd + (preferred(box) && sd >= 8 ? 1000 : 0);
      if (!best || score > best.score) best = { box, score };
    }
  return best && best.score % 1000 >= 8 ? best.box : null;
}
