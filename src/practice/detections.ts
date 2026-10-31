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
export function percentile(xs: number[], p: number) {
  if (!xs.length) return 0;
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted[
    Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  ];
}
