import type { Box, ObjectDetection } from "../guide/schema";
import type { RelationPlan } from "../guide/relations";
/** A local geometric warning, never a semantic verification or success event. */
export function outsidePlacementTarget(
  step: RelationPlan["steps"][number],
  baseline: ObjectDetection[],
  current: ObjectDetection[],
) {
  if (step.after !== "supported_by") return false;
  const get = (list: ObjectDetection[], id: string) =>
    list.find((d) => d.objectId === id && d.quality === "observed")?.box;
  const object = get(current, step.objectId),
    target = get(current, step.anchorId);
  const before = get(baseline, step.objectId),
    priorTarget = get(baseline, step.anchorId);
  if (!object || !target || !before || !priorTarget) return false;
  const point = (b: Box, a: Box) => ({
    x: ((b.left + b.right) / 2 - a.left) / (a.right - a.left),
    y: (b.bottom - a.top) / (a.bottom - a.top),
  });
  const a = point(before, priorTarget),
    b = point(object, target);
  const moved = Math.hypot(a.x - b.x, a.y - b.y) > 0.35;
  // Only clearly outside the visible target extent. Being inside is NOT proof
  // of contact, support, orientation or successful placement.
  return moved && (b.x < -0.1 || b.x > 1.1 || b.y < -0.1 || b.y > 1.1);
}
