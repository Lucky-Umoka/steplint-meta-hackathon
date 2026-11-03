import type { Box } from "../guide/schema";
import type { Pixels } from "./tracker";
import { groundOverlay, trackOverlay } from "./appearance-overlay";
const overlaps = (a: Box, b: Box) =>
  Math.max(a.left, b.left) < Math.min(a.right, b.right) &&
  Math.max(a.top, b.top) < Math.min(a.bottom, b.bottom);
const center = (box: Box) => ({
  x: (box.left + box.right) / 2,
  y: (box.top + box.bottom) / 2,
});
export function translateBox(box: Box, x: number, y: number): Box {
  const result = {
    left: box.left + x,
    right: box.right + x,
    top: box.top + y,
    bottom: box.bottom + y,
  };
  if (
    result.left < 0 ||
    result.top < 0 ||
    result.right > 1 ||
    result.bottom > 1
  )
    throw Error(
      "The approved work area is outside the camera view. Show the full starting view.",
    );
  return result;
}
/** Automatic translation is accepted only from three distinctive, separated
 * stationary patches agreeing on the same measured transform. No geometry is guessed. */
export function alignStartingView(
  source: Pixels,
  current: Pixels,
  excluded: Box[],
) {
  if (source.width !== current.width || source.height !== current.height)
    throw Error(
      "Show the same workbench framing as the demonstration. This view has a different aspect ratio.",
    );
  const matches: { source: Box; observed: Box; x: number; y: number }[] = [];
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 7; col++) {
      const box = {
        left: 0.025 + col * 0.135,
        top: 0.025 + row * 0.19,
        right: 0.115 + col * 0.135,
        bottom: 0.145 + row * 0.19,
      };
      if (excluded.some((other) => overlaps(box, other))) continue;
      const profile = groundOverlay(source, "workspace", box);
      if (
        trackOverlay(source, profile, { multiscale: false, retainFraction: 1 })
          .quality !== "observed"
      )
        continue;
      const detection = trackOverlay(current, profile, {
        multiscale: false,
        retainFraction: 1,
        exhaustiveTranslation: true,
      });
      if (detection.quality !== "observed" || !detection.box) continue;
      const a = center(box),
        b = center(detection.box);
      const candidate = {
        source: box,
        observed: detection.box,
        x: b.x - a.x,
        y: b.y - a.y,
      };
      matches.push(candidate);
      const consistent = matches.filter(
        (match) =>
          Math.hypot(match.x - candidate.x, match.y - candidate.y) <= 0.01,
      );
      for (const p of consistent)
        for (const q of consistent)
          for (const r of consistent) {
            const a = center(p.source),
              b = center(q.source),
              c = center(r.source);
            if (
              Math.abs((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x)) <
              0.08
            )
              continue;
            const chosen = [p, q, r],
              x = chosen.reduce((sum, m) => sum + m.x, 0) / 3,
              y = chosen.reduce((sum, m) => sum + m.y, 0) / 3;
            return { x, y, workspace: p.observed };
          }
    }
  throw Error(
    "Finding the demonstrated work area. Keep the camera steady and show the starting view, including clear table features.",
  );
}

/** Once object anchors establish scene geometry, a new table may supply its
 * own stationary reference. It is never used to guess the target layout. */
export function chooseLiveWorkspace(image: Pixels, excluded: Box[]) {
  for (let row = 0; row < 5; row++)
    for (let col = 0; col < 7; col++) {
      const box = {
        left: 0.025 + col * 0.135,
        top: 0.025 + row * 0.19,
        right: 0.115 + col * 0.135,
        bottom: 0.145 + row * 0.19,
      };
      if (excluded.some((other) => overlaps(box, other))) continue;
      const profile = groundOverlay(image, "workspace", box);
      if (
        trackOverlay(image, profile, { multiscale: false, retainFraction: 1 })
          .quality === "observed"
      )
        return box;
    }
  throw Error(
    "Show a clear stationary feature outside the movement area so camera motion can be monitored.",
  );
}
/** How far one stationary reference may be placed from the shared shift. */
export const MAX_INDEPENDENT_PLACEMENT = 0.1;
/**
 * Camera shift from approved stationary references matched in the live view.
 * Each anchor already passed the approved template match (competing-candidate
 * separation, 0.9 score, no rescaling). Owner decision 2026-11-03: references
 * are placed by hand, so each approved zone follows its own reference; the
 * shared camera shift is their median. A reference further than
 * MAX_INDEPENDENT_PLACEMENT from that shift blocks with an instruction
 * (likely rotation, zoom or a badly placed object). Null when none matched.
 */
export function alignFixedObjects(anchors: { source: Box; observed: Box }[]) {
  if (!anchors.length) return null;
  const shifts = anchors.map((anchor) => ({
    dx: center(anchor.observed).x - center(anchor.source).x,
    dy: center(anchor.observed).y - center(anchor.source).y,
  }));
  const median = (values: number[]) => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2
      ? sorted[mid]
      : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const x = median(shifts.map((s) => s.dx)),
    y = median(shifts.map((s) => s.dy));
  if (
    shifts.some(
      (s) => Math.hypot(s.dx - x, s.dy - y) > MAX_INDEPENDENT_PLACEMENT,
    )
  )
    throw Error(
      "A stationary reference is far from its demonstrated position, or the camera is rotated, tilted or zoomed. Place the objects roughly as demonstrated and restore the camera view.",
    );
  return { x, y, shifts };
}
