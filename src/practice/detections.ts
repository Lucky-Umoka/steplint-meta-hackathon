import type { ObjectDetection } from "../guide/schema";
const detectionKey = (d: ObjectDetection) =>
  `${d.objectId}|${d.quality}|${
    d.box
      ? [d.box.left, d.box.top, d.box.right, d.box.bottom]
          .map((v) => v.toFixed(2))
          .join(",")
      : ""
  }|${d.score === null ? "" : d.score.toFixed(2)}`;
/** Skip overlay re-renders when nothing the learner can see actually changed. */
export function sameDetections(a: ObjectDetection[], b: ObjectDetection[]) {
  return (
    a.length === b.length &&
    a.every((d, i) => detectionKey(d) === detectionKey(b[i]))
  );
}
/** Median uses the usual middle-pair average; other percentiles use the
 * nearest-rank convention. These are sample statistics, not guarantees. */
export function percentile(xs: number[], p: number) {
  if (
    !Number.isFinite(p) ||
    p < 0 ||
    p > 100 ||
    xs.some((x) => !Number.isFinite(x))
  )
    throw Error(
      "Percentile inputs must be finite and the percentile between 0 and 100.",
    );
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  if (p === 50) {
    const m = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
  }
  return sorted[
    Math.max(
      0,
      Math.min(sorted.length - 1, Math.ceil((p * sorted.length) / 100) - 1),
    )
  ];
}
